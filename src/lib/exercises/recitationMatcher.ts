// Analyse globale d'une récitation : alignement semi-global (programmation
// dynamique) entre les mots reconnus par le micro et la séquence de mots
// attendue. L'analyse se fait UNE FOIS la récitation terminée — beaucoup plus
// fiable qu'un suivi mot à mot en direct, car l'alignement optimal considère
// l'ensemble de la récitation (mots sautés, fusions/coupures de l'ASR,
// répétitions, hésitations).

import { wordsSimilar } from '@/utils/exercises/arabicNormalization';

export type RecitationWordStatus =
  | 'pending' // pas atteint par la récitation
  | 'correct' // récité juste
  | 'error' // mot faux à cette position
  | 'missed' // sauté
  | 'skipped'; // mot optionnel (basmala) non récité — pas une faute

export interface RecitationWord {
  /** Mot tel qu'affiché (avec harakat). */
  display: string;
  /** Forme normalisée pour la comparaison. */
  norm: string;
  /** Clé du verset ("2:255"). */
  verseKey: string;
  /** Mot optionnel (basmala en tête de sourate) : non compté comme faute si sauté. */
  optional?: boolean;
}

export interface RecitationScore {
  correct: number;
  faults: number; // error + missed
  attempted: number; // correct + faults (mots optionnels sautés exclus)
  accuracy: number; // 0..100
}

export interface RecitationAnalysis {
  /** Statut de chaque mot attendu (même longueur que `expected`). */
  statuses: RecitationWordStatus[];
  /** Nombre de mots attendus couverts par la récitation (préfixe). */
  attemptedWordCount: number;
  score: RecitationScore;
}

// Coûts de l'alignement : une faute (substitution ou omission) coûte 1 ;
// un mot en trop (répétition, hésitation, ta'awwudh) coûte moins qu'une faute
// pour ne jamais être compté comme telle ; fusion/coupure ASR quasi gratuites.
const FAULT_COST = 1;
const INSERT_COST = 0.75;
const MERGE_COST = 0.25;

// Opérations de la remontée.
const OP_DIAG = 1; // spoken[i-1] aligné sur expected[j-1]
const OP_INSERT = 2; // mot récité en trop
const OP_DELETE = 3; // mot attendu manquant
const OP_MERGE = 4; // 1 mot reconnu = 2 mots attendus collés
const OP_SPLIT = 5; // 2 mots reconnus = 1 mot attendu coupé

/**
 * Aligne la récitation complète sur les mots attendus.
 * La fin est libre côté attendu : les mots après l'arrêt de la récitation
 * restent 'pending' (non tentés), sans pénalité.
 */
export function analyzeRecitation(
  expected: RecitationWord[],
  spoken: string[]
): RecitationAnalysis {
  const m = spoken.length;
  const n = expected.length;
  const statuses = new Array<RecitationWordStatus>(n).fill('pending');
  if (m === 0 || n === 0) {
    return {
      statuses,
      attemptedWordCount: 0,
      score: { correct: 0, faults: 0, attempted: 0, accuracy: 0 },
    };
  }

  const W = n + 1;
  const cost = new Float64Array((m + 1) * W);
  const op = new Uint8Array((m + 1) * W);
  for (let j = 1; j <= n; j++) {
    cost[j] = cost[j - 1] + (expected[j - 1].optional ? 0 : FAULT_COST);
    op[j] = OP_DELETE;
  }
  for (let i = 1; i <= m; i++) {
    cost[i * W] = i * INSERT_COST;
    op[i * W] = OP_INSERT;
  }

  for (let i = 1; i <= m; i++) {
    const s = spoken[i - 1];
    for (let j = 1; j <= n; j++) {
      const e = expected[j - 1];
      let best = cost[(i - 1) * W + (j - 1)] + (wordsSimilar(s, e.norm) ? 0 : FAULT_COST);
      let bestOp = OP_DIAG;
      const insert = cost[(i - 1) * W + j] + INSERT_COST;
      if (insert < best) {
        best = insert;
        bestOp = OP_INSERT;
      }
      const del = cost[i * W + (j - 1)] + (e.optional ? 0 : FAULT_COST);
      if (del < best) {
        best = del;
        bestOp = OP_DELETE;
      }
      if (j >= 2 && s === expected[j - 2].norm + e.norm) {
        const merge = cost[(i - 1) * W + (j - 2)] + MERGE_COST;
        if (merge < best) {
          best = merge;
          bestOp = OP_MERGE;
        }
      }
      if (i >= 2 && spoken[i - 2] + s === e.norm) {
        const split = cost[(i - 2) * W + (j - 1)] + MERGE_COST;
        if (split < best) {
          best = split;
          bestOp = OP_SPLIT;
        }
      }
      cost[i * W + j] = best;
      op[i * W + j] = bestOp;
    }
  }

  // Fin libre : la récitation peut s'arrêter avant la fin des mots attendus.
  let jBest = 0;
  let bestCost = cost[m * W];
  for (let j = 1; j <= n; j++) {
    if (cost[m * W + j] <= bestCost) {
      bestCost = cost[m * W + j];
      jBest = j;
    }
  }

  // Remontée → statut de chaque mot attendu couvert.
  let i = m;
  let j = jBest;
  while (i > 0 || j > 0) {
    const o = op[i * W + j];
    if (o === OP_DIAG) {
      statuses[j - 1] = wordsSimilar(spoken[i - 1], expected[j - 1].norm) ? 'correct' : 'error';
      i--;
      j--;
    } else if (o === OP_INSERT) {
      i--;
    } else if (o === OP_DELETE) {
      statuses[j - 1] = expected[j - 1].optional ? 'skipped' : 'missed';
      j--;
    } else if (o === OP_MERGE) {
      statuses[j - 2] = 'correct';
      statuses[j - 1] = 'correct';
      i--;
      j -= 2;
    } else if (o === OP_SPLIT) {
      statuses[j - 1] = 'correct';
      i -= 2;
      j--;
    } else {
      break;
    }
  }

  let correct = 0;
  let faults = 0;
  for (let k = 0; k < jBest; k++) {
    if (statuses[k] === 'correct') correct++;
    else if (statuses[k] === 'error' || statuses[k] === 'missed') faults++;
  }
  const attempted = correct + faults;
  const accuracy = attempted === 0 ? 0 : Math.round((correct / attempted) * 100);

  return { statuses, attemptedWordCount: jBest, score: { correct, faults, attempted, accuracy } };
}
