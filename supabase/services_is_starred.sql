-- Favori VIP (planning) : visible par tous, modifiable uniquement côté app (Javed / JAVED ORDI).
alter table public.services
  add column if not exists is_starred boolean not null default false;

comment on column public.services.is_starred is
  'Client VIP / important : affichage étoile sur les cartes planning.';
