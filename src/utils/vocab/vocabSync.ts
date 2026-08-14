// Synchronisation Supabase du vocabulaire (par COMPTE, pas par appareil).
// localStorage reste la source de lecture synchrone ; Supabase fait autorité
// entre appareils : hydratation à la connexion + write-through à chaque écriture.
// Si Supabase n'est pas configuré ou l'utilisateur non connecté → no-op (local seul).

import { supabase } from '@/lib/supabase';
import { getVocab, setVocabList, type VocabEntry } from './vocabStore';

function warn(context: string, error: unknown) {
  if (typeof console !== 'undefined') console.debug(`[vocabSync] ${context}`, error);
}

/** Charge le vocabulaire distant d'un compte (null si Supabase absent/erreur). */
export async function fetchVocabRemote(username: string): Promise<VocabEntry[] | null> {
  if (!supabase || !username) return null;
  const { data, error } = await supabase.rpc('app_vocab_load', { p_username: username });
  if (error) {
    warn('fetchVocabRemote', error);
    return null;
  }
  return Array.isArray(data) ? (data as VocabEntry[]) : [];
}

/** Pousse (upsert) une entrée en arrière-plan. */
export function pushVocabEntry(username: string | null, entry: VocabEntry): void {
  if (!supabase || !username) return;
  supabase
    .rpc('app_vocab_upsert', { p_username: username, p_entry_id: entry.id, p_data: entry })
    .then(({ error }) => error && warn('pushVocabEntry', error));
}

/** Supprime une entrée à distance. */
export function deleteVocabRemote(username: string | null, entryId: string): void {
  if (!supabase || !username) return;
  supabase
    .rpc('app_vocab_delete', { p_username: username, p_entry_id: entryId })
    .then(({ error }) => error && warn('deleteVocabRemote', error));
}

/** Upsert en lot : { entry_id: entry, ... }. */
export function pushVocabBulk(username: string | null, entries: VocabEntry[]): void {
  if (!supabase || !username || entries.length === 0) return;
  const obj: Record<string, VocabEntry> = {};
  for (const e of entries) obj[e.id] = e;
  supabase
    .rpc('app_vocab_upsert_bulk', { p_username: username, p_entries: obj })
    .then(({ error }) => error && warn('pushVocabBulk', error));
}

/** Fusionne deux versions d'une même entrée en gardant la meilleure progression. */
function mergeProgress(a: VocabEntry, b: VocabEntry): VocabEntry {
  const la = a.lastReviewed ? Date.parse(a.lastReviewed) : 0;
  const lb = b.lastReviewed ? Date.parse(b.lastReviewed) : 0;
  const base = lb > la ? b : a; // la révision la plus récente porte les champs d'analyse
  return {
    ...base,
    box: Math.max(a.box, b.box),
    seen: Math.max(a.seen, b.seen),
    correct: Math.max(a.correct, b.correct),
    lastReviewed: lb > la ? b.lastReviewed : a.lastReviewed,
  };
}

/**
 * Hydrate le cache local depuis Supabase à la connexion : fusionne distant+local
 * (union par id, meilleure progression conservée), écrit en local, et repousse la
 * fusion pour faire converger le distant. À appeler APRÈS que le cookie user est posé.
 */
// Réinitialisation « le distant fait autorité » (une fois par utilisateur) :
// après le grand nettoyage du vocabulaire (dédup + forme coranique exacte),
// le local doit être REMPLACÉ par le distant, sans remonter les anciennes
// entrées locales (sinon les doublons purgés ressusciteraient).
const RESET_KEY = 'almuraja3a:vocab-remote-reset:';
const RESET_VERSION = '2026-08-clean-6';

export async function hydrateVocab(username: string): Promise<void> {
  const remote = await fetchVocabRemote(username);
  if (remote == null) return; // Supabase absent/injoignable → on garde le local

  const resetKey = RESET_KEY + username;
  const needsReset =
    typeof window !== 'undefined' && window.localStorage.getItem(resetKey) !== RESET_VERSION;
  if (needsReset) {
    // Le distant écrase le local ; on ne repousse rien (pas de résurrection).
    setVocabList(remote);
    try {
      window.localStorage.setItem(resetKey, RESET_VERSION);
    } catch {
      /* stockage indisponible */
    }
    return;
  }

  const byId = new Map<string, VocabEntry>();
  for (const e of remote) byId.set(e.id, e);
  for (const e of getVocab()) {
    const r = byId.get(e.id);
    byId.set(e.id, r ? mergeProgress(r, e) : e);
  }
  const merged = [...byId.values()];
  setVocabList(merged);
  pushVocabBulk(username, merged); // convergence distante
}
