-- Active le chat D.O. après partage du lien de suivi
alter table public.services
  add column if not exists is_do_tracking_active boolean not null default false;

comment on column public.services.is_do_tracking_active is
  'Chat D.O. activé après partage du lien de suivi (Lien D.O. / WhatsApp).';
