-- ============================================
-- Add owner support, nullable user_id, invite tokens
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
set search_path = 'public'
as $$
declare
  v_token text;
begin
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') into v_token;
  update room_members set invite_token = v_token where id = p_member_id;
  return v_token;
end;
$$;
