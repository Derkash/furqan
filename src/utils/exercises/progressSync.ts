// Couche de synchronisation Supabase (write-through + hydratation).
// localStorage reste la source de vérité pour les LECTURES (synchrones, rapides).
// Supabase sert de sauvegarde/synchronisation entre appareils :
//   - à la connexion, on hydrate le cache local depuis Supabase ;
//   - à chaque écriture locale, on pousse en arrière-plan (fire-and-forget).
// Si Supabase n'est pas configuré, tout est no-op → app 100 % locale.

import { supabase } from '@/lib/supabase';
import type { WordMistake, VerseResult, UserStats } from './userStats';

/** N'échoue jamais côté UI : on log en debug et on continue en local. */
function warn(context: string, error: unknown) {
  if (typeof console !== 'undefined') {
    console.debug(`[progressSync] ${context}`, error);
  }
}

// ---------- Auth distante ----------

/** Suppression du compte distant (App Store 5.1.1(v)) — hash exigé. */
export async function deleteAccountRemote(
  username: string,
  passwordHash: string
): Promise<boolean | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('app_delete_account', {
    p_username: username,
    p_password_hash: passwordHash,
  });
  if (error) {
    warn('deleteAccountRemote', error);
    return null;
  }
  return data as boolean;
}

export async function registerRemote(
  username: string,
  passwordHash: string
): Promise<{ ok: boolean; error?: string } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('app_register', {
    p_username: username,
    p_password_hash: passwordHash,
  });
  if (error) {
    warn('registerRemote', error);
    return null; // laisse le fallback local décider
  }
  return data as { ok: boolean; error?: string };
}

export async function loginRemote(
  username: string,
  passwordHash: string
): Promise<{ ok: boolean; error?: string } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('app_login', {
    p_username: username,
    p_password_hash: passwordHash,
  });
  if (error) {
    warn('loginRemote', error);
    return null;
  }
  return data as { ok: boolean; error?: string };
}

// ---------- Hydratation (Supabase → cache local) ----------

export async function fetchStats(username: string): Promise<UserStats | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('app_load_stats', { p_username: username });
  if (error || !data) {
    warn('fetchStats', error);
    return null;
  }
  const d = data as { wordMistakes?: WordMistake[]; verseResults?: VerseResult[] };
  return {
    wordMistakes: Array.isArray(d.wordMistakes) ? d.wordMistakes : [],
    verseResults: Array.isArray(d.verseResults) ? d.verseResults : [],
  };
}

export async function fetchSetups(username: string): Promise<Record<string, unknown> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('app_load_setups', { p_username: username });
  if (error || !data) {
    warn('fetchSetups', error);
    return null;
  }
  return data as Record<string, unknown>;
}

// ---------- Écritures (cache local → Supabase, arrière-plan) ----------

export function pushWordMistakes(username: string, mistakes: WordMistake[]): void {
  if (!supabase || mistakes.length === 0) return;
  supabase
    .rpc('app_record_word_mistakes', { p_username: username, p_mistakes: mistakes })
    .then(({ error }) => error && warn('pushWordMistakes', error));
}

export function pushVerseResult(username: string, result: VerseResult): void {
  if (!supabase) return;
  supabase
    .rpc('app_record_verse_result', { p_username: username, p_result: result })
    .then(({ error }) => error && warn('pushVerseResult', error));
}

export function pushSetup(username: string, exerciseId: string, data: unknown): void {
  if (!supabase) return;
  supabase
    .rpc('app_save_setup', { p_username: username, p_exercise_id: exerciseId, p_data: data })
    .then(({ error }) => error && warn('pushSetup', error));
}
