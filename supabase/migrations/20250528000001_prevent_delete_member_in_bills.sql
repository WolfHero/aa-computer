-- Prevent deleting a room member who is referenced in any bill's shared_by array

-- 1. Trigger function
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

-- 2. Before delete trigger on room_members
drop trigger if exists trg_check_member_in_bills on room_members;
create trigger trg_check_member_in_bills
  before delete on room_members
  for each row
  execute function check_member_in_bills();
