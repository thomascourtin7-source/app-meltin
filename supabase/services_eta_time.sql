-- Heure d’arrivée estimée (chauffeur) pour les départs — affichage planning + Realtime.
alter table public.services
  add column if not exists eta_time text;

comment on column public.services.eta_time is
  'ETA locale au format HH:mm (ex. 14:30), optionnel.';
