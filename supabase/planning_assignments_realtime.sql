-- =============================================================================
-- Meltin — Realtime pour `planning_assignments`
-- Exécuter dans : Supabase > SQL Editor > New query (une seule fois).
--
-- POURQUOI : l'agent distant ne voyait pas son assignation arriver en direct.
-- La notification push (envoyée côté serveur) partait bien, mais l'écran ne
-- bougeait pas car la table n'émettait AUCUN événement Realtime :
--   1) elle n'était pas dans la publication `supabase_realtime` ;
--   2) RLS activée SANS politique de lecture → Realtime (rôle anon) bloqué ;
--   3) REPLICA IDENTITY par défaut → pas d'anciennes valeurs sur DELETE.
-- Ce script corrige les trois points. Idempotent : ré-exécutable sans risque.
-- =============================================================================

-- 1) Anciennes valeurs complètes sur UPDATE/DELETE (désassignation propre côté client).
alter table public.planning_assignments replica identity full;

-- 2) Lecture autorisée pour anon/authenticated : indispensable pour que
--    Supabase Realtime délivre les `postgres_changes` au client navigateur.
drop policy if exists "Planning assignments: lecture" on public.planning_assignments;

create policy "Planning assignments: lecture"
  on public.planning_assignments
  for select
  to anon, authenticated
  using (true);

-- 3) Inclure la table dans la publication Realtime (ignorer si "already exists").
do $$
begin
  alter publication supabase_realtime add table public.planning_assignments;
exception
  when duplicate_object then null;
  when others then null;
end
$$;
