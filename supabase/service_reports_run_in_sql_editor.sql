-- =============================================================================
-- Supabase → SQL Editor : exécuter ce script en entier (idempotent).
-- Ajoute toutes les colonnes des rapports ARRIVÉE, DÉPART et TRANSIT + PDF.
-- =============================================================================

-- 1. Table de base (si elle n'existe pas encore)
create table if not exists public.service_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  spreadsheet_id text not null,
  service_id text not null,
  service_date date not null,

  service_client text not null,
  service_type text not null,
  service_tel text,
  service_vol text,
  service_rdv1 text,
  service_rdv2 text,
  service_dest_prov text,
  service_driver_info text,

  assignee_name text,
  report_kind text not null default 'arrival',

  deplanning text,
  pax int,
  service_started_at time,
  travel_class text,
  immigration_speed text,
  checkin_bags int,
  customs_control boolean,
  end_of_service time,
  place_end_of_service text,
  comments text
);

-- 2. Colonnes ajoutées après la création initiale de la table
alter table public.service_reports
  add column if not exists meeting_time time,
  add column if not exists tax_refund boolean,
  add column if not exists tax_refund_speed text,
  add column if not exists tax_refund_by text,
  add column if not exists checkin boolean,
  add column if not exists immigration_security boolean,
  add column if not exists immigration_security_speed text,
  add column if not exists vip_lounge boolean,
  add column if not exists boarding_end_of_service text,
  add column if not exists transit_bags text,
  add column if not exists bags_status text,
  add column if not exists is_pec boolean not null default false,
  add column if not exists pec_status text,
  add column if not exists completed_at timestamptz,
  add column if not exists photo_url text,
  add column if not exists no_show boolean not null default false,
  add column if not exists no_checked_bags boolean not null default false,
  add column if not exists on_position_at timestamptz,
  add column if not exists pec_at timestamptz,
  add column if not exists photo_at timestamptz;

-- 3. Commentaires (documentation)
comment on column public.service_reports.deplanning is
  'Arrivée : Block | Large.';

comment on column public.service_reports.pax is
  'Nombre de PAX (1–10).';

comment on column public.service_reports.travel_class is
  'Arrivée & départ : First | Business | Eco premium | Economy | Mix.';

comment on column public.service_reports.immigration_speed is
  'Arrivée : Very fast | Fast | Queue.';

comment on column public.service_reports.checkin_bags is
  'Arrivée : nombre de bagages enregistrés (1–10). Null si carry-on only.';

comment on column public.service_reports.customs_control is
  'Arrivée : Yes | No (texte). Voir service_reports_customs_control_text.sql si la colonne est encore boolean.';

comment on column public.service_reports.place_end_of_service is
  'Arrivée : Driver on time | Driver late pax waited | Taxi/uber | etc.';

comment on column public.service_reports.end_of_service is
  'Heure de fin du service (time). Distinct de place_end_of_service / boarding_end_of_service.';

comment on column public.service_reports.tax_refund is
  'Départ : true = Yes, false = NO.';

comment on column public.service_reports.tax_refund_speed is
  'Départ : Very fast | Fast | Queue (si tax_refund = true).';

comment on column public.service_reports.tax_refund_by is
  'Départ : Credit card | Cash | Mix (si tax_refund = true).';

comment on column public.service_reports.boarding_end_of_service is
  'Départ : Lounge | Duty free | At the gate | Boarding by agent.';

comment on column public.service_reports.immigration_security_speed is
  'Départ / transit : FAST | VERY FAST | QUEUE.';

comment on column public.service_reports.bags_status is
  'Transit : checked_through | no_bags | collect_paris_recheck.';

comment on column public.service_reports.no_show is
  'Arrivée : true = NO SHOW (seul COMMENTS renseigné).';

comment on column public.service_reports.no_checked_bags is
  'Arrivée & départ : true = carry-on only (pas de bagages en soute).';

-- 4. Index
create unique index if not exists service_reports_spreadsheet_service_uidx
  on public.service_reports (spreadsheet_id, service_id);

create index if not exists service_reports_service_date_idx
  on public.service_reports (service_date desc);

alter table public.service_reports enable row level security;

-- 5. Vérification : toutes les colonnes utilisées par le formulaire et le PDF
--    Résultat attendu : 22 lignes. Si une colonne manque, elle n'apparaît pas ici.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'service_reports'
  and column_name in (
    -- Arrivée (PDF)
    'deplanning',
    'pax',
    'travel_class',
    'immigration_speed',
    'checkin_bags',
    'customs_control',
    'place_end_of_service',
    'no_show',
    'no_checked_bags',
    -- Départ (PDF)
    'tax_refund',
    'tax_refund_speed',
    'tax_refund_by',
    'boarding_end_of_service',
    'immigration_security_speed',
    -- Transit (PDF)
    'bags_status',
    -- Commun
    'report_kind',
    'meeting_time',
    'end_of_service',
    'comments',
    'photo_url',
    'completed_at'
  )
order by column_name;

-- 6. Compte : doit afficher expected_count = 22 et missing_count = 0
with expected(col) as (
  values
    ('deplanning'),
    ('pax'),
    ('travel_class'),
    ('immigration_speed'),
    ('checkin_bags'),
    ('customs_control'),
    ('place_end_of_service'),
    ('no_show'),
    ('no_checked_bags'),
    ('tax_refund'),
    ('tax_refund_speed'),
    ('tax_refund_by'),
    ('boarding_end_of_service'),
    ('immigration_security_speed'),
    ('bags_status'),
    ('report_kind'),
    ('meeting_time'),
    ('end_of_service'),
    ('comments'),
    ('photo_url'),
    ('completed_at')
),
actual as (
  select column_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'service_reports'
)
select
  (select count(*) from expected) as expected_count,
  (select count(*) from expected e join actual a on a.column_name = e.col) as found_count,
  (select count(*) from expected e left join actual a on a.column_name = e.col where a.column_name is null) as missing_count,
  (
    select string_agg(e.col, ', ' order by e.col)
    from expected e
    left join actual a on a.column_name = e.col
    where a.column_name is null
  ) as missing_columns;
