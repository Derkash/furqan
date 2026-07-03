// Moteur de suivi de récitation (type Tarteel) : aligne en direct les mots
// reconnus par le micro sur la séquence de mots attendue, avec tolérance
// (mots sautés, mots fusionnés par la reconnaissance, répétitions, reprises).

import { wordsSimilar } from '@/utils/exercises/arabicNormalization';

export type RecitationWordStatus =
  | 'pending' // pas encore récité
  | 'correct' // récité juste du premier coup
  | 'corrected' // faute puis repris correctement
  | 'missed' // sauté (détecté quand la suite a été récitée)
  | 'error' // mot faux à la position courante
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

export interface MatcherState {
  statuses: RecitationWordStatus[];
  /** Index du prochain mot attendu. */
  pointer: number;
}

/** Fenêtre de recherche en avant : permet de détecter les mots sautés
 *  (5 couvre une basmala entière non récitée + le mot suivant). */
const LOOKAHEAD = 5;

/** Fenêtre en arrière : un mot déjà validé répété (reprise de souffle,
 *  répétition du récitant) est ignoré au lieu d'être compté faux. */
const LOOKBEHIND = 3;

export function createMatcherState(wordCount: number): MatcherState {
  return { statuses: new Array<RecitationWordStatus>(wordCount).fill('pending'), pointer: 0 };
}

export function cloneMatcherState(state: MatcherState): MatcherState {
  return { statuses: [...state.statuses], pointer: state.pointer };
}

function markAdvance(state: MatcherState, index: number) {
  state.statuses[index] = state.statuses[index] === 'error' ? 'corrected' : 'correct';
  state.pointer = index + 1;
}

/** Applique une liste de mots récités (normalisés) à l'état. Mutation en place. */
export function applySpokenWords(
  state: MatcherState,
  words: RecitationWord[],
  spoken: string[]
): void {
  for (const heard of spoken) {
    const p = state.pointer;
    if (p >= words.length) return;

    // Mot reconnu = fusion de deux mots attendus consécutifs (fréquent avec l'ASR).
    if (p + 1 < words.length && heard === words[p].norm + words[p + 1].norm) {
      markAdvance(state, p);
      markAdvance(state, p + 1);
      continue;
    }

    // Cas nominal : le mot attendu.
    if (wordsSimilar(heard, words[p].norm)) {
      markAdvance(state, p);
      continue;
    }

    // Mot(s) sauté(s) : le mot entendu correspond à un mot un peu plus loin.
    let jumped = false;
    for (let j = 1; j <= LOOKAHEAD && p + j < words.length; j++) {
      if (wordsSimilar(heard, words[p + j].norm)) {
        for (let k = p; k < p + j; k++) {
          if (state.statuses[k] === 'pending' || state.statuses[k] === 'error') {
            state.statuses[k] = words[k].optional ? 'skipped' : 'missed';
          }
        }
        markAdvance(state, p + j);
        jumped = true;
        break;
      }
    }
    if (jumped) continue;

    // Répétition d'un mot déjà validé (reprise) : on ignore.
    let isRepetition = false;
    for (let j = 1; j <= LOOKBEHIND && p - j >= 0; j++) {
      if (wordsSimilar(heard, words[p - j].norm)) {
        isRepetition = true;
        break;
      }
    }
    if (isRepetition) continue;

    // Mot faux à la position courante : on signale mais on n'avance pas,
    // pour laisser la possibilité de se corriger (→ 'corrected').
    state.statuses[p] = 'error';
  }
}

/** Saute manuellement le mot courant (bouton « Passer »). */
export function skipCurrentWord(state: MatcherState, words: RecitationWord[]): void {
  const p = state.pointer;
  if (p >= words.length) return;
  state.statuses[p] = words[p].optional ? 'skipped' : 'missed';
  state.pointer = p + 1;
}

export interface RecitationScore {
  correct: number;
  corrected: number;
  faults: number; // missed + error
  total: number; // mots non optionnels
  accuracy: number; // 0..100
}

export function computeScore(state: MatcherState, words: RecitationWord[]): RecitationScore {
  let correct = 0;
  let corrected = 0;
  let faults = 0;
  let total = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i].optional) continue;
    total++;
    const s = state.statuses[i];
    if (s === 'correct') correct++;
    else if (s === 'corrected') corrected++;
    else if (s === 'missed' || s === 'error') faults++;
  }
  const done = correct + corrected + faults;
  const accuracy = done === 0 ? 100 : Math.round(((correct + corrected) / done) * 100);
  return { correct, corrected, faults, total, accuracy };
}
