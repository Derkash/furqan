/**
 * Retour haptique (HIG Apple : marquer les moments clés — tourne de page,
 * enregistrement). No-op silencieux sur le web.
 */
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export function hapticLight() {
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

export function hapticMedium() {
  Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
}
