-- almuraja3a — progression d'écoute du tafsir audio (0006)
-- Même patron que 0004 : table dans le schéma `app` (RLS, non exposée), accès
-- UNIQUEMENT via des RPC SECURITY DEFINER dans `public`. localStorage reste la
-- source de vérité en lecture ; Supabase sert de sauvegarde (une réinstallation
-- de l'app iPad vide le localStorage) et de synchronisation entre appareils.

-- Un document jsonb par compte : { files: {id: {pos, done, at}}, session, rate }.
create table if not exists app.tafsir_state (
  account_id  uuid not null primary key references app.accounts(id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table app.tafsir_state enable row level security;

create or replace function public.app_tafsir_save(p_username text, p_data jsonb)
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
  insert into app.tafsir_state (account_id, data, updated_at)
  values (v_id, p_data, now())
  on conflict (account_id)
  do update set data = excluded.data, updated_at = now();
end;
$$;

create or replace function public.app_tafsir_load(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = app, pg_catalog
as $$
declare
  v_id uuid := public.account_id_for(p_username);
begin
  if v_id is null then
    return null;
  end if;
  return (select data from app.tafsir_state where account_id = v_id);
end;
$$;

grant execute on function public.app_tafsir_save(text, jsonb) to anon, authenticated;
grant execute on function public.app_tafsir_load(text)        to anon, authenticated;
