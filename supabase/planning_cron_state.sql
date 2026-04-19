-- État du planning (sync Google Sheet). Voir aussi supabase/sent_alarms.sql (anti-spam alarme).

create table if not exists public.planning_cron_state (
  spreadsheet_id text primary key,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.planning_cron_state is
  'Photo serveur : hash global, byDate, rowHashes (v4) pour /api/check-planning';

alter table public.planning_cron_state enable row level security;

-- Aucun accès anon : lecture/écriture uniquement via service_role (routes API).
