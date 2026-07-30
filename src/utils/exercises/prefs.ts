// Préférences globales des exercices (localStorage).

const SELF_ASSESS_KEY = 'almuraja3a:selfAssess';

/**
 * Auto-évaluation « ai-je bien répondu ? » (Trouvé/Raté) après chaque question.
 * DÉSACTIVÉE par défaut — réactivable dans la configuration des exercices.
 */
export function getSelfAssess(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SELF_ASSESS_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSelfAssess(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SELF_ASSESS_KEY, value ? '1' : '0');
  } catch {
    /* quota — silencieux */
  }
}
