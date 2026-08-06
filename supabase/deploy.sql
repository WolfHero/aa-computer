-- ============================================
-- AA Computer - Combined Deployment Script
-- Executes all migrations in order
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
  payer_id     uuid not null references room_members(id),
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
create index if not exists idx_bills_payer_id on bills(payer_id);

-- 3. Security definer function to prevent RLS recursion
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
    user_id = (select auth.uid()::text) or is_member_of_room(room_id)
  );

create policy "room_members_insert" on room_members
  for insert with check (user_id = (select auth.uid()::text));

create policy "room_members_update" on room_members
  for update using (user_id = (select auth.uid()::text));

create policy "room_members_delete" on room_members
  for delete using (user_id = (select auth.uid()::text));

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
set search_path = 'public'
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

-- ============================================
-- Migration 7: Length constraints
-- ============================================
ALTER TABLE rooms ALTER COLUMN name TYPE varchar(20);
ALTER TABLE room_members ALTER COLUMN name TYPE varchar(20);
ALTER TABLE bills ALTER COLUMN content TYPE varchar(80);
ALTER TABLE bills ALTER COLUMN creator_name TYPE varchar(20);

-- ============================================
end;
$$;

-- ============================================
-- Migration 11: Owner support, nullable user_id, invite tokens
-- ============================================

-- 1. rooms: add owner_id
alter table rooms add column owner_id text not null default '';

-- Backfill: set owner_id to the first member's user_id for existing rooms
update rooms r set owner_id = (
  select rm.user_id from room_members rm
  where rm.room_id = r.id
  order by rm.created_at
  limit 1
);

-- 2. room_members: make user_id nullable for placeholder members
alter table room_members alter column user_id drop not null;

-- Replace unique(room_id, user_id) with a partial unique index (only when user_id is not null)
alter table room_members drop constraint room_members_room_id_user_id_key;
create unique index idx_room_members_user_unique on room_members(room_id, user_id) where user_id is not null;

-- Add invite_token column
alter table room_members add column invite_token text;
create unique index idx_room_members_invite_token on room_members(invite_token) where invite_token is not null;

-- 3. Helper function: check if current user is the room owner
create or replace function is_room_owner(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = 'public'
stable
as $$
  select exists (
    select 1 from rooms
    where id = p_room_id
    and owner_id = auth.uid()::text
  );
$$;

-- 4. Update RLS policies for room_members

-- Insert: self-join OR owner adding members
drop policy if exists "room_members_insert" on room_members;
create policy "room_members_insert" on room_members
  for insert with check (
    user_id = (select auth.uid()::text)
    or is_room_owner(room_id)
  );

-- Update: self-update OR owner updating anyone
drop policy if exists "room_members_update" on room_members;
create policy "room_members_update" on room_members
  for update using (
    user_id = (select auth.uid()::text)
    or is_room_owner(room_id)
  );

-- Delete: only owner can delete members
drop policy if exists "room_members_delete" on room_members;
create policy "room_members_delete" on room_members
  for delete using (is_room_owner(room_id));

-- 5. Security definer function: look up member by invite token
create or replace function get_member_by_invite_token(p_token text)
returns jsonb
language sql
security definer
set search_path = 'public'
stable
as $$
  select jsonb_build_object(
    'id', rm.id,
    'name', rm.name,
    'room_id', rm.room_id,
    'room_name', r.name,
    'room_owner_id', r.owner_id,
    'is_bound', rm.user_id is not null,
    'creator_name', (
      select rm2.name from room_members rm2
      where rm2.room_id = r.id
      order by rm2.created_at
      limit 1
    )
  )
  from room_members rm
  join rooms r on r.id = rm.room_id
  where rm.invite_token = p_token;
$$;

-- 6. Security definer function: accept invite (bind user_id)
create or replace function accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_member record;
  v_user_id text;
  v_room_id uuid;
begin
  v_user_id := auth.uid()::text;

  -- Get the member's room_id
  select room_id into v_room_id from room_members where invite_token = p_token;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_token');
  end if;

  -- Check if already a member of this room
  if exists (
    select 1 from room_members
    where room_id = v_room_id and user_id = v_user_id
  ) then
    return jsonb_build_object('success', false, 'error', 'already_member');
  end if;

  -- Bind the member record to the current user
  update room_members
  set user_id = v_user_id, invite_token = null
  where invite_token = p_token and user_id is null
  returning id, name, room_id into v_member;

  if not found then
    return jsonb_build_object('success', false, 'error', 'already_bound');
  end if;

  return jsonb_build_object(
    'success', true,
    'member_id', v_member.id,
    'name', v_member.name,
    'room_id', v_member.room_id
  );
end;
$$;

-- 7. Security definer function: generate invite token for a member
create or replace function generate_member_invite_token(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = 'public, extensions'
as $$
declare
  v_token text;
begin
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') into v_token;
  update room_members set invite_token = v_token where id = p_member_id;
  return v_token;
end;
$$;

-- ============================================
-- Migration 12: Prevent deleting members referenced in bills
-- ============================================

create or replace function check_member_in_bills()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if exists (
    select 1 from bills
    where room_id = old.room_id
    and old.id = any(shared_by)
  ) then
    raise exception '该成员已在账单分摊中，无法删除（请先从账单中移除该成员）';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_check_member_in_bills on room_members;
create trigger trg_check_member_in_bills
  before delete on room_members
  for each row
  execute function check_member_in_bills();

-- Fix AA calculation inflated by a Cartesian product of two bills joins.
--
-- member_totals previously joined `bills b` (non self-pay) and `bills b_self`
-- (self-pay) in parallel without a linking condition. Every row of one join
-- was paired with every row of the other, so each filtered sum was multiplied
-- by the row count of the other join. Rooms containing both self-pay and
-- shared bills therefore produced inflated balances (e.g. ×18 in a room with
-- 18 self-pay bills and 1 shared bill).
--
-- Fix: compute total_paid / total_share / self_pay from a single join with
-- conditional filters instead.

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

-- 6. Convert a fully-local room into an online room (atomic, idempotent)
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

  -- Idempotency: room already converted
  select owner_id into v_existing_owner from rooms where id = p_room_id;
  if found then
    if v_existing_owner = v_owner_user_id then
      return jsonb_build_object('success', true, 'already_converted', true, 'room_id', p_room_id);
    end if;
    raise exception 'ROOM_ID_TAKEN';
  end if;

  -- Validation
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
