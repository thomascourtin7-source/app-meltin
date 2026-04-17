-- =============================================================================
-- Meltin — colonne image_url sur messages + contrainte texte OU image
-- À exécuter dans le SQL Editor Supabase (après messages.sql).
-- =============================================================================

alter table public.messages add column if not exists image_url text;

alter table public.messages drop constraint if exists messages_content_len;

alter table public.messages add constraint messages_content_or_image check (
  (
    coalesce(trim(image_url), '') = ''
    and char_length(trim(content)) between 1 and 2000
  )
  or (
    coalesce(trim(image_url), '') <> ''
    and char_length(trim(content)) between 0 and 2000
  )
);

drop policy if exists "Messages: insertion" on public.messages;

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
