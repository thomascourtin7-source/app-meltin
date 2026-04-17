-- =============================================================================
-- Meltin — is_edited + politiques UPDATE / DELETE (messages)
-- À exécuter dans le SQL Editor si la table existe déjà.
-- =============================================================================

alter table public.messages
  add column if not exists is_edited boolean not null default false;

drop policy if exists "Messages: mise à jour" on public.messages;
drop policy if exists "Messages: suppression" on public.messages;

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
