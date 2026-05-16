-- Fix security advisory: set search_path on all security definer functions
-- Without an explicit search_path, functions could be hijacked if an
-- attacker can create objects in the public schema.

create or replace function is_member_of_room(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = 'public'
stable
as $$
  select exists (
    select 1 from room_members rm
    where rm.room_id = p_room_id
    and rm.user_id = auth.uid()::text
  );
$$;

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
        sum(b.amount) filter (where b.created_by = rm.id),
        0
      ) as total_paid,
      coalesce(
        sum(b.amount) / cardinality(b.shared_by) filter (where rm.id = any(b.shared_by)),
        0
      ) as total_share
    from room_members rm
    left join bills b on b.room_id = rm.room_id
      and not (cardinality(b.shared_by) = 1 and b.created_by = b.shared_by[1])
    where rm.room_id = p_room_id
    group by rm.id, rm.name
  ),
  net_positions as (
    select
      member_id,
      name,
      total_paid,
      total_share,
      total_paid - total_share as net
    from member_totals
  )
  select jsonb_build_object(
    'members', coalesce(jsonb_agg(
      jsonb_build_object(
        'member_id', member_id,
        'name', name,
        'total_paid', total_paid,
        'total_share', total_share,
        'net', net
      )
      order by name
    ), '[]'::jsonb)
  )
  into v_members
  from net_positions;

  -- Greedy pairing
  with pos as (
    select member_id, name, net
    from net_positions
    where net > 0
    order by net desc
  ),
  neg as (
    select member_id, name, -net as net
    from net_positions
    where net < 0
    order by net asc
  ),
  pairs as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'from_member_id', n.member_id,
            'from_name', n.name,
            'to_member_id', p.member_id,
            'to_name', p.name,
            'amount', least(p.net, n.net)
          )
          order by p.net desc, n.net asc
        )
        filter (where p.net > 0 and n.net > 0),
        '[]'::jsonb
      ) as transfers
    from pos p, neg n
    where not exists (
      select 1 from pos p2 where p2.member_id != p.member_id and p2.net > p.net
        and not exists (select 1 from neg n2 where n2.member_id != n.member_id and n2.net < n.net)
    )
  )
  select coalesce(transfers, '[]'::jsonb) into v_transfers from pairs;

  insert into aa_results (room_id, version, results)
  values (
    p_room_id,
    v_room_version,
    jsonb_build_object('members', v_members, 'transfers', v_transfers)
  )
  on conflict (room_id)
  do update set
    version = excluded.version,
    results = excluded.results,
    calculated_at = now();

  return jsonb_build_object(
    'version', v_room_version,
    'results', jsonb_build_object('members', v_members, 'transfers', v_transfers)
  );
end;
$$;

create or replace function cleanup_expired_rooms()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  delete from rooms where updated_at < now() - interval '7 days';
end;
$$;

create or replace function get_room_info(p_room_id uuid)
returns jsonb
language sql
security definer
set search_path = 'public'
stable
as $$
  select jsonb_build_object(
    'name', r.name,
    'description', r.description,
    'creator_name', (
      select rm.name from room_members rm
      where rm.room_id = r.id
      order by rm.created_at
      limit 1
    ),
    'member_names', (
      select jsonb_agg(rm.name order by rm.created_at)
      from room_members rm
      where rm.room_id = r.id
    )
  )
  from rooms r
  where r.id = p_room_id;
$$;

create or replace function update_bill(
  p_bill_id uuid,
  p_room_id uuid,
  p_content text,
  p_amount numeric,
  p_paid_at timestamptz,
  p_shared_by uuid[],
  p_creator_name text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not exists (select 1 from room_members where room_id = p_room_id and user_id = auth.uid()::text) then
    raise exception 'Not a member of this room';
  end if;

  update bills
  set content = p_content,
      amount = p_amount,
      paid_at = p_paid_at,
      shared_by = p_shared_by,
      creator_name = p_creator_name
  where id = p_bill_id and room_id = p_room_id;

  update rooms
  set version = version + 1,
      updated_at = now()
  where id = p_room_id;
end;
$$;

create or replace function delete_bill(
  p_bill_id uuid,
  p_room_id uuid
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not exists (select 1 from room_members where room_id = p_room_id and user_id = auth.uid()::text) then
    raise exception 'Not a member of this room';
  end if;

  delete from bills
  where id = p_bill_id and room_id = p_room_id;

  update rooms
  set version = version + 1,
      updated_at = now()
  where id = p_room_id;
end;
$$;

create or replace function cleanup_orphan_anonymous_users()
returns void
language plpgsql
security definer
set search_path = 'public, auth'
as $$
begin
  delete from auth.users
  where is_anonymous = true
    and not exists (
      select 1 from public.room_members
      where room_members.user_id = auth.users.id::text
    );
end;
$$;
