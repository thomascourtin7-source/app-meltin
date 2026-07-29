-- =============================================================================
-- Customs Control : colonne texte "Yes" | "No" (plus fiable pour le PDF).
-- Exécuter dans Supabase → SQL Editor après service_reports_run_in_sql_editor.sql
-- =============================================================================

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_reports'
      and column_name = 'customs_control'
  ) then
    alter table public.service_reports
      add column customs_control text;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_reports'
      and column_name = 'customs_control'
      and udt_name = 'bool'
  ) then
    alter table public.service_reports
      alter column customs_control type text
      using (
        case
          when customs_control is true then 'Yes'
          when customs_control is false then 'No'
          else null
        end
      );
  end if;
end $$;

comment on column public.service_reports.customs_control is
  'Arrivée : Yes | No (texte, affiché tel quel dans le PDF).';

-- Vérification
select column_name, data_type, udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'service_reports'
  and column_name = 'customs_control';
