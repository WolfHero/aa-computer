-- Public room info function for invite page (bypasses RLS)
-- Allows non-members to see room name + creator name + member names

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
