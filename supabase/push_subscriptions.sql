-- =============================================================================
-- Abonnements Web Push (VAPID) — liés au prénom (`user_name`) pour chat + planning
-- =============================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_name_idx
  on public.push_subscriptions (user_name);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions: aucune lecture anon" on public.push_subscriptions;
drop policy if exists "push_subscriptions: insert" on public.push_subscriptions;
drop policy if exists "push_subscriptions: update" on public.push_subscriptions;

create policy "push_subscriptions: insert"
  on public.push_subscriptions
  for insert
  to anon, authenticated
  with check (char_length(trim(user_name)) between 1 and 120);

create policy "push_subscriptions: update"
  on public.push_subscriptions
  for update
  to anon, authenticated
  using (true)
  with check (char_length(trim(user_name)) between 1 and 120);
