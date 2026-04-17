-- =============================================================================
-- Bucket Storage public `chat-attachments` — lecture + upload (anon / auth)
-- Créer le bucket dans le dashboard si besoin, puis exécuter les politiques.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "chat-attachments: lecture publique" on storage.objects;
drop policy if exists "chat-attachments: upload général" on storage.objects;

create policy "chat-attachments: lecture publique"
  on storage.objects
  for select
  to public
  using (bucket_id = 'chat-attachments');

create policy "chat-attachments: upload général"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'chat-attachments');
