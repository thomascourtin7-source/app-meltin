-- Compte externe Escale : connexion autorisée, missions limitées à ses assignations.
-- Exécuter dans Supabase > SQL Editor.

alter table public.agents_auth
  add column if not exists is_external boolean not null default false;

comment on column public.agents_auth.is_external is
  'true pour un agent externe (ex. ESCALE) : connexion OK, API et UI filtrées sur ses seules missions.';

update public.agents_auth
set
  is_external = true,
  can_login = true,
  role = 'agent'
where lower(name) = 'escale';

-- Le mot de passe n’est pas imposé ici : Escale s’enregistre au premier accès
-- (même flux que les autres agents, page /login).
