-- Email de compte : identifiant alternatif de connexion + récupération.
-- Ajoute une adresse email (optionnelle, unique) aux comptes, autorise la
-- connexion par identifiant OU email, et expose le changement de mot de passe
-- et la pose/màj de l'email (le mot de passe courant est exigé à chaque fois).
-- Même modèle que 0001 : tables en schéma `app` (RLS, zéro policy), accès par
-- fonctions RPC SECURITY DEFINER dans `public`.

-- ---------- Colonnes ----------

alter table app.accounts add column if not exists email     text;
alter table app.accounts add column if not exists email_key text; -- lower(trim(email)), clé de résolution

-- Unicité de l'email (quand présent), insensible à la casse.
create unique index if not exists uq_accounts_email_key on app.accounts(email_key) where email_key is not null;

-- ---------- Résolution d'un compte par identifiant OU email ----------

create or replace function public.account_id_for(p_username text)
returns uuid
language sql
security definer
set search_path = app, pg_catalog
as $$
  select id from app.accounts
  where username_key = lower(trim(p_username))
     or (email_key is not null and email_key = lower(trim(p_username)))
  limit 1;
$$;

-- ---------- Connexion : identifiant OU email + hash ----------
-- Renvoie le username CANONIQUE (le client y rattache la session et toutes les
-- données, même si l'utilisateur s'est connecté via son email).

create or replace function public.app_login(p_username text, p_password_hash text)
returns jsonb
language plpgsql
security definer
set search_path = app, pg_catalog
as $$
declare
  v_name text;
  v_hash text;
begin
  select username, password_hash into v_name, v_hash
  from app.accounts
  where username_key = lower(trim(p_username))
     or (email_key is not null and email_key = lower(trim(p_username)))
  limit 1;
  if v_hash is null then
    return jsonb_build_object('ok', false, 'error', 'Cet identifiant n''existe pas. Créez un compte.');
  end if;
  if v_hash <> coalesce(p_password_hash, '') then
    return jsonb_build_object('ok', false, 'error', 'Mot de passe incorrect');
  end if;
  return jsonb_build_object('ok', true, 'username', v_name);
end;
$$;

-- ---------- Infos compte (email affiché dans l'espace compte) ----------
-- Gardé par le hash : on ne révèle l'email qu'à qui connaît le mot de passe.

create or replace function public.app_get_account(p_username text, p_password_hash text)
returns jsonb
language plpgsql
security definer
set search_path = app, pg_catalog
as $$
declare
  v_name text;
  v_hash text;
  v_mail text;
begin
  select username, password_hash, email into v_name, v_hash, v_mail
  from app.accounts
  where username_key = lower(trim(p_username))
     or (email_key is not null and email_key = lower(trim(p_username)))
  limit 1;
  if v_hash is null or v_hash <> coalesce(p_password_hash, '') then
    return jsonb_build_object('ok', false, 'error', 'Identifiants invalides');
  end if;
  return jsonb_build_object('ok', true, 'username', v_name, 'email', coalesce(v_mail, ''));
end;
$$;

-- ---------- Poser / modifier / retirer l'email (mot de passe exigé) ----------
-- p_email vide ("") retire l'email. Email déjà pris par un AUTRE compte → refus.

create or replace function public.app_set_email(p_username text, p_password_hash text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = app, pg_catalog
as $$
declare
  v_id   uuid;
  v_hash text;
  v_mail text := nullif(lower(trim(p_email)), '');
begin
  select id, password_hash into v_id, v_hash
  from app.accounts
  where username_key = lower(trim(p_username))
     or (email_key is not null and email_key = lower(trim(p_username)))
  limit 1;
  if v_id is null or v_hash <> coalesce(p_password_hash, '') then
    return jsonb_build_object('ok', false, 'error', 'Identifiants invalides');
  end if;
  if v_mail is not null and v_mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'Adresse email invalide');
  end if;
  if v_mail is not null and exists (
    select 1 from app.accounts where email_key = v_mail and id <> v_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Cet email est déjà utilisé par un autre compte.');
  end if;
  update app.accounts
    set email = nullif(trim(p_email), ''), email_key = v_mail
    where id = v_id;
  return jsonb_build_object('ok', true, 'email', coalesce(v_mail, ''));
end;
$$;

-- ---------- Changer le mot de passe (ancien exigé) ----------

create or replace function public.app_change_password(p_username text, p_old_hash text, p_new_hash text)
returns jsonb
language plpgsql
security definer
set search_path = app, pg_catalog
as $$
declare
  v_id   uuid;
  v_hash text;
begin
  if coalesce(p_new_hash, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Nouveau mot de passe requis');
  end if;
  select id, password_hash into v_id, v_hash
  from app.accounts
  where username_key = lower(trim(p_username))
     or (email_key is not null and email_key = lower(trim(p_username)))
  limit 1;
  if v_id is null or v_hash <> coalesce(p_old_hash, '') then
    return jsonb_build_object('ok', false, 'error', 'Mot de passe actuel incorrect');
  end if;
  update app.accounts set password_hash = p_new_hash where id = v_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- Permissions ----------

grant execute on function public.app_get_account(text, text)              to anon, authenticated;
grant execute on function public.app_set_email(text, text, text)          to anon, authenticated;
grant execute on function public.app_change_password(text, text, text)    to anon, authenticated;
