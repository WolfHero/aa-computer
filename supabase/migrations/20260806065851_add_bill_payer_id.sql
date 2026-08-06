-- Separate bill creator (created_by, immutable record creator) from payer
-- (payer_id, editable only by the bill creator; choices are self or unbound members).

-- 1. Column + backfill + index
alter table bills add column payer_id uuid references room_members(id);
update bills set payer_id = created_by where payer_id is null;
alter table bills alter column payer_id set not null;
create index idx_bills_payer_id on bills(payer_id);

-- 2. calculate_aa: settle by payer instead of creator
create or replace function calculate_aa(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
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
        sum(b.amount) filter (
          where b.payer_id = rm.id
            and not (cardinality(b.shared_by) = 1 and b.payer_id = b.shared_by[1])
        ),
        0
      ) as total_paid,
      coalesce(
        sum(b.amount / (select cardinality(b.shared_by))) filter (
          where rm.id = any(b.shared_by)
            and not (cardinality(b.shared_by) = 1 and b.payer_id = b.shared_by[1])
        ),
        0
      ) as total_share,
      coalesce(
        sum(b.amount) filter (
          where b.payer_id = rm.id
            and cardinality(b.shared_by) = 1
            and b.payer_id = b.shared_by[1]
        ),
        0
      ) as self_pay
    from room_members rm
    left join bills b on b.room_id = rm.room_id
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

-- 3. update_bill: support changing payer, creator-only + self/unbound validation
create or replace function update_bill(
  p_bill_id uuid,
  p_room_id uuid,
  p_content text,
  p_amount numeric,
  p_paid_at timestamptz,
  p_shared_by uuid[],
  p_payer_id uuid,
  p_creator_name text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_member uuid;
  v_current_payer uuid;
begin
  select id into v_caller_member
  from room_members
  where room_id = p_room_id and user_id = auth.uid()::text;
  if not found then
    raise exception 'Not a member of this room';
  end if;

  select payer_id into v_current_payer
  from bills
  where id = p_bill_id and room_id = p_room_id;
  if not found then
    raise exception 'Bill not found';
  end if;

  -- 修改付款人：仅创建人可以，且只能改为自己或未绑定成员
  if p_payer_id is distinct from v_current_payer then
    if not exists (
      select 1 from bills
      where id = p_bill_id and room_id = p_room_id and created_by = v_caller_member
    ) then
      raise exception 'ONLY_CREATOR_CAN_CHANGE_PAYER';
    end if;
    if not exists (
      select 1 from room_members
      where id = p_payer_id and room_id = p_room_id
        and (user_id is null or id = v_caller_member)
    ) then
      raise exception 'INVALID_PAYER';
    end if;
  end if;

  update bills
  set content = p_content,
      amount = p_amount,
      paid_at = p_paid_at,
      shared_by = p_shared_by,
      payer_id = p_payer_id,
      creator_name = p_creator_name
  where id = p_bill_id and room_id = p_room_id;

  update rooms
  set version = version + 1,
      updated_at = now()
  where id = p_room_id;
end;
$$;

-- 4. convert_local_room: upload payer_id (fallback to created_by)
create or replace function convert_local_room(
  p_room_id uuid,
  p_name text,
  p_self_member_id uuid,
  p_members jsonb,
  p_description text default '',
  p_settings jsonb default '{}'::jsonb,
  p_bills jsonb default '[]'::jsonb,
  p_version integer default 1,
  p_created_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_owner_user_id text;
  v_existing_owner text;
  v_member jsonb;
  v_bill jsonb;
  v_member_id uuid;
  v_bill_id uuid;
  v_member_ids jsonb := '{}'::jsonb;
  v_bill_ids jsonb := '{}'::jsonb;
  v_member_set uuid[];
  v_shared_ids uuid[];
  v_payer_id uuid;
begin
  v_owner_user_id := auth.uid()::text;
  if v_owner_user_id is null or v_owner_user_id = '' then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select owner_id into v_existing_owner from rooms where id = p_room_id;
  if found then
    if v_existing_owner = v_owner_user_id then
      return jsonb_build_object('success', true, 'already_converted', true, 'room_id', p_room_id);
    end if;
    raise exception 'ROOM_ID_TAKEN';
  end if;

  if p_members is null or jsonb_array_length(p_members) = 0 then
    raise exception 'EMPTY_MEMBERS';
  end if;
  if p_self_member_id is null then
    raise exception 'MISSING_SELF_MEMBER';
  end if;

  select array_agg((m->>'id')::uuid)
  into v_member_set
  from jsonb_array_elements(p_members) m;

  if not (p_self_member_id = any(v_member_set)) then
    raise exception 'SELF_MEMBER_NOT_IN_ROOM';
  end if;

  insert into rooms (id, name, description, owner_id, version, settings, created_at, updated_at)
  values (p_room_id, p_name, p_description, v_owner_user_id, p_version, p_settings, p_created_at, now());

  for v_member in select * from jsonb_array_elements(p_members) loop
    v_member_id := (v_member->>'id')::uuid;
    insert into room_members (id, room_id, user_id, name, is_unsubmitted, created_at)
    values (
      v_member_id,
      p_room_id,
      case when v_member_id = p_self_member_id then v_owner_user_id else null end,
      coalesce(v_member->>'name', ''),
      coalesce((v_member->>'is_unsubmitted')::boolean, false),
      now()
    );
    v_member_ids := v_member_ids || jsonb_build_object(v_member->>'id', v_member_id::text);
  end loop;

  for v_bill in select * from jsonb_array_elements(coalesce(p_bills, '[]'::jsonb)) loop
    v_bill_id := (v_bill->>'id')::uuid;
    if v_bill_id is null then
      raise exception 'BILL_ID_REQUIRED';
    end if;

    v_payer_id := coalesce((v_bill->>'payer_id')::uuid, (v_bill->>'created_by')::uuid);
    v_shared_ids := (
      select array_agg(x::uuid)
      from jsonb_array_elements_text(v_bill->'shared_by') x
    );

    if (v_bill->>'created_by')::uuid is null
       or not ((v_bill->>'created_by')::uuid = any(v_member_set))
       or v_payer_id is null
       or not (v_payer_id = any(v_member_set))
       or v_shared_ids is null
       or not (v_shared_ids <@ v_member_set) then
      raise exception 'BILL_MEMBER_NOT_IN_ROOM';
    end if;

    insert into bills (id, room_id, content, amount, paid_at, shared_by, created_by, payer_id, creator_name, created_at)
    values (
      v_bill_id,
      p_room_id,
      coalesce(v_bill->>'content', ''),
      coalesce((v_bill->>'amount')::numeric, 0),
      coalesce((v_bill->>'paid_at')::timestamptz, now()),
      v_shared_ids,
      (v_bill->>'created_by')::uuid,
      v_payer_id,
      coalesce(v_bill->>'creator_name', ''),
      coalesce((v_bill->>'created_at')::timestamptz, now())
    );
    v_bill_ids := v_bill_ids || jsonb_build_object(v_bill->>'local_id', v_bill_id::text);
  end loop;

  return jsonb_build_object(
    'success', true,
    'already_converted', false,
    'room_id', p_room_id,
    'member_ids', v_member_ids,
    'bill_ids', v_bill_ids
  );
end;
$$;
