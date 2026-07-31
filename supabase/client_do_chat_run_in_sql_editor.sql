-- =============================================================================
-- Supabase → SQL Editor : suivi D.O. + chat mission (idempotent)
-- =============================================================================

alter table public.services
  add column if not exists share_token text,
  add column if not exists passenger_label text,
  add column if not exists is_do_tracking_active boolean not null default false;

comment on column public.services.is_do_tracking_active is
  'Chat D.O. activé après partage du lien de suivi (Lien D.O. / WhatsApp).';

create unique index if not exists services_share_token_uidx
  on public.services (share_token)
  where share_token is not null;

create table if not exists public.client_chat_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  spreadsheet_id text not null,
  service_id text not null,

  sender_type text not null,
  sender_name text not null,
  message text not null,

  constraint client_chat_sender_type_check
    check (sender_type in ('client', 'agent')),
  constraint client_chat_sender_name_len
    check (char_length(trim(sender_name)) between 1 and 120),
  constraint client_chat_message_len
    check (char_length(trim(message)) between 1 and 2000)
);

create index if not exists client_chat_messages_service_idx
  on public.client_chat_messages (spreadsheet_id, service_id, created_at asc);

alter table public.client_chat_messages enable row level security;

drop policy if exists "Client chat: lecture" on public.client_chat_messages;
create policy "Client chat: lecture"
  on public.client_chat_messages
  for select
  to anon, authenticated
  using (true);

-- Realtime (ignorer si déjà ajouté)
do $$
begin
  alter publication supabase_realtime add table public.client_chat_messages;
exception
  when duplicate_object then null;
end $$;

-- Realtime timeline (service_reports + planning_assignments for greeter updates)
alter table public.service_reports replica identity full;

drop policy if exists "Service reports: track read" on public.service_reports;
create policy "Service reports: track read"
  on public.service_reports
  for select
  to anon, authenticated
  using (true);

do $$
begin
  alter publication supabase_realtime add table public.service_reports;
exception
  when duplicate_object then null;
  when others then null;
end $$;

-- Realtime suivi D.O. actif (services.is_do_tracking_active)
alter table public.services replica identity full;

drop policy if exists "Services: track read" on public.services;
create policy "Services: track read"
  on public.services
  for select
  to anon, authenticated
  using (true);

do $$
begin
  alter publication supabase_realtime add table public.services;
exception
  when duplicate_object then null;
  when others then null;
end $$;
