-- Statut bagages pour les rapports Transit (formulaire fin de mission).
alter table public.service_reports
  add column if not exists bags_status text;

comment on column public.service_reports.bags_status is
  'Transit uniquement : checked_through | no_bags | collect_paris_recheck';
