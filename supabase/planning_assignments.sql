create table if not exists public.planning_assignments (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  service_date date,
  agent_name text,
  updated_at timestamptz not null default now()
);

create unique index if not exists planning_assignments_service_id_uidx
  on public.planning_assignments (service_id);

alter table public.planning_assignments enable row level security;

