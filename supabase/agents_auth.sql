-- Authentification agents (connexion app). Utilisé par les routes `/api/planning-auth/*`.
-- `password` : hash bcrypt (jamais en clair).
create table if not exists public.agents_auth (
  name text primary key,
  password text not null,
  session_token text
);

alter table public.agents_auth enable row level security;
