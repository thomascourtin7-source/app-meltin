-- Chat Donneur d'Ordre ↔ Greeter (par mission / service)
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

comment on table public.client_chat_messages is
  'Messages chat D.O. (client) ↔ agent greeter, liés à une mission planning.';

alter table public.client_chat_messages enable row level security;

drop policy if exists "Client chat: lecture" on public.client_chat_messages;
create policy "Client chat: lecture"
  on public.client_chat_messages
  for select
  to anon, authenticated
  using (true);

-- Les écritures passent par l'API (service role) : pas de policy INSERT anon.

alter publication supabase_realtime add table public.client_chat_messages;
