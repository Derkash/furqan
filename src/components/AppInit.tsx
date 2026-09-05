'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { App as CapApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { initAudioStore, isNativeApp } from '@/utils/audioStore';
import { getCurrentUser } from '@/utils/exercises/userStats';
import { hydrateVocab } from '@/utils/vocab/vocabSync';
import { applyOrientationPref } from '@/utils/orientation';

/**
 * Initialisations côté client au démarrage. Dans l'app iPad (Capacitor) :
 * classe CSS `capacitor` sur <html> (ajustements safe-area) + reconstruction
 * de l'index des audios téléchargés. No-op sur le web.
 */
export default function AppInit() {
  const router = useRouter();

  useEffect(() => {
    if (isNativeApp()) {
      document.documentElement.classList.add('capacitor');
      // Orientation choisie par l'utilisateur (Auto par défaut) : rien n'est
      // imposé, on se contente de rétablir son réglage.
      applyOrientationPref();

      // Deep link du widget / de l'activité en direct :
      // almuraja3a://recitation/en-cours → page « Récitation en cours ».
      CapApp.addListener('appUrlOpen', ({ url }) => {
        try {
          const path = new URL(url).pathname || url.replace(/^[a-z0-9.]+:\/\//, '/');
          const host = new URL(url).host;
          const route = `/${host}${path}`.replace(/\/+$/, '');
          if (route.startsWith('/recitation')) router.push(route);
        } catch {
          /* URL inattendue : ignorée */
        }
      });

      // Appui sur une notification de récitation → session concernée.
      LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
        const route = (event.notification.extra as { route?: string } | undefined)?.route;
        if (route) router.push(route);
      });
    }
    // Nettoyage : le lexique s'était importé sans compte (« guest ») avant que
    // le vocabulaire ne soit réservé aux comptes connectés. On purge cette
    // copie orpheline — le vrai lexique vit sous le compte (+ sync Supabase).
    try {
      window.localStorage.removeItem('almuraja3a:vocab:guest');
      window.localStorage.removeItem('almuraja3a:vocab-seeded:guest');
    } catch {
      // stockage indisponible : sans conséquence
    }
    initAudioStore();

    // Resync du vocabulaire au démarrage pour l'utilisateur déjà connecté :
    // applique le nettoyage distant (dédup + forme coranique exacte) sans
    // devoir se reconnecter. No-op si Supabase absent.
    const user = getCurrentUser();
    if (user) hydrateVocab(user).catch(() => {});
  }, [router]);

  return null;
}
