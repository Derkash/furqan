// Pont natif « PencilBridge » (ios/App/App/MainViewController.swift) :
// double toucher et pression (squeeze, Pencil Pro) de l'Apple Pencil — gestes
// que le web ne reçoit pas — et orientation imposée par un écran.
// Sur le web : tout est inerte (aucune erreur).

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type PencilAction =
  | 'ignore'
  | 'switchEraser'
  | 'switchPrevious'
  | 'showColorPalette'
  | 'showInkAttributes'
  | 'showContextualPalette';

export interface PencilEvent {
  action: PencilAction;
  x?: number; // position de survol (px CSS), si le Pencil la fournit
  y?: number;
}

interface PencilBridgePlugin {
  enable(): Promise<{ tapAction?: PencilAction }>;
  disable(): Promise<void>;
  setOrientation(o: { mode: 'portrait' | 'default' }): Promise<void>;
  addListener(event: 'tap' | 'squeeze', cb: (e: PencilEvent) => void): Promise<PluginListenerHandle>;
}

const native = () => Capacitor.isNativePlatform();
const Bridge = registerPlugin<PencilBridgePlugin>('PencilBridge');

/** Active les gestes du Pencil ; renvoie une fonction de désinscription. */
export function listenPencil(
  onTap: (e: PencilEvent) => void,
  onSqueeze: (e: PencilEvent) => void
): () => void {
  if (!native()) return () => {};
  const handles: PluginListenerHandle[] = [];
  let off = false;
  Bridge.enable().catch(() => {});
  const keep = (h: PluginListenerHandle) => {
    if (off) void h.remove();
    else handles.push(h);
  };
  Bridge.addListener('tap', onTap).then(keep).catch(() => {});
  Bridge.addListener('squeeze', onSqueeze).then(keep).catch(() => {});
  return () => {
    off = true;
    for (const h of handles) void h.remove();
    Bridge.disable().catch(() => {});
  };
}

/** Orientation imposée par l'écran courant (natif seulement). */
export function setScreenOrientation(mode: 'portrait' | 'default'): void {
  if (!native()) return;
  Bridge.setOrientation({ mode }).catch(() => {});
}
