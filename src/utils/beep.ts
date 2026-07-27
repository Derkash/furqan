// Petit bip (Web Audio) joué à chaque transition d'un verset à l'autre pendant
// la lecture (Lecture + Hifz). Aucun fichier son : oscillateur synthétisé.
// L'AudioContext est créé paresseusement et repris (les lectures démarrent
// toujours après un geste utilisateur, donc autorisées).

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Joue un court bip discret (~120 ms). Sans effet si l'audio est indisponible. */
export function playBeep(): void {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') void c.resume();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    o.connect(g);
    g.connect(c.destination);
    const t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.start(t);
    o.stop(t + 0.14);
  } catch {
    /* audio indisponible — on ignore */
  }
}
