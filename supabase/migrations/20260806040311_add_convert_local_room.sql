-- Convert a fully-local room (created without a Supabase session) into an
-- online room in a single transaction: room + members + bills.
-- Idempotent: retrying after a partial/unknown state returns already_converted
-- instead of duplicating data.

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

    v_shared_ids := (
      select array_agg(x::uuid)
      from jsonb_array_elements_text(v_bill->'shared_by') x
    );

    if (v_bill->>'created_by')::uuid is null
       or not ((v_bill->>'created_by')::uuid = any(v_member_set))
       or v_shared_ids is null
       or not (v_shared_ids <@ v_member_set) then
      raise exception 'BILL_MEMBER_NOT_IN_ROOM';
    end if;

    insert into bills (id, room_id, content, amount, paid_at, shared_by, created_by, creator_name, created_at)
    values (
      v_bill_id,
      p_room_id,
      coalesce(v_bill->>'content', ''),
      coalesce((v_bill->>'amount')::numeric, 0),
      coalesce((v_bill->>'paid_at')::timestamptz, now()),
      v_shared_ids,
      (v_bill->>'created_by')::uuid,
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
