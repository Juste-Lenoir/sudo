-- sudo_ · base de données Supabase (Phase 3 : synchronisation, photos, ateliers en groupe)
-- À coller dans Supabase → SQL Editor → New query → Run.
-- Tu peux le relancer sans risque : rien n'est effacé.

-- Numéro qui augmente à chaque modification : chaque appareil récupère « tout ce qui a changé depuis N ».
create sequence if not exists public.sudo_seq;
grant usage on sequence public.sudo_seq to authenticated;

-- Garde la version la plus récente (selon l'heure de l'appareil) et numérote la modification.
create or replace function public.sudo_bump() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.mtime < old.mtime then return null; end if;
  new.seq := nextval('public.sudo_seq');
  new.updated_at := now();
  return new;
end $$;

-- Un compte invité (élève qui rejoint un groupe sans e-mail) ?
create or replace function public.sudo_is_guest() returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

---------------------------------------------------------------- Mes données (synchronisation)
create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  store text not null,
  rid text not null,
  data jsonb,
  mtime bigint not null default 0,
  deleted boolean not null default false,
  seq bigint not null default nextval('public.sudo_seq'),
  updated_at timestamptz not null default now(),
  primary key (user_id, store, rid)
);
create index if not exists records_user_seq on public.records (user_id, seq);
alter table public.records enable row level security;
drop policy if exists records_own on public.records;
create policy records_own on public.records for all to authenticated
  using (user_id = auth.uid() and not public.sudo_is_guest())
  with check (user_id = auth.uid() and not public.sudo_is_guest());
drop trigger if exists records_bump on public.records;
create trigger records_bump before insert or update on public.records
  for each row execute function public.sudo_bump();

---------------------------------------------------------------- Photos du téléphone vers l'ordinateur
create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  path text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.transfers enable row level security;
drop policy if exists transfers_own on public.transfers;
create policy transfers_own on public.transfers for all to authenticated
  using (user_id = auth.uid() and not public.sudo_is_guest())
  with check (user_id = auth.uid() and not public.sudo_is_guest());

---------------------------------------------------------------- Ateliers en groupe
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null default '',
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null default '',
  role text not null default '',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table if not exists public.group_items (
  group_id uuid not null references public.groups on delete cascade,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  mtime bigint not null default 0,
  author text not null default '',
  seq bigint not null default nextval('public.sudo_seq'),
  updated_at timestamptz not null default now(),
  primary key (group_id, id)
);
create index if not exists group_items_seq on public.group_items (group_id, seq);
drop trigger if exists group_items_bump on public.group_items;
create trigger group_items_bump before insert or update on public.group_items
  for each row execute function public.sudo_bump();

create or replace function public.sudo_member(g text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members m where m.group_id::text = g and m.user_id = auth.uid());
$$;
create or replace function public.sudo_owner(g uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.groups x where x.id = g and x.owner = auth.uid());
$$;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_items enable row level security;

drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups for select to authenticated using (public.sudo_member(id::text));
drop policy if exists groups_owner on public.groups;
create policy groups_owner on public.groups for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups for delete to authenticated using (owner = auth.uid());

drop policy if exists members_read on public.group_members;
create policy members_read on public.group_members for select to authenticated using (public.sudo_member(group_id::text));
drop policy if exists members_edit on public.group_members;
create policy members_edit on public.group_members for update to authenticated
  using (user_id = auth.uid() or public.sudo_owner(group_id))
  with check (user_id = auth.uid() or public.sudo_owner(group_id));
drop policy if exists members_leave on public.group_members;
create policy members_leave on public.group_members for delete to authenticated
  using (user_id = auth.uid() or public.sudo_owner(group_id));

drop policy if exists items_all on public.group_items;
create policy items_all on public.group_items for all to authenticated
  using (public.sudo_member(group_id::text)) with check (public.sudo_member(group_id::text));

-- Créer un groupe (compte e-mail obligatoire) : renvoie { id, code }.
create or replace function public.create_group(p_name text, p_member text) returns json
  language plpgsql security definer set search_path = public as $$
declare g uuid; c text; i int;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if public.sudo_is_guest() then raise exception 'Connecte-toi avec ton e-mail pour créer un groupe'; end if;
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups x where x.code = c);
  end loop;
  insert into public.groups (code, name, owner) values (c, coalesce(p_name, ''), auth.uid()) returning id into g;
  insert into public.group_members (group_id, user_id, name) values (g, auth.uid(), coalesce(p_member, ''));
  return json_build_object('id', g, 'code', c);
end $$;

-- Rejoindre un groupe avec son code : renvoie { id, code, name }.
create or replace function public.join_group(p_code text, p_member text) returns json
  language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into g from public.groups x where x.code = upper(trim(p_code));
  if g.id is null then raise exception 'Code inconnu'; end if;
  if (select count(*) from public.group_members m where m.group_id = g.id) >= 12
     and not public.sudo_member(g.id::text) then raise exception 'Groupe complet (12 élèves)'; end if;
  insert into public.group_members (group_id, user_id, name) values (g.id, auth.uid(), coalesce(p_member, ''))
    on conflict (group_id, user_id) do update set name = excluded.name;
  return json_build_object('id', g.id, 'code', g.code, 'name', g.name);
end $$;

grant select, insert, update, delete on public.records, public.transfers, public.groups,
  public.group_members, public.group_items to authenticated;
grant execute on function public.create_group(text, text), public.join_group(text, text) to authenticated;

---------------------------------------------------------------- Stockage des photos (privé)
-- u/<mon id>/…  : mes photos (synchronisation, envoi vers l'ordinateur)
-- g/<groupe>/…  : photos partagées d'un groupe (consigne)
insert into storage.buckets (id, name, public) values ('sudo', 'sudo', false) on conflict (id) do nothing;
drop policy if exists sudo_own_files on storage.objects;
create policy sudo_own_files on storage.objects for all to authenticated
  using (bucket_id = 'sudo' and (storage.foldername(name))[1] = 'u' and (storage.foldername(name))[2] = auth.uid()::text)
  with check (bucket_id = 'sudo' and (storage.foldername(name))[1] = 'u' and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists sudo_group_files on storage.objects;
create policy sudo_group_files on storage.objects for all to authenticated
  using (bucket_id = 'sudo' and (storage.foldername(name))[1] = 'g' and public.sudo_member((storage.foldername(name))[2]))
  with check (bucket_id = 'sudo' and (storage.foldername(name))[1] = 'g' and public.sudo_member((storage.foldername(name))[2]));
