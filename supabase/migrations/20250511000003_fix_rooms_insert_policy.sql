-- Fix rooms insert policy: allow all authenticated users (anonymous users included)
drop policy if exists "rooms_insert" on rooms;
create policy "rooms_insert" on rooms
  for insert with check (true);
