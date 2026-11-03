-- A person can stop a scan that is still being read. "cancelled" is a final state, like "failed",
-- but it means the person chose it, so no retry is offered.
alter table public.scans drop constraint scans_status_check;
alter table public.scans
  add constraint scans_status_check
  check (status in ('queued','segmenting','reading','reconciling','needs_review','done','failed','cancelled'));
