-- Rapport ARRIVÉE : statut « No Show » (client absent / non présenté).
alter table public.service_reports
  add column if not exists no_show boolean not null default false;

comment on column public.service_reports.no_show is
  'Arrivée uniquement : true = NO SHOW (seul COMMENTS est renseigné).';

-- Rapport ARRIVÉE & DÉPART : bagages « carry-on only » (aucun bagage en soute).
alter table public.service_reports
  add column if not exists no_checked_bags boolean not null default false;

comment on column public.service_reports.no_checked_bags is
  'true = No checked bags - carry on only (aucun bagage enregistré en soute).';
