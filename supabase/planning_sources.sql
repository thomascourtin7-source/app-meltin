-- Feuilles Google associées à un mois de planning (source de données).
create table if not exists public.planning_sources (
  id uuid primary key default gen_random_uuid(),
  month_name text not null,
  month_index int not null,
  year int not null,
  spreadsheet_id text not null,
  is_active boolean not null default true
);

comment on table public.planning_sources is
  'Référentiel des Google Sheets par mois (month_name, month_index, year).';

comment on column public.planning_sources.month_name is
  'Libellé affiché, ex. Juin 2026.';

comment on column public.planning_sources.month_index is
  'Mois calendaire 1–12, ex. 6 pour juin.';

comment on column public.planning_sources.spreadsheet_id is
  'Identifiant Google Sheets du planning du mois.';

create unique index if not exists planning_sources_spreadsheet_id_uidx
  on public.planning_sources (spreadsheet_id);

create unique index if not exists planning_sources_month_name_uidx
  on public.planning_sources (month_name);

create unique index if not exists planning_sources_year_month_uidx
  on public.planning_sources (year, month_index);

create index if not exists planning_sources_year_month_idx
  on public.planning_sources (year, month_index);

alter table public.planning_sources enable row level security;
