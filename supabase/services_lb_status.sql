-- Large / Block (planning) : indicateur sur la carte service.
alter table public.services
  add column if not exists lb_status text check (lb_status in ('large', 'block'));

alter table public.services
  add column if not exists lb_updated_by text;

alter table public.services
  add column if not exists lb_updated_at timestamptz;

comment on column public.services.lb_status is
  'Indicateur Large ou Block posé depuis le planning (null = non renseigné).';

comment on column public.services.lb_updated_by is
  'Nom de l''agent ayant posé ou modifié lb_status.';

comment on column public.services.lb_updated_at is
  'Horodatage de la dernière modification de lb_status.';
