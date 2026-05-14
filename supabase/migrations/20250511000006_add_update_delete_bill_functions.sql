-- Atomic bill update + room version increment (transactional, bypasses RLS)

create or replace function update_bill(
  p_bill_id uuid,
  p_room_id uuid,
  p_content text,
  p_amount numeric,
  p_paid_at timestamptz,
  p_shared_by uuid[],
  p_creator_name text
)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from room_members where room_id = p_room_id and user_id = auth.uid()::text) then
    raise exception 'Not a member of this room';
  end if;

  update bills
  set content = p_content,
      amount = p_amount,
      paid_at = p_paid_at,
      shared_by = p_shared_by,
      creator_name = p_creator_name
  where id = p_bill_id and room_id = p_room_id;

  update rooms
  set version = version + 1,
      updated_at = now()
  where id = p_room_id;
end;
$$;

-- Atomic bill delete + room version increment (transactional, bypasses RLS)

create or replace function delete_bill(
  p_bill_id uuid,
  p_room_id uuid
)
returns void
language plpgsql
security definer
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
