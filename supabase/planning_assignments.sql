-- Assignations planning : UNE ligne par service (service_id), plusieurs agents dans agent_name
-- (chaîne « Libellé1;Libellé2 » — voir serializeAssigneeSlugsToName côté API).
-- L’index UNIQUE sur service_id est voulu pour l’upsert PostgREST / onConflict=service_id.
-- Ne pas le supprimer tant que l’app n’a pas migré vers une vraie table de liaison (une ligne par agent).
create table if not exists public.planning_assignments (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  service_date date,
  agent_name text,
  updated_at timestamptz not null default now()
);

create unique index if not exists planning_assignments_service_id_uidx
  on public.planning_assignments (service_id);

alter table public.planning_assignments enable row level security;

