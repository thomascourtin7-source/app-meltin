-- Anti-spam rappels ⏰ : au plus un envoi par service, par type de rappel, et par jour (Paris)

create table if not exists public.sent_planning_reminders (
  spreadsheet_id text not null,
  service_identity_key text not null,
  reminder_kind text not null,
  sent_on date not null,
  notified_at timestamptz not null default now(),
  primary key (spreadsheet_id, service_identity_key, reminder_kind, sent_on)
);

comment on table public.sent_planning_reminders is
  'Envois des rappels « ⏰ RAPPEL » par identité métier, type, et jour (Europe/Paris)';

create index if not exists sent_planning_reminders_sent_on_idx
  on public.sent_planning_reminders (sent_on desc);

alter table public.sent_planning_reminders enable row level security;

