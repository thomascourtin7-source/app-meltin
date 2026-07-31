-- Token public de suivi D.O. (Donneur d'Ordre) — URL /track/[share_token]
alter table public.services
  add column if not exists share_token text,
  add column if not exists passenger_label text;

create unique index if not exists services_share_token_uidx
  on public.services (share_token)
  where share_token is not null;

comment on column public.services.share_token is
  'Token opaque pour la page publique /track/[token] (sans auth).';
comment on column public.services.passenger_label is
  'Libellé passager affiché sur la page de suivi (ex. nom client Sheet).';
