-- Basa core tables. Server-only access: RLS is on and no policies exist, so the
-- anon and authenticated roles can neither read nor write. The server uses the
-- service role key, which bypasses RLS.

create table public.scans (
  -- No default needed from the client's view: the outbox generates this id so a
  -- repeated upload hits the primary key instead of creating a second scan.
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued'
    check (status in ('queued','segmenting','reading','reconciling','needs_review','done','failed')),
  image_path text,
  created_at timestamptz not null default now()
);

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  -- text + check rather than an enum: adding a kind later is a one-line
  -- constraint swap, not an ALTER TYPE. 'header' and 'signature' are here
  -- because the shared field keys use them.
  kind text not null
    check (kind in ('table','handwriting','stamp','printed','header','signature')),
  bbox jsonb not null,          -- fractions of the image, validated by Zod
  mask_path text,
  created_at timestamptz not null default now()
);
create index regions_scan_id_idx on public.regions (scan_id);

create table public.readings (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete cascade,
  model text not null,
  structured_json jsonb,
  latency_ms integer,
  error text,
  created_at timestamptz not null default now(),
  -- A retried stage upserts on this pair, so it can never duplicate a reading.
  constraint readings_region_model_key unique (region_id, model)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null unique references public.regions(id) on delete cascade,
  final_json jsonb not null,
  field_status jsonb not null,
  edited boolean not null default false,
  reviewed_at timestamptz not null default now()
);

create table public.recognition_event (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete cascade,
  readings jsonb not null,      -- snapshot of both readings at confirm time
  human_final jsonb not null,
  created_at timestamptz not null default now()
);
create index recognition_event_region_id_idx on public.recognition_event (region_id);

alter table public.scans enable row level security;
alter table public.regions enable row level security;
alter table public.readings enable row level security;
alter table public.reviews enable row level security;
alter table public.recognition_event enable row level security;

-- Belt and braces: even if a policy is added by mistake later, the browser
-- roles hold no table privileges.
revoke all on public.scans, public.regions, public.readings, public.reviews, public.recognition_event
  from anon, authenticated;

-- Private bucket for scan images and masks; reached only via server-made signed URLs.
insert into storage.buckets (id, name, public)
values ('scans', 'scans', false)
on conflict (id) do update set public = false;
