-- Anti-spam alarme 🚨 : au plus une notification par service et par jour calendaire (Paris)

create table if not exists public.sent_alarms (
  spreadsheet_id text not null,
  service_identity_key text not null,
  sent_on date not null,
  notified_at timestamptz not null default now(),
  primary key (spreadsheet_id, service_identity_key, sent_on)
);

comment on table public.sent_alarms is
  'Envois de la notif « 🚨 ALERTE : Service » par identité métier et par jour (Europe/Paris)';

create index if not exists sent_alarms_sent_on_idx
  on public.sent_alarms (sent_on desc);

alter table public.sent_alarms enable row level security;
