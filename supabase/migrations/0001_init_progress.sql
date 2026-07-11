-- almuraja3a — suivi de progression utilisateur
-- Comptes simples (identifiant + mot de passe hashé côté client, djb2) et
-- mémoire des fautes / résultats de quiz / derniers réglages d'exercice.
--
-- Sécurité : volontairement légère (outil personnel). Les tables sont
-- verrouillées par RLS ; l'accès passe UNIQUEMENT par des fonctions RPC
-- SECURITY DEFINER (le rôle anon ne peut pas lire les tables directement,
-- donc pas de dump des hashs). Les opérations de données sont indexées par
-- identifiant (la session ne conserve que l'identifiant, comme aujourd'hui).

-- ---------------------------------------------------------------------------
-- Schéma applicatif dédié (isolé de public / de l'API REST auto-exposée)
-- ---------------------------------------------------------------------------
create schema if not exists app;

-- ---------- Tables ----------

create table if not exists app.accounts (
  id            uuid primary key default gen_random_uuid(),
  username      text not null,               -- affichage (casse d'origine)
  username_key  text not null unique,        -- identifiant normalisé (minuscules)
  password_hash text not null,               -- hash djb2 calculé côté client
  created_at    timestamptz not null default now()
);

create table if not exists app.word_mistakes (
  id          bigint generated always as identity primary key,
  account_id  uuid not null references app.accounts(id) on delete cascade,
  verse_key   text not null,                 -- ex "4:124"
  position    int  not null,                 -- index du mot dans le verset
  page        int  not null,
  type        text not null,                 -- 'oubli' | 'inversion' | 'harakat' | 'mot'
  at          timestamptz not null default now()
);
create index if not exists idx_word_mistakes_account on app.word_mistakes(account_id, at);

create table if not exists app.verse_results (
  id          bigint generated always as identity primary key,
  account_id  uuid not null references app.accounts(id) on delete cascade,
  verse_key   text not null,
  page        int  not null,
  found       boolean not null,
  exercise    text not null,
  at          timestamptz not null default now()
);
create index if not exists idx_verse_results_account on app.verse_results(account_id, at);

-- Derniers réglages saisis par exercice (mémoire des écrans de configuration)
create table if not exists app.setups (
  account_id  uuid not null references app.accounts(id) on delete cascade,
  exercise_id text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (account_id, exercise_id)
);

-- ---------- RLS : tout verrouillé (accès via RPC uniquement) ----------

alter table app.accounts       enable row level security;
alter table app.word_mistakes  enable row level security;
alter table app.verse_results  enable row level security;
alter table app.setups         enable row level security;
-- Aucune policy => aucun accès direct pour anon/authenticated.

-- ---------------------------------------------------------------------------
-- Fonctions RPC (SECURITY DEFINER) — seule surface exposée au client
-- ---------------------------------------------------------------------------

-- Résout l'account_id à partir de l'identifiant normalisé.
create or replace function app.account_id_for(p_username text)
returns uuid
language sql
security definer
set search_path = app
as $$
  select id from app.accounts where username_key = lower(trim(p_username));
$$;

-- Inscription : échoue si l'identifiant existe déjà.
create or replace function app.app_register(p_username text, p_password_hash text)
returns jsonb
language plpgsql
security definer
set search_path = app
as $$
declare
  v_name text := trim(p_username);
  v_key  text := lower(trim(p_username));
begin
  if v_name = '' then
    return jsonb_build_object('ok', false, 'error', 'Identifiant requis');
  end if;
  if coalesce(p_password_hash, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Mot de passe requis');
  end if;
  if exists (select 1 from app.accounts where username_key = v_key) then
    return jsonb_build_object('ok', false, 'error', 'Cet identifiant existe déjà. Connectez-vous.');
  end if;
  insert into app.accounts (username, username_key, password_hash)
  values (v_name, v_key, p_password_hash);
  return jsonb_build_object('ok', true);
end;
$$;

-- Connexion : l'identifiant doit exister et le hash correspondre.
create or replace function app.app_login(p_username text, p_password_hash text)
returns jsonb
language plpgsql
security definer
set search_path = app
as $$
declare
  v_hash text;
begin
  select password_hash into v_hash
  from app.accounts where username_key = lower(trim(p_username));
  if v_hash is null then
    return jsonb_build_object('ok', false, 'error', 'Cet identifiant n''existe pas. Créez un compte.');
  end if;
  if v_hash <> coalesce(p_password_hash, '') then
    return jsonb_build_object('ok', false, 'error', 'Mot de passe incorrect');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Charge toutes les stats d'un compte : { wordMistakes:[...], verseResults:[...] }
create or replace function app.app_load_stats(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = app
as $$
declare
  v_id uuid := app.account_id_for(p_username);
begin
  if v_id is null then
    return jsonb_build_object('wordMistakes', '[]'::jsonb, 'verseResults', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'wordMistakes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'verseKey', verse_key, 'position', position, 'page', page,
        'type', type, 'at', to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) order by at)
      from app.word_mistakes where account_id = v_id
    ), '[]'::jsonb),
    'verseResults', coalesce((
      select jsonb_agg(jsonb_build_object(
        'verseKey', verse_key, 'page', page, 'found', found,
        'exercise', exercise, 'at', to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) order by at)
      from app.verse_results where account_id = v_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Enregistre un lot de fautes de mots. p_mistakes = tableau JSON d'objets
-- { verseKey, position, page, type, at }.
create or replace function app.app_record_word_mistakes(p_username text, p_mistakes jsonb)
returns void
language plpgsql
security definer
set search_path = app
as $$
declare
  v_id uuid := app.account_id_for(p_username);
begin
  if v_id is null or p_mistakes is null or jsonb_typeof(p_mistakes) <> 'array' then
    return;
  end if;
  insert into app.word_mistakes (account_id, verse_key, position, page, type, at)
  select v_id,
         m->>'verseKey',
         (m->>'position')::int,
         (m->>'page')::int,
         m->>'type',
         coalesce((m->>'at')::timestamptz, now())
  from jsonb_array_elements(p_mistakes) as m;
end;
$$;

-- Enregistre un résultat de quiz. p_result = { verseKey, page, found, exercise, at }.
create or replace function app.app_record_verse_result(p_username text, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = app
as $$
declare
  v_id uuid := app.account_id_for(p_username);
begin
  if v_id is null or p_result is null then
    return;
  end if;
  insert into app.verse_results (account_id, verse_key, page, found, exercise, at)
  values (
    v_id,
    p_result->>'verseKey',
    (p_result->>'page')::int,
    (p_result->>'found')::boolean,
    p_result->>'exercise',
    coalesce((p_result->>'at')::timestamptz, now())
  );
end;
$$;

-- Sauvegarde (upsert) les derniers réglages d'un exercice.
create or replace function app.app_save_setup(p_username text, p_exercise_id text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = app
as $$
declare
  v_id uuid := app.account_id_for(p_username);
begin
  if v_id is null then
    return;
  end if;
  insert into app.setups (account_id, exercise_id, data, updated_at)
  values (v_id, p_exercise_id, p_data, now())
  on conflict (account_id, exercise_id)
  do update set data = excluded.data, updated_at = now();
end;
$$;

-- Charge tous les réglages d'un compte : { exercise_id: data, ... }
create or replace function app.app_load_setups(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = app
as $$
declare
  v_id uuid := app.account_id_for(p_username);
begin
  if v_id is null then
    return '{}'::jsonb;
  end if;
  return coalesce((
    select jsonb_object_agg(exercise_id, data)
    from app.setups where account_id = v_id
  ), '{}'::jsonb);
end;
$$;

-- ---------- Permissions : n'exposer QUE les fonctions applicatives ----------

revoke all on schema app from anon, authenticated;
grant usage on schema app to anon, authenticated;

-- On n'accorde execute que sur les fonctions publiques (pas account_id_for).
grant execute on function app.app_register(text, text)              to anon, authenticated;
grant execute on function app.app_login(text, text)                 to anon, authenticated;
grant execute on function app.app_load_stats(text)                  to anon, authenticated;
grant execute on function app.app_record_word_mistakes(text, jsonb) to anon, authenticated;
grant execute on function app.app_record_verse_result(text, jsonb)  to anon, authenticated;
grant execute on function app.app_save_setup(text, text, jsonb)     to anon, authenticated;
grant execute on function app.app_load_setups(text)                 to anon, authenticated;
