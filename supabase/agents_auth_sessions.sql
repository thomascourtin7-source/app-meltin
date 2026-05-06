-- Sessions multi-appareils : un token par appareil (évite d'écraser une session existante).

create table if not exists public.agents_auth_sessions (
  token text primary key,
  name text not null references public.agents_auth(name) on delete cascade,
  device_id text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists agents_auth_sessions_name_idx
  on public.agents_auth_sessions (name);

alter table public.agents_auth_sessions enable row level security;

