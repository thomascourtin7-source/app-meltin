-- Cycle PEC : vide | en_place | pec (remplace la sémantique booléenne seule).
alter table public.service_reports
  add column if not exists pec_status text;

comment on column public.service_reports.pec_status is
  'Cycle PEC : vide, en_place, pec. is_pec reste true uniquement pour pec.';

update public.service_reports
set pec_status = case when is_pec = true then 'pec' else 'vide' end
where pec_status is null or trim(pec_status) = '';
