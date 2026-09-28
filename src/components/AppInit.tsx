'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { App as CapApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { initAudioStore, isNativeApp } from '@/utils/audioStore';
import { refreshRecitationNative } from '@/lib/recitation/appSync';
import { hydrateRecitationFromRemote, loadProgram } from '@/lib/recitation/store';
import { getCurrentUser } from '@/utils/exercises/userStats';
import { hydrateVocab } from '@/utils/vocab/vocabSync';
import { applyOrientationPref } from '@/utils/orientation';
import { flushStateBackup, restoreStateFromDisk } from '@/utils/nativeStateBackup';

/**
 * Recharge la page UNE SEULE FOIS par lancement et par motif : les écrans déjà
 * montés ont lu un stockage vide, il faut les refaire lire. La garde (par
 * motif) rend toute boucle impossible.
 */
function reloadOnce(reason: string): void {
  const key = `almuraja3a:reloaded:${reason}`;
  try {
    if (window.sessionStorage.getItem(key) === '1') return;
    window.sessionStorage.setItem(key, '1');
  } catch {
    return; // sessionStorage indisponible : on s'abstient plutôt que boucler
  }
  window.location.reload();
}

/**
 * Initialisations côté client au démarrage. Dans l'app iPad (Capacitor) :
 * classe CSS `capacitor` sur <html> (ajustements safe-area) + reconstruction
 * de l'index des audios téléchargés. No-op sur le web.
 */
export default function AppInit() {
  const router = useRouter();

  useEffect(() => {
    const cleanups: (() => void)[] = [];
    if (isNativeApp()) {
      document.documentElement.classList.add('capacitor');
      // Orientation choisie par l'utilisateur (Auto par défaut) : rien n'est
      // imposé, on se contente de rétablir son réglage.
      applyOrientationPref();

      // Filet contre les purges du WKWebView (iOS peut vider localStorage au
      // redémarrage de l'appareil) : on rétablit ce qui manque depuis le
      // miroir du conteneur. Si quelque chose a été rétabli, on recharge une
      // fois — les écrans déjà montés ont lu un stockage vide.
      restoreStateFromDisk()
        .then((restored) => {
          if (restored > 0) {
            reloadOnce('disk');
            return;
          }
          // Rien à rétablir : on (re)pose le miroir pour la prochaine fois.
          void flushStateBackup();
        })
        .catch(() => {});

      // Sauvegarde du miroir quand l'app quitte le premier plan (dernier
      // moment sûr avant une mise en veille ou un redémarrage).
      const backupNow = () => {
        if (document.visibilityState === 'hidden') void flushStateBackup();
      };
      document.addEventListener('visibilitychange', backupNow);
      window.addEventListener('pagehide', () => void flushStateBackup());
      cleanups.push(() => document.removeEventListener('visibilitychange', backupNow));

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

      // Récitation : alimenter le widget, l'activité en direct et les
      // notifications DÈS le lancement — quel que soit l'écran affiché — puis
      // à chaque retour au premier plan et toutes les 5 minutes.
      refreshRecitationNative();
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) refreshRecitationNative();
        else void flushStateBackup(); // passage en arrière-plan : on fige le miroir
      });
      const recitationTimer = window.setInterval(() => refreshRecitationNative(), 5 * 60 * 1000);
      cleanups.push(() => window.clearInterval(recitationTimer));
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
    if (user) {
      hydrateVocab(user).catch(() => {});
      // Second filet pour le programme de récitation : s'il manque ALORS QU'UN
      // COMPTE est connecté (purge sans miroir exploitable, nouvel appareil),
      // on le récupère depuis Supabase. Jamais d'écrasement : on n'y touche que
      // si le local est vide.
      if (!loadProgram()) {
        hydrateRecitationFromRemote(user)
          .then(() => {
            if (loadProgram()) reloadOnce('remote-program');
          })
          .catch(() => {});
      }
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [router]);

  return null;
}
