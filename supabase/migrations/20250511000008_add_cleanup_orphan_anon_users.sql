-- ============================================
-- Migration 8: Cleanup orphan anonymous users
-- ============================================

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
