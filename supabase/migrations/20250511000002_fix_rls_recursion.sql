-- Fix RLS infinite recursion by using security definer function

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

-- Drop old policies
drop policy if exists "rooms_select" on rooms;
drop policy if exists "rooms_update" on rooms;
drop policy if exists "rooms_delete" on rooms;
drop policy if exists "room_members_select" on room_members;
drop policy if exists "bills_select" on bills;
drop policy if exists "bills_insert" on bills;
drop policy if exists "aa_results_select" on aa_results;
drop policy if exists "aa_results_insert" on aa_results;
drop policy if exists "aa_results_update" on aa_results;

-- Recreate policies using the function
create policy "rooms_select" on rooms
  for select using (is_member_of_room(id));

create policy "rooms_update" on rooms
  for update using (is_member_of_room(id));

create policy "rooms_delete" on rooms
  for delete using (is_member_of_room(id));

create policy "room_members_select" on room_members
  for select using (
    user_id = auth.uid()::text or is_member_of_room(room_id)
  );

create policy "bills_select" on bills
  for select using (is_member_of_room(room_id));

create policy "bills_insert" on bills
  for insert with check (is_member_of_room(room_id));

create policy "aa_results_select" on aa_results
  for select using (is_member_of_room(room_id));

create policy "aa_results_insert" on aa_results
  for insert with check (is_member_of_room(room_id));

create policy "aa_results_update" on aa_results
  for update using (is_member_of_room(room_id));
