/**
 * Statistiques pour l'Accueil et la coque (design « Application2 ») :
 * progression du jour, série de jours consécutifs, sessions récentes —
 * calculées depuis les résultats locaux (localStorage-first, comme le reste).
 */
import { getCurrentUser, loadStats, type VerseResult } from '@/utils/exercises/userStats';
import { getExerciseDefinition, isValidExerciseId } from '@/utils/exercises/exerciseRegistry';

/** Objectif quotidien affiché sur l'anneau de progression. */
export const DAILY_GOAL_VERSES = 20;

export interface RecentSession {
  exerciseId: string;
  label: string;
  dayLabel: string;
  accuracy: number; // 0-100
  count: number;
  at: string;
}

export interface HomeStats {
  todayCount: number;
  todayAccuracy: number | null; // null si rien aujourd'hui
  streakDays: number;
  recent: RecentSession[];
  lastExerciseId: string | null;
  lastExerciseLabel: string | null;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function labelForExercise(id: string): string {
  if (isValidExerciseId(id)) return getExerciseDefinition(id as never)?.name ?? id;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function dayLabel(key: string): string {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yest = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  if (key === todayKey) return "Aujourd'hui";
  if (key === yest) return 'Hier';
  const d = new Date(key + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function computeHomeStats(): HomeStats {
  const results: VerseResult[] = loadStats(getCurrentUser()).verseResults ?? [];
  const todayKey = new Date().toISOString().slice(0, 10);

  const todays = results.filter((r) => dayKey(r.at) === todayKey);
  const todayCount = todays.length;
  const todayAccuracy = todayCount
    ? Math.round((todays.filter((r) => r.found).length / todayCount) * 100)
    : null;

  // Série : jours consécutifs (en remontant depuis aujourd'hui ou hier) avec
  // au moins un verset travaillé.
  const days = new Set(results.map((r) => dayKey(r.at)));
  let streakDays = 0;
  const cursor = new Date();
  if (!days.has(todayKey)) cursor.setDate(cursor.getDate() - 1); // série encore vivante hier
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    streakDays++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Sessions récentes : regroupées par (jour, exercice), plus récentes d'abord.
  const groups = new Map<string, { exerciseId: string; day: string; ok: number; total: number; at: string }>();
  for (const r of results) {
    const key = `${dayKey(r.at)}|${r.exercise}`;
    const g = groups.get(key) ?? { exerciseId: r.exercise, day: dayKey(r.at), ok: 0, total: 0, at: r.at };
    g.total++;
    if (r.found) g.ok++;
    if (r.at > g.at) g.at = r.at;
    groups.set(key, g);
  }
  const recent: RecentSession[] = [...groups.values()]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 4)
    .map((g) => ({
      exerciseId: g.exerciseId,
      label: labelForExercise(g.exerciseId),
      dayLabel: dayLabel(g.day),
      accuracy: Math.round((g.ok / g.total) * 100),
      count: g.total,
      at: g.at,
    }));

  const last = recent[0] ?? null;
  return {
    todayCount,
    todayAccuracy,
    streakDays,
    recent,
    lastExerciseId: last && isValidExerciseId(last.exerciseId) ? last.exerciseId : null,
    lastExerciseLabel: last ? last.label : null,
  };
}
