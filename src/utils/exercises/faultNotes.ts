// Fautes de LECTURE déclarées à la main (mode « Fautes » de la Lecture).
//
// Une faute = un mot (verset + position) + le texte où l'on explique ce qu'on
// a raté. Cycle de vie :
//   - déclarée          → point ROUGE sous le mot ;
//   - « pas refaite » ×1 → point ORANGE ;
//   - « pas refaite » ×OK_TO_RESOLVE → résolue, le point disparaît.
//   - « je l'ai refaite » → repasse au rouge, compteur remis à zéro.
//
// Stockage : localStorage par utilisateur (+ miroir natif durable) et
// synchronisation par COMPTE via la table des réglages (RPC app_save_setup /
// app_load_setups, clé SETUP_ID) — aucune migration nécessaire. Les fautes
// résolues ou supprimées restent comme « pierres tombales » datées, pour que
// la fusion entre appareils ne les fasse pas réapparaître.

import { getCurrentUser } from './userStats';
import { pushSetup, fetchSetups } from './progressSync';
import { scheduleStateBackup } from '@/utils/nativeStateBackup';

/** Nombre de « pas refaite » qui efface la faute (le 1er la passe en orange). */
export const OK_TO_RESOLVE = 4;

export interface FaultNote {
  verseKey: string;
  position: number;
  page: number;
  note: string;
  ok: number; // nombre de « pas refaite » depuis la déclaration (ou le dernier « refaite »)
  status: 'active' | 'resolved' | 'deleted';
  createdAt: string;
  updatedAt: string;
}

interface FaultData {
  faults: Record<string, FaultNote>; // clé "verseKey#position"
  clearedAt?: string; // « Tout effacer » : tout ce qui est antérieur est ignoré
}

const PREFIX = 'almuraja3a:fault-notes:';
// Date du dernier « Tout effacer » (lue aussi par userStats pour masquer les
// anciennes fautes déclarées, sans dépendance de module).
export const CLEARED_PREFIX = 'almuraja3a:faults-cleared-at:';
const SETUP_ID = 'lecture-faults';

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeFaults(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function key(verseKey: string, position: number) {
  return `${verseKey}#${position}`;
}

function user(): string | null {
  return typeof window === 'undefined' ? null : getCurrentUser();
}

function read(): FaultData {
  const u = user();
  if (!u) return { faults: {} };
  try {
    const raw = window.localStorage.getItem(PREFIX + u);
    const d = raw ? JSON.parse(raw) : null;
    return d && typeof d === 'object' && d.faults ? d : { faults: {} };
  } catch {
    return { faults: {} };
  }
}

function write(d: FaultData, push = true) {
  const u = user();
  if (!u) return;
  try {
    window.localStorage.setItem(PREFIX + u, JSON.stringify(d));
    if (d.clearedAt) window.localStorage.setItem(CLEARED_PREFIX + u.toLowerCase(), d.clearedAt);
    scheduleStateBackup();
  } catch {
    /* quota — silencieux */
  }
  if (push) pushSetup(u, SETUP_ID, d as unknown as Record<string, unknown>);
  for (const l of listeners) l();
}

/** Fautes actives (à afficher), par clé "verseKey#position". */
export function activeFaults(): Map<string, FaultNote> {
  const out = new Map<string, FaultNote>();
  for (const [k, f] of Object.entries(read().faults)) if (f.status === 'active') out.set(k, f);
  return out;
}

export function getFault(verseKey: string, position: number): FaultNote | null {
  const f = read().faults[key(verseKey, position)];
  return f && f.status === 'active' ? f : null;
}

/** Déclare (ou réécrit le texte d') une faute sur un mot. */
export function declareFault(verseKey: string, position: number, page: number, note: string): void {
  const d = read();
  const k = key(verseKey, position);
  const now = new Date().toISOString();
  const prev = d.faults[k];
  d.faults[k] =
    prev && prev.status === 'active'
      ? { ...prev, note, updatedAt: now }
      : { verseKey, position, page, note, ok: 0, status: 'active', createdAt: now, updatedAt: now };
  write(d);
}

/** « Je n'ai pas refait la faute » : orange au 1er, effacée à OK_TO_RESOLVE. */
export function markNotRepeated(verseKey: string, position: number): FaultNote | null {
  const d = read();
  const k = key(verseKey, position);
  const f = d.faults[k];
  if (!f || f.status !== 'active') return null;
  const ok = f.ok + 1;
  d.faults[k] = { ...f, ok, status: ok >= OK_TO_RESOLVE ? 'resolved' : 'active', updatedAt: new Date().toISOString() };
  write(d);
  return d.faults[k];
}

/** « Je l'ai refaite » : retour au rouge, compteur remis à zéro. */
export function markRepeated(verseKey: string, position: number): void {
  const d = read();
  const k = key(verseKey, position);
  const f = d.faults[k];
  if (!f || f.status !== 'active') return;
  d.faults[k] = { ...f, ok: 0, updatedAt: new Date().toISOString() };
  write(d);
}

export function deleteFault(verseKey: string, position: number): void {
  const d = read();
  const k = key(verseKey, position);
  const f = d.faults[k];
  if (!f) return;
  d.faults[k] = { ...f, status: 'deleted', updatedAt: new Date().toISOString() };
  write(d);
}

/** Efface TOUTES les fautes : les nouvelles (notes) et les anciennes déclarées. */
export function clearAllFaults(): void {
  const now = new Date().toISOString();
  const d = read();
  for (const [k, f] of Object.entries(d.faults)) {
    if (f.status === 'active') d.faults[k] = { ...f, status: 'deleted', updatedAt: now };
  }
  d.clearedAt = now;
  write(d);
}

/**
 * Récupère la version du compte (autre appareil) et fusionne : par mot, la
 * version la plus récente gagne ; le « Tout effacer » le plus récent s'applique.
 */
export async function hydrateFaults(username: string): Promise<void> {
  const setups = await fetchSetups(username).catch(() => null);
  const remote = setups?.[SETUP_ID] as FaultData | undefined;
  if (!remote || typeof remote !== 'object' || !remote.faults) return;
  const local = read();
  const merged: FaultData = { faults: { ...local.faults } };
  for (const [k, f] of Object.entries(remote.faults)) {
    const l = merged.faults[k];
    if (!l || (f.updatedAt ?? '') > (l.updatedAt ?? '')) merged.faults[k] = f;
  }
  const cleared = [local.clearedAt, remote.clearedAt].filter(Boolean).sort().pop();
  if (cleared) {
    merged.clearedAt = cleared;
    for (const [k, f] of Object.entries(merged.faults)) {
      if (f.status === 'active' && f.updatedAt < cleared) merged.faults[k] = { ...f, status: 'deleted' };
    }
  }
  write(merged, JSON.stringify(merged) !== JSON.stringify(remote));
}
