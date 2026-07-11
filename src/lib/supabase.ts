// Client Supabase (schéma applicatif `app`) — suivi de progression.
// Les variables d'env sont publiques (clé anon) : c'est prévu, la sécurité
// repose sur les fonctions RPC SECURITY DEFINER (voir supabase/migrations).
// Si les variables sont absentes, `supabase` vaut null et l'app fonctionne
// en mode 100 % localStorage (dégradation silencieuse).

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: false },
        db: { schema: 'app' },
      })
    : null;

/** Vrai si Supabase est configuré (sinon on reste en localStorage seul). */
export const isSupabaseEnabled = supabase !== null;
