-- Métadonnées agents : rôle, e-mail, accès connexion.
alter table public.agents_auth
  add column if not exists email text;

alter table public.agents_auth
  add column if not exists role text not null default 'agent';

alter table public.agents_auth
  add column if not exists can_login boolean not null default true;

alter table public.agents_auth
  alter column password drop not null;

comment on column public.agents_auth.email is
  'E-mail agent (null pour les entités assignables sans connexion).';

comment on column public.agents_auth.role is
  'Droit applicatif : agent ou admin.';

comment on column public.agents_auth.can_login is
  'false pour les sous-traitants assignables sans compte.';

-- Retire l’ancien libellé « Sous-traité ».
delete from public.agents_auth
where lower(name) in ('sous-traité', 'sous-traite', 'subcontracted');

-- Entités assignables sans connexion.
insert into public.agents_auth (name, password, email, role, can_login)
values
  ('TIJ', null, null, 'agent', false),
  ('AIDA', null, null, 'agent', false),
  ('YAYA', null, null, 'agent', false),
  ('ESCALE', null, null, 'agent', false),
  ('AUTRE', null, null, 'agent', false)
on conflict (name) do update
set
  email = excluded.email,
  role = excluded.role,
  can_login = excluded.can_login,
  password = excluded.password;

-- Administrateurs planning.
update public.agents_auth
set role = 'admin'
where lower(name) in (
  'pravin',
  'deva',
  'kumar',
  'thomas',
  'simon',
  'karthik',
  'javed',
  'elias',
  'javed ordi'
);

update public.agents_auth
set role = 'agent'
where can_login = true
  and lower(name) not in (
    'pravin',
    'deva',
    'kumar',
    'thomas',
    'simon',
    'karthik',
    'javed',
    'elias',
    'javed ordi'
  );
