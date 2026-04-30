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
  add column if not exists is_pec boolean not null default false,
  add column if not exists completed_at timestamptz;

create unique index if not exists service_reports_spreadsheet_service_uidx
  on public.service_reports (spreadsheet_id, service_id);

create index if not exists service_reports_service_date_idx
  on public.service_reports (service_date desc);

alter table public.service_reports enable row level security;

