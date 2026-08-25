// Verrouillage d'orientation — APP NATIVE (Capacitor) UNIQUEMENT.
//
// L'app native vit en PAYSAGE (imposé par l'AppDelegate, les deux directions).
// Le module Adkar est l'exception : il pose un verrou PORTRAIT à l'entrée
// (le seul cas où l'AppDelegate laisse passer le portrait) et le retire en
// sortant — le paysage standard se rétablit alors de lui-même.
// Sur le web ces fonctions sont des no-op : aucune orientation n'y est imposée
// (l'interface s'adapte à l'espace disponible).

import { Capacitor } from '@capacitor/core';

/** Verrouille le portrait (module Adkar). */
export async function lockPortrait(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');
    await ScreenOrientation.lock({ orientation: 'portrait' });
  } catch {
    // Plugin absent ou verrou refusé (ex. iPad multitâche) : sans conséquence,
    // l'OrientationGate reste le filet de sécurité côté UI.
  }
}

/** Retire le verrou portrait : l'AppDelegate ré-impose le paysage standard. */
export async function restoreLandscape(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');
    await ScreenOrientation.unlock();
  } catch {
    // idem : sans conséquence
  }
}
