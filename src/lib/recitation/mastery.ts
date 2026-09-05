// Maîtrise et renforcement adaptatif : niveau courant d'une page (à partir de
// l'HISTORIQUE, pas d'une seule récitation), délais de re-proposition et
// agrégats pour l'écran « Maîtrise ». Sections 8, 9 et 10 du brief.

import type { MasteryLevel, PageEvaluation } from './types';

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  'maitrisee': 'Maîtrisée',
  'plutot-maitrisee': 'Plutôt maîtrisée',
  'fragile': 'Fragile',
  'a-retravailler': 'À retravailler',
};

/** Ordre croissant de solidité (pour comparer/dégrader). */
const LEVEL_RANK: Record<MasteryLevel, number> = {
  'a-retravailler': 0,
  'fragile': 1,
  'plutot-maitrisee': 2,
  'maitrisee': 3,
};

/**
 * Niveau courant d'une page d'après ses évaluations (ordre chronologique).
 * Règle du brief : une seule bonne récitation ne suffit pas — « Maîtrisée »
 * exige les DEUX dernières évaluations à ce niveau ; sinon la page est
 * affichée « Plutôt maîtrisée ». Renvoie null si jamais évaluée.
 */
export function currentLevel(evals: PageEvaluation[]): MasteryLevel | null {
  if (!evals.length) return null;
  const last = evals[evals.length - 1].level;
  if (last !== 'maitrisee') return last;
  const prev = evals.length >= 2 ? evals[evals.length - 2].level : null;
  return prev === 'maitrisee' ? 'maitrisee' : 'plutot-maitrisee';
}

/**
 * Délai de re-proposition en jours après une évaluation (brief §9) :
 * maîtrisée / plutôt maîtrisée → cycle normal (null), fragile → 2 jours,
 * à retravailler → dès le lendemain (ou prochain créneau de renforcement).
 */
export function reinforcementDelayDays(level: MasteryLevel): number | null {
  if (level === 'fragile') return 2;
  if (level === 'a-retravailler') return 1;
  return null;
}

/**
 * Pages dues en renforcement à la date donnée : dernière évaluation fragile /
 * à retravailler ET délai écoulé. `evalsByPage` = historique complet par page,
 * `recitedSince` = pages déjà récitées depuis (exclues, pas de doublon).
 */
export function reinforcementDuePages(
  evalsByPage: Map<number, PageEvaluation[]>,
  todayKey: string,
  recitedToday: Set<number>
): number[] {
  const due: number[] = [];
  for (const [page, evals] of evalsByPage) {
    if (!evals.length || recitedToday.has(page)) continue;
    const last = evals[evals.length - 1];
    const delay = reinforcementDelayDays(last.level);
    if (delay == null) continue;
    const evalDay = last.at.slice(0, 10);
    if (daysBetween(evalDay, todayKey) >= delay) due.push(page);
  }
  return due.sort((a, b) => a - b);
}

/** Explication affichable de la re-proposition (brief §9). */
export function reinforcementReason(level: MasteryLevel): string {
  return `Cette page vous est proposée aujourd'hui car elle a été évaluée « ${MASTERY_LABELS[level]} » lors de votre dernière récitation.`;
}

/** Jours calendaires entre deux clés YYYY-MM-DD (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  const ta = Date.UTC(ya, ma - 1, da);
  const tb = Date.UTC(yb, mb - 1, db);
  return Math.round((tb - ta) / 86400000);
}

// ---------------------------------------------------------------------------
// Agrégats (écran « Maîtrise »)
// ---------------------------------------------------------------------------

export interface MasteryBreakdown {
  counts: Record<MasteryLevel, number>;
  neverEvaluated: number;
  evaluated: number;
  total: number;
  /** % de maîtrise sur les pages évaluées (pondéré), null si rien d'évalué. */
  percent: number | null;
}

/** Poids d'un niveau dans le % global (progressif, jamais 0 pour l'évalué). */
const LEVEL_WEIGHT: Record<MasteryLevel, number> = {
  'maitrisee': 100,
  'plutot-maitrisee': 75,
  'fragile': 40,
  'a-retravailler': 15,
};

/** Ventilation d'un groupe de pages (juz', sourate, hizb, global…). */
export function masteryBreakdown(
  pages: number[],
  evalsByPage: Map<number, PageEvaluation[]>
): MasteryBreakdown {
  const counts: Record<MasteryLevel, number> = {
    'maitrisee': 0,
    'plutot-maitrisee': 0,
    'fragile': 0,
    'a-retravailler': 0,
  };
  let evaluated = 0;
  let weight = 0;
  for (const page of pages) {
    const level = currentLevel(evalsByPage.get(page) ?? []);
    if (level == null) continue;
    counts[level]++;
    evaluated++;
    weight += LEVEL_WEIGHT[level];
  }
  return {
    counts,
    neverEvaluated: pages.length - evaluated,
    evaluated,
    total: pages.length,
    percent: evaluated ? Math.round(weight / evaluated) : null,
  };
}

/** Le niveau b est-il plus solide que a ? (null = jamais évaluée, le plus bas) */
export function isStronger(a: MasteryLevel | null, b: MasteryLevel | null): boolean {
  const ra = a == null ? -1 : LEVEL_RANK[a];
  const rb = b == null ? -1 : LEVEL_RANK[b];
  return rb > ra;
}
