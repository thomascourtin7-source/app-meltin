alter table public.agents_auth
  add column if not exists is_active boolean not null default true;

comment on column public.agents_auth.is_active is
  'false = profil archivé (plus de connexion ni filtres planning).';
