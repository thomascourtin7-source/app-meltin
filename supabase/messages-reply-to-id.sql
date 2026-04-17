-- =============================================================================
-- Meltin — colonne reply_to_id (réponse à un message)
-- À exécuter si la table messages existe déjà sans cette colonne.
-- =============================================================================

alter table public.messages
  add column if not exists reply_to_id uuid references public.messages (id) on delete set null;

create index if not exists messages_reply_to_idx on public.messages (reply_to_id);
