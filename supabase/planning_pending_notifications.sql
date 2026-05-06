-- Queue anti-spam (debounce serveur) pour notifications planning descriptives.
-- Objectif : si un service est modifié plusieurs fois d'affilée, n'envoyer qu'une notif
-- après 5s d'inactivité (au prochain run cron).

create table if not exists public.planning_pending_notifications (
  spreadsheet_id text not null,
  date_key date not null,
  stable_row_key text not null,
  kind text not null, -- ex: 'service_modified'
  target_name text not null, -- ex: 'Javed'
  title text not null,
  body text not null,
  open_url text not null,
  last_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (spreadsheet_id, date_key, stable_row_key, kind, target_name)
);

create index if not exists planning_pending_notifications_due_idx
  on public.planning_pending_notifications (sent_at, last_seen_at desc);

alter table public.planning_pending_notifications enable row level security;

