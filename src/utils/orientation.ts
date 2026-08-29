// Orientation de l'écran — PRÉFÉRENCE UTILISATEUR.
//
// Plus aucune orientation n'est imposée : ni paysage, ni portrait, nulle part.
// - WEB : rien n'est verrouillé, l'affichage suit la rotation de l'appareil
//   (l'interface est responsive, portrait comme paysage).
// - APP NATIVE (Capacitor) : l'utilisateur choisit dans le menu Réglages
//   « Orientation » → Auto (suit l'appareil) / Portrait / Paysage. Le choix est
//   mémorisé et réappliqué au démarrage.

import { Capacitor } from '@capacitor/core';

export type OrientationPref = 'auto' | 'portrait' | 'landscape';

const KEY = 'almuraja3a:orientation';

export const ORIENTATION_LABELS: Record<OrientationPref, string> = {
  auto: 'Auto',
  portrait: 'Portrait',
  landscape: 'Paysage',
};

/** Préférence enregistrée (par défaut : Auto — l'appareil décide). */
export function loadOrientationPref(): OrientationPref {
  if (typeof window === 'undefined') return 'auto';
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === 'portrait' || v === 'landscape' || v === 'auto') return v;
  } catch {
    // stockage indisponible
  }
  return 'auto';
}

/** Applique la préférence (no-op sur le web : rien n'y est verrouillé). */
export async function applyOrientationPref(
  pref: OrientationPref = loadOrientationPref()
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');
    if (pref === 'auto') await ScreenOrientation.unlock();
    else await ScreenOrientation.lock({ orientation: pref });
  } catch {
    // Plugin absent ou verrou refusé (iPad multitâche) : sans conséquence,
    // l'app reste utilisable dans les deux sens.
  }
}

/** Enregistre ET applique le choix de l'utilisateur. */
export async function setOrientationPref(pref: OrientationPref): Promise<void> {
  try {
    window.localStorage.setItem(KEY, pref);
  } catch {
    // stockage indisponible : le choix ne sera pas mémorisé
  }
  await applyOrientationPref(pref);
}
