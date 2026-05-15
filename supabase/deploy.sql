-- ============================================
-- AA Computer - Combined Deployment Script
-- Executes all 7 migrations in order
-- Run this in Supabase Studio SQL Editor
-- ============================================

-- ============================================
-- Migration 1: Initial Schema
-- ============================================

-- 1. Tables
create table if not exists rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  created_at  timestamptz not null default now(),
  settings    jsonb not null default '{}',
  version     integer not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists room_members (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references rooms(id) on delete cascade,
  user_id        text not null,
  name           text not null,
  is_unsubmitted boolean not null default false,
  created_at     timestamptz not null default now(),
  unique(room_id, user_id)
);

create table if not exists bills (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references rooms(id) on delete cascade,
  content      text not null,
  amount       numeric(12,2) not null,
  paid_at      timestamptz not null default now(),
  shared_by    uuid[] not null default '{}',
  created_by   uuid not null references room_members(id),
  creator_name text not null,
  created_at   timestamptz not null default now()
);

create table if not exists aa_results (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  version       integer not null,
  results       jsonb not null,
  calculated_at timestamptz not null default now(),
  unique(room_id)
);

-- 2. Indexes
create index if not exists idx_room_members_room_id on room_members(room_id);
create index if not exists idx_room_members_user_id on room_members(user_id);
create index if not exists idx_bills_room_id on bills(room_id);
create index if not exists idx_bills_created_at on bills(room_id, created_at desc);
create index if not exists idx_bills_paid_at on bills(room_id, paid_at desc);
create index if not exists idx_bills_created_by on bills(created_by);

-- 3. Security definer function to prevent RLS recursion
create or replace function is_member_of_room(p_room_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from room_members rm
    where rm.room_id = p_room_id
    and rm.user_id = auth.uid()::text
  );
$$;

-- 4. Row Level Security
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table bills enable row level security;
alter table aa_results enable row level security;

-- rooms
drop policy if exists "rooms_select" on rooms;
drop policy if exists "rooms_insert" on rooms;
drop policy if exists "rooms_update" on rooms;
drop policy if exists "rooms_delete" on rooms;

create policy "rooms_select" on rooms
  for select using (is_member_of_room(id));

create policy "rooms_insert" on rooms
  for insert with check (true);

create policy "rooms_update" on rooms
  for update using (is_member_of_room(id));

create policy "rooms_delete" on rooms
  for delete using (is_member_of_room(id));

-- room_members
drop policy if exists "room_members_select" on room_members;
drop policy if exists "room_members_insert" on room_members;
drop policy if exists "room_members_update" on room_members;
drop policy if exists "room_members_delete" on room_members;

create policy "room_members_select" on room_members
  for select using (
    user_id = auth.uid()::text or is_member_of_room(room_id)
  );

create policy "room_members_insert" on room_members
  for insert with check (user_id = auth.uid()::text);

create policy "room_members_update" on room_members
  for update using (user_id = auth.uid()::text);

create policy "room_members_delete" on room_members
  for delete using (user_id = auth.uid()::text);

-- bills
drop policy if exists "bills_select" on bills;
drop policy if exists "bills_insert" on bills;

create policy "bills_select" on bills
  for select using (is_member_of_room(room_id));

create policy "bills_insert" on bills
  for insert with check (is_member_of_room(room_id));

-- aa_results
drop policy if exists "aa_results_select" on aa_results;
drop policy if exists "aa_results_insert" on aa_results;
drop policy if exists "aa_results_update" on aa_results;

create policy "aa_results_select" on aa_results
  for select using (is_member_of_room(room_id));

create policy "aa_results_insert" on aa_results
  for insert with check (is_member_of_room(room_id));

create policy "aa_results_update" on aa_results
  for update using (is_member_of_room(room_id));

-- 5. calculate_aa function (initial version, will be replaced by migration 4)
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

-- 6. Cleanup function: delete rooms not updated in 7 days
create or replace function cleanup_expired_rooms()
returns void
language plpgsql
security definer
as $$
begin
  delete from rooms where updated_at < now() - interval '7 days';
end;
$$;

-- ============================================
-- Migration 5: get_room_info function
-- ============================================
create or replace function get_room_info(p_room_id uuid)
returns jsonb
language sql
security definer
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

-- ============================================
-- Migration 6: update_bill + delete_bill functions
-- ============================================
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

-- ============================================
-- Migration 7: Length constraints
-- ============================================
ALTER TABLE rooms ALTER COLUMN name TYPE varchar(20);
ALTER TABLE room_members ALTER COLUMN name TYPE varchar(20);
ALTER TABLE bills ALTER COLUMN content TYPE varchar(80);
ALTER TABLE bills ALTER COLUMN creator_name TYPE varchar(20);

-- ============================================
-- Migration 8: Cleanup orphan anonymous users
-- ============================================
create or replace function cleanup_orphan_anonymous_users()
returns void
language plpgsql
security definer
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
