-- État persisté du planning (dernière synchro Google Sheet) pour /api/check-planning

create table if not exists public.planning_states (
  spreadsheet_id text primary key,
  snapshot jsonb not null default '{}'::jsonb,
  global_hash text,
  updated_at timestamptz not null default now()
);

comment on table public.planning_states is
  'Copie / snapshot du planning après chaque lecture ; comparaison prev vs current pour vols retirés.';

alter table public.planning_states enable row level security;

-- Service role uniquement (pas de policy public).
