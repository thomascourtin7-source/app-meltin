-- ETA départs (HH:mm texte), même ligne que les assignations (upsert Realtime commun).
alter table public.planning_assignments
  add column if not exists eta_time text;

comment on column public.planning_assignments.eta_time is
  'Heure d''arrivée estimée chauffeur (format HH:mm) pour départs planning.';
