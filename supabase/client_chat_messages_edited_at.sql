-- Colonne edited_at pour les messages chat D.O. modifiés
alter table public.client_chat_messages
  add column if not exists edited_at timestamptz;

alter table public.client_chat_messages replica identity full;
