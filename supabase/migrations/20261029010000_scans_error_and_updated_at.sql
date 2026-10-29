-- A failed scan needs a reason the UI can show, and a resume needs to tell a
-- crashed run from one still working: updated_at moves on every status change.
alter table public.scans
  add column error text,
  add column updated_at timestamptz not null default now();
