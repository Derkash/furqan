-- Suppression de compte (App Store Review Guideline 5.1.1(v) : toute app qui
-- permet de créer un compte DOIT permettre de le supprimer depuis l'app).
-- Même modèle que le reste : fonction RPC SECURITY DEFINER, seule surface
-- exposée au client ; le mot de passe (hash) est exigé comme pour app_login.

create or replace function public.app_delete_account(p_username text, p_password_hash text)
returns boolean
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id bigint;
begin
  select id into v_id
  from app.accounts
  where lower(username) = lower(p_username)
    and password_hash = p_password_hash;

  if v_id is null then
    return false; -- identifiants invalides : rien n'est supprimé
  end if;

  delete from app.vocab where account_id = v_id;
  delete from app.word_mistakes where account_id = v_id;
  delete from app.verse_results where account_id = v_id;
  delete from app.setups where account_id = v_id;
  delete from app.accounts where id = v_id;
  return true;
end;
$$;

grant execute on function public.app_delete_account(text, text) to anon, authenticated;
