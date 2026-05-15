-- Add length constraints to match frontend validation

-- Room name: max 20 characters
ALTER TABLE rooms
  ALTER COLUMN name TYPE varchar(20);

-- Member name: max 20 characters
ALTER TABLE room_members
  ALTER COLUMN name TYPE varchar(20);

-- Bill content: max 80 characters (40 units × 2 half-width per unit)
ALTER TABLE bills
  ALTER COLUMN content TYPE varchar(80);

-- Bill creator name: max 20 characters
ALTER TABLE bills
  ALTER COLUMN creator_name TYPE varchar(20);
