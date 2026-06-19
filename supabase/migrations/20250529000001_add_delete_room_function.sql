-- Create a safe delete_room function that handles deletion order
-- to avoid the trigger trg_check_member_in_bills from blocking.
-- Then update cleanup_expired_rooms to use it.

-- 1. Safe room deletion function
--    Deletes child rows in the correct order: bills → room_members → aa_results → rooms
--    This ensures trg_check_member_in_bills won't find matching bills when
--    deleting room_members, avoiding the "该成员已在账单分摊中" exception.
create or replace function delete_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  -- Delete bills first to remove shared_by references to room_members
  delete from bills where room_id = p_room_id;

  -- Then delete room_members (trigger trg_check_member_in_bills won't
  -- find any matching bills for this room, so it won't raise)
  delete from room_members where room_id = p_room_id;

  -- Delete AA result cache
  delete from aa_results where room_id = p_room_id;

  -- Finally delete the room itself
  delete from rooms where id = p_room_id;
end;
$$;

-- 2. Update cleanup function to query expired rooms and call delete_room
create or replace function cleanup_expired_rooms()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_rec record;
begin
  for v_rec in select id from rooms where updated_at < now() - interval '7 days'
  loop
    perform delete_room(v_rec.id);
  end loop;
end;
$$;
