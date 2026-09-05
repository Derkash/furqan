-- almuraja3a — programme de récitation adaptatif (0004)
-- Même patron que 0001 : tables dans le schéma `app` (RLS, non exposées),
-- accès UNIQUEMENT via des RPC SECURITY DEFINER dans `public`, indexées par
-- identifiant de compte. localStorage reste la source de vérité en lecture ;
-- Supabase sert de sauvegarde et de synchronisation entre appareils.

-- ---------- Tables ----------

-- État courant par clé ('program' | 'cycle' | 'dayState') : documents jsonb
-- remplacés en bloc, comme app.setups.
create table if not exists app.recitation_state (
  account_id  uuid not null references app.accounts(id) on delete cascade,
  key         text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (account_id, key)
);

-- Historique des évaluations de pages (append, jamais purgé — brief §19).
create table if not exists app.recitation_evaluations (
  id          bigint generated always as identity primary key,
  account_id  uuid not null references app.accounts(id) on delete cascade,
  page        int  not null,
  level       text not null,  -- 'maitrisee' | 'plutot-maitrisee' | 'fragile' | 'a-retravailler'
  note        text,
  at          timestamptz not null
);
create index if not exists idx_recitation_evals_account on app.recitation_evaluations(account_id, at);

-- Historique des créneaux réalisés / partiels / manqués (append).
create table if not exists app.recitation_sessions (
  id          bigint generated always as identity primary key,
  account_id  uuid not null references app.accounts(id) on delete cascade,
  data        jsonb not null, -- SessionRecord complet (date, slot, pages, statut, reports)
  at          timestamptz not null default now()
);
create index if not exists idx_recitation_sessions_account on app.recitation_sessions(account_id, at);

-- ---------- RLS : tables verrouillées (accès via RPC uniquement) ----------

alter table app.recitation_state       enable row level security;
alter table app.recitation_evaluations enable row level security;
alter table app.recitation_sessions    enable row level security;

-- ---------- RPC ----------

-- Sauvegarde d'une clé d'état (program / cycle / dayState).
create or replace function public.app_recitation_save(p_username text, p_key text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = app, pg_catalog
as $$
declare
  v_id uuid := public.account_id_for(p_username);
begin
  if v_id is null or p_key not in ('program', 'cycle', 'dayState') then
    return;
  end if;
  insert into app.recitation_state (account_id, key, data, updated_at)
  values (v_id, p_key, p_data, now())
  on conflict (account_id, key)
  do update set data = excluded.data, updated_at = now();
end;
$$;

-- Journalise une évaluation de page.
create or replace function public.app_recitation_log_evaluation(p_username text, p_evaluation jsonb)
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
  insert into app.recitation_evaluations (account_id, page, level, note, at)
  values (
    v_id,
    (p_evaluation->>'page')::int,
    p_evaluation->>'level',
    p_evaluation->>'note',
    coalesce((p_evaluation->>'at')::timestamptz, now())
  );
end;
$$;

-- Journalise un créneau (SessionRecord complet en jsonb).
create or replace function public.app_recitation_log_session(p_username text, p_session jsonb)
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
  insert into app.recitation_sessions (account_id, data) values (v_id, p_session);
end;
$$;

-- Charge tout : { state: {program, cycle, dayState}, evaluations: [...], sessions: [...] }.
create or replace function public.app_recitation_load(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = app, pg_catalog
as $$
declare
  v_id uuid := public.account_id_for(p_username);
begin
  if v_id is null then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'state', coalesce((
      select jsonb_object_agg(key, data)
      from app.recitation_state where account_id = v_id
    ), '{}'::jsonb),
    'evaluations', coalesce((
      select jsonb_agg(jsonb_build_object('page', page, 'level', level, 'note', note, 'at', at) order by at)
      from app.recitation_evaluations where account_id = v_id
    ), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(data order by at)
      from app.recitation_sessions where account_id = v_id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------- Permissions ----------

grant execute on function public.app_recitation_save(text, text, jsonb)          to anon, authenticated;
grant execute on function public.app_recitation_log_evaluation(text, jsonb)      to anon, authenticated;
grant execute on function public.app_recitation_log_session(text, jsonb)         to anon, authenticated;
grant execute on function public.app_recitation_load(text)                       to anon, authenticated;
