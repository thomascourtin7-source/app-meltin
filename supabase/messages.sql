-- =============================================================================
-- Meltin — table `messages` + RLS + Realtime (Supabase)
-- Exécuter dans : SQL Editor > New query (ou migration Supabase CLI).
-- Si la table existe déjà sans `image_url`, exécuter aussi messages-image-url.sql.
-- =============================================================================

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null default 'general',
  sender_name text not null,
  content text not null,
  image_url text,
  reply_to_id uuid references public.messages (id) on delete set null,
  is_edited boolean not null default false,
  created_at timestamptz not null default now(),
  constraint messages_content_or_image check (
    (
      coalesce(trim(image_url), '') = ''
      and char_length(trim(content)) between 1 and 2000
    )
    or (
      coalesce(trim(image_url), '') <> ''
      and char_length(trim(content)) between 0 and 2000
    )
  ),
  constraint messages_sender_len check (char_length(trim(sender_name)) between 1 and 120)
);

comment on table public.messages is 'Chat équipe — temps réel via supabase_realtime';

create index if not exists messages_room_created_idx
  on public.messages (room_id, created_at desc);

create index if not exists messages_reply_to_idx on public.messages (reply_to_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.messages enable row level security;

-- Idempotent : supprime les anciennes politiques si vous ré-appliquez le script
drop policy if exists "Messages: lecture" on public.messages;
drop policy if exists "Messages: insertion" on public.messages;

create policy "Messages: lecture"
  on public.messages
  for select
  to anon, authenticated
  using (true);

create policy "Messages: insertion"
  on public.messages
  for insert
  to anon, authenticated
  with check (
    char_length(trim(sender_name)) between 1 and 120
    and coalesce(trim(room_id), '') = 'general'
    and (
      (
        coalesce(trim(image_url), '') = ''
        and char_length(trim(content)) between 1 and 2000
      )
      or (
        coalesce(trim(image_url), '') <> ''
        and char_length(trim(content)) between 0 and 2000
      )
    )
  );

create policy "Messages: mise à jour"
  on public.messages
  for update
  to anon, authenticated
  using (true)
  with check (
    char_length(trim(sender_name)) between 1 and 120
    and coalesce(trim(room_id), '') = 'general'
    and (
      (
        coalesce(trim(image_url), '') = ''
        and char_length(trim(content)) between 1 and 2000
      )
      or (
        coalesce(trim(image_url), '') <> ''
        and char_length(trim(content)) between 0 and 2000
      )
    )
  );

create policy "Messages: suppression"
  on public.messages
  for delete
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Realtime : inclure la table dans la publication (une seule fois)
-- Si erreur "already exists", ignorer.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
