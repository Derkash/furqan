# Supabase — suivi de progression almuraja3a

Sauvegarde et synchronisation de la progression (comptes, fautes de mots,
résultats de quiz, derniers réglages d'exercice) entre appareils.

## Architecture

- **localStorage** = cache local, source des lectures synchrones (l'app marche
  sans Supabase, en mode hors-ligne dégradé).
- **Supabase** = sauvegarde + partage entre appareils :
  - hydratation du cache local à la connexion ;
  - write-through en arrière-plan à chaque enregistrement.
- **Sécurité légère assumée** (outil personnel) : identifiant + mot de passe
  hashé côté client (djb2). Les tables (schéma `app`) sont verrouillées par RLS ;
  l'accès passe uniquement par des fonctions RPC `SECURITY DEFINER` — le rôle
  anon ne peut pas lire les tables (pas de dump des hashs).

Schéma : `supabase/migrations/0001_init_progress.sql`.

## Mise en place (une fois)

1. Créer un projet sur https://supabase.com (noter l'URL et la clé `anon`).
2. Lier le projet local :
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```
3. Pousser le schéma :
   ```bash
   npx supabase db push
   ```
4. Renseigner l'environnement de l'app :
   ```bash
   cp .env.local.example .env.local
   # puis coller NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```
5. Redémarrer `npm run dev`.

## Développement local (optionnel)

```bash
npx supabase start      # stack locale (Docker requis)
npx supabase db reset   # applique les migrations sur la base locale
```

## Fonctions RPC exposées

| Fonction | Rôle |
|----------|------|
| `app_register(username, password_hash)` | Inscription |
| `app_login(username, password_hash)` | Connexion |
| `app_load_stats(username)` | Charge fautes + résultats |
| `app_record_word_mistakes(username, mistakes[])` | Ajoute des fautes de mots |
| `app_record_verse_result(username, result)` | Ajoute un résultat de quiz |
| `app_save_setup(username, exercise_id, data)` | Sauvegarde des réglages |
| `app_load_setups(username)` | Charge tous les réglages |
