create table if not exists public.service_assignment_logs (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  changed_by text not null,
  old_agent text,
  new_agent text,
  created_at timestamptz not null default now()
);

create index if not exists service_assignment_logs_service_id_idx
  on public.service_assignment_logs (service_id);

create index if not exists service_assignment_logs_created_at_idx
  on public.service_assignment_logs (created_at desc);

alter table public.service_assignment_logs enable row level security;

alter table public.service_assignment_logs replica identity full;

drop policy if exists "Service assignment logs: lecture" on public.service_assignment_logs;

create policy "Service assignment logs: lecture"
  on public.service_assignment_logs
  for select
  to anon, authenticated
  using (true);

do $$
begin
  alter publication supabase_realtime add table public.service_assignment_logs;
exception
  when duplicate_object then null;
  when others then null;
end
$$;
