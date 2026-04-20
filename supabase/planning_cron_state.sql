-- Ancienne table d’état (migration). L’app lit encore cette ligne une fois pour migrer vers planning_states.

create table if not exists public.planning_cron_state (
  spreadsheet_id text primary key,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.planning_cron_state is
  'Obsolète : préférer public.planning_states';

alter table public.planning_cron_state enable row level security;
