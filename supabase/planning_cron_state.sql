-- État du planning (sync Google Sheet) + anti-spam alarmes (30 min / service)

create table if not exists public.planning_cron_state (
  spreadsheet_id text primary key,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.planning_cron_state is
  'Photo serveur du planning (hash + assignations par date) pour /api/cron/check-planning';

create table if not exists public.planning_alarm_last_sent (
  spreadsheet_id text not null,
  service_identity_key text not null,
  last_notified_at timestamptz not null,
  primary key (spreadsheet_id, service_identity_key)
);

comment on table public.planning_alarm_last_sent is
  'Dernière notif 🚨 ALERTE : Service par identité métier (fenêtre 30 min côté cron)';

create index if not exists planning_alarm_last_sent_notified_idx
  on public.planning_alarm_last_sent (last_notified_at desc);

alter table public.planning_cron_state enable row level security;
alter table public.planning_alarm_last_sent enable row level security;

-- Aucun accès anon : lecture/écriture uniquement via service_role (routes API).
