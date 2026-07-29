-- VIP Lounge transit : colonne texte "Yes" | "No" (comme customs_control).
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_reports'
      and column_name = 'vip_lounge'
  ) then
    alter table public.service_reports add column vip_lounge text;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'service_reports'
      and column_name = 'vip_lounge'
      and udt_name = 'bool'
  ) then
    alter table public.service_reports
      alter column vip_lounge type text
      using (
        case
          when vip_lounge is true then 'Yes'
          when vip_lounge is false then 'No'
          else null
        end
      );
  end if;
end $$;

comment on column public.service_reports.vip_lounge is
  'Transit : Yes | No. End of service lieu : boarding_end_of_service.';

comment on column public.service_reports.boarding_end_of_service is
  'Départ & transit : lieu/mode de fin de service (menu déroulant).';

select column_name, data_type, udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'service_reports'
  and column_name in ('vip_lounge', 'boarding_end_of_service', 'deplanning', 'travel_class')
order by column_name;
