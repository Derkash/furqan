'use client';

import { useEffect, useState } from 'react';

/**
 * Garde-fou paysage. L'app est conçue en paysage uniquement, mais iPadOS 26 a
 * une RÉGRESSION : quand le verrou de rotation de l'appareil est désactivé, il
 * laisse afficher le portrait malgré la déclaration « landscape only ». Ce
 * voile bloque alors l'usage et invite à tourner l'appareil — garanti quel que
 * soit le comportement d'iOS.
 */
export default function OrientationGate() {
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  if (!portrait) return null;

  return (
    <div
      dir="ltr"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        background: '#24493a',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        padding: 32,
        textAlign: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <span dir="rtl" style={{ fontSize: 44, color: '#c5a059' }}>
        ع
      </span>
      <svg
        width="66"
        height="66"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#c5a059"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ animation: 'ogate-rotate 2.4s ease-in-out infinite' }}
      >
        <rect x="7" y="3" width="10" height="18" rx="2" />
        <path d="M11 18h2" />
      </svg>
      <p style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>Tourne ton appareil</p>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', maxWidth: 300, margin: 0 }}>
        Al-Muraja3a s&apos;utilise en mode paysage, pour afficher le Mushaf en double page.
      </p>
      <style>{`@keyframes ogate-rotate {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(90deg); }
      }`}</style>
    </div>
  );
}
