-- Jeton de session côté serveur (Bearer) pour vérifier les actions admin planning.
alter table public.agents_auth
  add column if not exists session_token text;
