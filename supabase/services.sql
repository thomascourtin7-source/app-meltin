create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  spreadsheet_id text not null,
  service_id text not null,

  is_pec boolean not null default false
);

create unique index if not exists services_spreadsheet_service_uidx
  on public.services (spreadsheet_id, service_id);

create index if not exists services_updated_at_idx
  on public.services (updated_at desc);

alter table public.services enable row level security;

