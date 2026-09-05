// Persistance du programme de récitation : localStorage = source de vérité des
// LECTURES (synchrone), Supabase = sauvegarde/synchro entre appareils via RPC
// (write-through fire-and-forget), exactement comme progressSync. Sans compte
// connecté ou sans Supabase configuré, tout fonctionne 100 % en local.
// L'historique (sessions, évaluations) est en APPEND : jamais purgé (brief §19).

import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/utils/exercises/userStats';
import type { Cycle, DayState, PageEvaluation, Program, SessionRecord } from './types';

const PREFIX = 'almuraja3a:recitation:';
const KEYS = {
  program: `${PREFIX}program`,
  cycle: `${PREFIX}cycle`,
  dayState: `${PREFIX}dayState`,
  evaluations: `${PREFIX}evaluations`,
  sessions: `${PREFIX}sessions`,
} as const;

type StateKey = keyof typeof KEYS;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function warn(context: string, error: unknown) {
  if (typeof console !== 'undefined') console.debug(`[recitationStore] ${context}`, error);
}

function readLocal<T>(key: StateKey): T | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(KEYS[key]);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: StateKey, value: unknown): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEYS[key], JSON.stringify(value));
  } catch (e) {
    warn(`writeLocal:${key}`, e);
  }
}

/** Pousse une clé d'état vers Supabase (fire-and-forget). */
function pushRemote(key: StateKey, value: unknown): void {
  const user = getCurrentUser();
  if (!supabase || !user) return;
  supabase
    .rpc('app_recitation_save', { p_username: user, p_key: key, p_data: value })
    .then(({ error }) => {
      if (error) warn(`pushRemote:${key}`, error);
    });
}

// ---------------------------------------------------------------------------
// Programme / cycle / état du jour (documents remplacés en bloc)
// ---------------------------------------------------------------------------

export function loadProgram(): Program | null {
  return readLocal<Program>('program');
}

export function saveProgram(program: Program): void {
  writeLocal('program', program);
  pushRemote('program', program);
}

export function loadCycle(): Cycle | null {
  return readLocal<Cycle>('cycle');
}

export function saveCycle(cycle: Cycle): void {
  writeLocal('cycle', cycle);
  pushRemote('cycle', cycle);
}

export function loadDayState(): DayState | null {
  return readLocal<DayState>('dayState');
}

export function saveDayState(state: DayState): void {
  writeLocal('dayState', state);
  pushRemote('dayState', state);
}

/** Efface l'état du jour (reconstruit par ensureToday au prochain rendu). */
export function clearDayState(): void {
  if (isBrowser()) {
    try {
      window.localStorage.removeItem(KEYS.dayState);
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Historique en append (évaluations, sessions)
// ---------------------------------------------------------------------------

export function loadEvaluations(): PageEvaluation[] {
  return readLocal<PageEvaluation[]>('evaluations') ?? [];
}

/** Historique par page (chronologique), pour currentLevel / renforcement. */
export function evaluationsByPage(evals: PageEvaluation[]): Map<number, PageEvaluation[]> {
  const map = new Map<number, PageEvaluation[]>();
  for (const e of evals) {
    const list = map.get(e.page);
    if (list) list.push(e);
    else map.set(e.page, [e]);
  }
  return map;
}

export function appendEvaluation(evaluation: PageEvaluation): PageEvaluation[] {
  const all = [...loadEvaluations(), evaluation];
  writeLocal('evaluations', all);
  const user = getCurrentUser();
  if (supabase && user) {
    supabase
      .rpc('app_recitation_log_evaluation', { p_username: user, p_evaluation: evaluation })
      .then(({ error }) => {
        if (error) warn('appendEvaluation', error);
      });
  }
  return all;
}

export function loadSessions(): SessionRecord[] {
  return readLocal<SessionRecord[]>('sessions') ?? [];
}

export function appendSession(record: SessionRecord): SessionRecord[] {
  const all = [...loadSessions(), record];
  writeLocal('sessions', all);
  const user = getCurrentUser();
  if (supabase && user) {
    supabase
      .rpc('app_recitation_log_session', { p_username: user, p_session: record })
      .then(({ error }) => {
        if (error) warn('appendSession', error);
      });
  }
  return all;
}

// ---------------------------------------------------------------------------
// Hydratation (Supabase → cache local, à la connexion)
// ---------------------------------------------------------------------------

/** Recharge tout depuis Supabase et écrase le cache local si des données existent. */
export async function hydrateRecitationFromRemote(username: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.rpc('app_recitation_load', { p_username: username });
  if (error || !data) {
    warn('hydrate', error);
    return;
  }
  const d = data as {
    state?: Partial<Record<StateKey, unknown>>;
    evaluations?: PageEvaluation[];
    sessions?: SessionRecord[];
  };
  if (d.state) {
    for (const key of ['program', 'cycle', 'dayState'] as StateKey[]) {
      if (d.state[key] != null) writeLocal(key, d.state[key]);
    }
  }
  if (Array.isArray(d.evaluations) && d.evaluations.length) writeLocal('evaluations', d.evaluations);
  if (Array.isArray(d.sessions) && d.sessions.length) writeLocal('sessions', d.sessions);
}
