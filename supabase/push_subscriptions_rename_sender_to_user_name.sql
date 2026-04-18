-- Migration : ancienne colonne sender_name → user_name (alignement API / code)
-- À exécuter une fois si la table a été créée avec push_subscriptions.sql historique.

alter table public.push_subscriptions
  rename column sender_name to user_name;

drop index if exists public.push_subscriptions_sender_idx;

create index if not exists push_subscriptions_user_name_idx
  on public.push_subscriptions (user_name);
