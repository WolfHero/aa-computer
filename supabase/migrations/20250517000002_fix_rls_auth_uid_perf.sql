-- Optimize RLS: wrap auth.uid() in scalar subquery to avoid per-row re-evaluation
-- Without (select ...), PostgreSQL calls auth.uid() for every row processed,
-- even though the value is the same for all rows in a single statement.

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
