-- =============================================================================
-- Abonnements Web Push (VAPID) — associés au prénom chat pour exclure l’expéditeur
-- =============================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  sender_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_sender_idx
  on public.push_subscriptions (sender_name);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions: aucune lecture anon" on public.push_subscriptions;
drop policy if exists "push_subscriptions: insert" on public.push_subscriptions;
drop policy if exists "push_subscriptions: update" on public.push_subscriptions;

-- Lecture réservée au service role (API serveur) — pas de policy select pour anon

create policy "push_subscriptions: insert"
  on public.push_subscriptions
  for insert
  to anon, authenticated
  with check (char_length(trim(sender_name)) between 1 and 120);

create policy "push_subscriptions: update"
  on public.push_subscriptions
  for update
  to anon, authenticated
  using (true)
  with check (char_length(trim(sender_name)) between 1 and 120);
