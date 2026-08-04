-- Horodatages figés pour la timeline D.O. (ne jamais écraser une fois renseignés).
alter table public.service_reports
  add column if not exists on_position_at timestamptz,
  add column if not exists pec_at timestamptz,
  add column if not exists photo_at timestamptz;

comment on column public.service_reports.on_position_at is
  'Heure figée : premier passage en position (EN PLACE / E.P LARGE / E.P BLOC).';
comment on column public.service_reports.pec_at is
  'Heure figée : premier passage au statut PEC (passager rencontré).';
comment on column public.service_reports.photo_at is
  'Heure figée : première photo de service enregistrée.';
