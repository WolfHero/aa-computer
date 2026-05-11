-- Exclude self-pay-self bills from AA calculation
-- A self-pay-self bill is one where created_by is the only member in shared_by

create or replace function calculate_aa(p_room_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_room_version int;
  v_members jsonb;
  v_transfers jsonb;
  v_net_positive jsonb[];
  v_net_negative jsonb[];
  v_settlement numeric;
  v_item jsonb;
  v_from_member jsonb;
  v_to_member jsonb;
  v_to_amount numeric;
begin
  select version into v_room_version from rooms where id = p_room_id;
  if not found then
    raise exception 'Room not found: %', p_room_id;
  end if;

  with member_totals as (
    select
      rm.id as member_id,
      rm.name,
      coalesce(
        sum(b.amount) filter (where b.created_by = rm.id),
        0
      ) as total_paid,
      coalesce(
        sum(b.amount / (select cardinality(b.shared_by)))
        filter (where rm.id = any(b.shared_by)),
        0
      ) as total_share,
      coalesce(
        sum(b_self.amount) filter (where b_self.created_by = rm.id),
        0
      ) as self_pay
    from room_members rm
    left join bills b on b.room_id = rm.room_id
      and not (cardinality(b.shared_by) = 1 and b.created_by = b.shared_by[1])
    left join bills b_self on b_self.room_id = rm.room_id
      and cardinality(b_self.shared_by) = 1
      and b_self.created_by = b_self.shared_by[1]
    where rm.room_id = p_room_id
    group by rm.id, rm.name
  )
  select jsonb_agg(
    jsonb_build_object(
      'member_id', member_id,
      'name', name,
      'total_paid', round(total_paid::numeric, 2),
      'total_share', round(total_share::numeric, 2),
      'net', round((total_paid - total_share)::numeric, 2),
      'self_pay', round(self_pay::numeric, 2)
    )
  ) into v_members
  from member_totals;

  select
    array_agg(elem) filter (where (elem->>'net')::numeric > 0.001),
    array_agg(elem) filter (where (elem->>'net')::numeric < -0.001)
  into v_net_positive, v_net_negative
  from jsonb_array_elements(v_members) as elem;

  v_transfers := '[]'::jsonb;

  if v_net_positive is not null and v_net_negative is not null then
    <<transfer_loop>>
    for i in 1..coalesce(array_length(v_net_negative, 1), 0) loop
      for j in 1..coalesce(array_length(v_net_positive, 1), 0) loop
        continue when (v_net_negative[i]->>'net')::numeric >= 0
                    or (v_net_positive[j]->>'net')::numeric <= 0;

        v_to_amount := least(
          abs((v_net_negative[i]->>'net')::numeric),
          (v_net_positive[j]->>'net')::numeric
        );

        if v_to_amount > 0.001 then
          v_transfers := v_transfers || jsonb_build_object(
            'from_member_id', v_net_negative[i]->>'member_id',
            'from_name', v_net_negative[i]->>'name',
            'to_member_id', v_net_positive[j]->>'member_id',
            'to_name', v_net_positive[j]->>'name',
            'amount', round(v_to_amount, 2)
          );

          v_net_negative[i] := jsonb_set(
            v_net_negative[i], '{net}',
            to_jsonb(round(((v_net_negative[i]->>'net')::numeric + v_to_amount)::numeric, 2))
          );
          v_net_positive[j] := jsonb_set(
            v_net_positive[j], '{net}',
            to_jsonb(round(((v_net_positive[j]->>'net')::numeric - v_to_amount)::numeric, 2))
          );
        end if;
      end loop;
    end loop transfer_loop;
  end if;

  insert into aa_results (room_id, version, results, calculated_at)
  values (
    p_room_id,
    v_room_version,
    jsonb_build_object('members', v_members, 'transfers', v_transfers),
    now()
  )
  on conflict (room_id)
  do update set
    version = v_room_version,
    results = jsonb_build_object('members', v_members, 'transfers', v_transfers),
    calculated_at = now();

  return jsonb_build_object(
    'version', v_room_version,
    'results', jsonb_build_object('members', v_members, 'transfers', v_transfers)
  );
end;
$$;
