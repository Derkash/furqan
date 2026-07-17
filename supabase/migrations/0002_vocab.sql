-- Vocabulaire personnel synchronisé PAR COMPTE (et non par appareil).
-- Même principe que 0001 : table verrouillée (RLS, aucune policy) + fonctions
-- RPC SECURITY DEFINER comme seule surface exposée. localStorage reste le cache
-- de lecture ; Supabase fait autorité entre appareils.

-- ---------- Table ----------

create table if not exists app.vocab (
  account_id uuid not null references app.accounts(id) on delete cascade,
  entry_id   text not null,               -- ancre "r:<racine>" ou "f:<forme nue>"
  data       jsonb not null,              -- l'entrée VocabEntry complète
  updated_at timestamptz not null default now(),
  primary key (account_id, entry_id)
);

alter table app.vocab enable row level security;
-- Aucune policy => aucun accès direct anon/authenticated (accès via RPC).

-- ---------- Fonctions RPC ----------

-- Charge tout le vocabulaire d'un compte : tableau JSON des entrées.
create or replace function public.app_vocab_load(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = app, pg_catalog
as $$
declare
  v_id uuid := public.account_id_for(p_username);
begin
  if v_id is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(data order by updated_at)
    from app.vocab where account_id = v_id
  ), '[]'::jsonb);
end;
$$;

-- Ajoute/met à jour une entrée (write-through depuis le client).
create or replace function public.app_vocab_upsert(p_username text, p_entry_id text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = app, pg_catalog
as $$
declare
  v_id uuid := public.account_id_for(p_username);
begin
  if v_id is null then
    return;
  end if;
  insert into app.vocab (account_id, entry_id, data, updated_at)
  values (v_id, p_entry_id, p_data, now())
  on conflict (account_id, entry_id)
  do update set data = excluded.data, updated_at = now();
end;
$$;

-- Upsert en lot : p_entries = objet JSON { entry_id: data, ... } (fusion initiale).
create or replace function public.app_vocab_upsert_bulk(p_username text, p_entries jsonb)
returns void
language plpgsql
security definer
set search_path = app, pg_catalog
as $$
declare
  v_id uuid := public.account_id_for(p_username);
  k text;
  v jsonb;
begin
  if v_id is null then
    return;
  end if;
  for k, v in select * from jsonb_each(p_entries) loop
    insert into app.vocab (account_id, entry_id, data, updated_at)
    values (v_id, k, v, now())
    on conflict (account_id, entry_id)
    do update set data = excluded.data, updated_at = now();
  end loop;
end;
$$;

-- Supprime une entrée.
create or replace function public.app_vocab_delete(p_username text, p_entry_id text)
returns void
language plpgsql
security definer
set search_path = app, pg_catalog
as $$
declare
  v_id uuid := public.account_id_for(p_username);
begin
  if v_id is null then
    return;
  end if;
  delete from app.vocab where account_id = v_id and entry_id = p_entry_id;
end;
$$;

-- ---------- Permissions ----------

grant execute on function public.app_vocab_load(text)                to anon, authenticated;
grant execute on function public.app_vocab_upsert(text, text, jsonb) to anon, authenticated;
grant execute on function public.app_vocab_upsert_bulk(text, jsonb)  to anon, authenticated;
grant execute on function public.app_vocab_delete(text, text)        to anon, authenticated;
