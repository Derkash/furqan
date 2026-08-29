'use client';

import { useEffect, useState } from 'react';
import { isNativeApp } from '@/utils/audioStore';
import {
  loadOrientationPref,
  setOrientationPref,
  ORIENTATION_LABELS,
  type OrientationPref,
} from '@/utils/orientation';

const OPTIONS: OrientationPref[] = ['auto', 'portrait', 'landscape'];

function OrientationIcon({ pref, size = 18 }: { pref: OrientationPref; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (pref === 'portrait')
    return (
      <svg {...common}>
        <rect x="7" y="2.5" width="10" height="19" rx="2" />
        <path d="M11 18.5h2" />
      </svg>
    );
  if (pref === 'landscape')
    return (
      <svg {...common}>
        <rect x="2.5" y="7" width="19" height="10" rx="2" />
        <path d="M18.5 11v2" />
      </svg>
    );
  // Auto : rotation libre
  return (
    <svg {...common}>
      <rect x="8" y="4" width="8" height="16" rx="2" />
      <path d="M4.5 9a8 8 0 0 1 2-3.2" />
      <path d="M19.5 15a8 8 0 0 1-2 3.2" />
    </svg>
  );
}

/**
 * Choix de l'orientation — APP NATIVE UNIQUEMENT (sur le web, l'affichage suit
 * simplement la rotation de l'appareil, rien n'est verrouillé : le composant ne
 * s'affiche donc pas).
 *
 * - variant « menu »  : segmenté Auto / Portrait / Paysage (panneaux Réglages) ;
 * - variant « rail »  : bouton compact qui fait défiler les 3 modes (barres
 *   latérales étroites des exercices).
 */
export default function OrientationControl({
  variant = 'menu',
  className = '',
}: {
  variant?: 'menu' | 'rail';
  className?: string;
}) {
  const [native, setNative] = useState(false);
  const [pref, setPref] = useState<OrientationPref>('auto');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setNative(isNativeApp());
    setPref(loadOrientationPref());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!native) return null;

  const choose = (p: OrientationPref) => {
    setPref(p);
    setOrientationPref(p);
  };

  if (variant === 'rail') {
    const next = OPTIONS[(OPTIONS.indexOf(pref) + 1) % OPTIONS.length];
    return (
      <button
        onClick={() => choose(next)}
        title={`Orientation : ${ORIENTATION_LABELS[pref]} — toucher pour ${ORIENTATION_LABELS[next].toLowerCase()}`}
        className={`flex flex-col items-center gap-0.5 w-12 py-1.5 rounded-xl text-[var(--ds-n500)] hover:text-[var(--ds-green)] transition-colors ${className}`}
      >
        <OrientationIcon pref={pref} size={19} />
        <span className="text-[7px] font-bold uppercase tracking-wider">
          {ORIENTATION_LABELS[pref]}
        </span>
      </button>
    );
  }

  return (
    <div className={className}>
      <p className="ds-kicker mb-1.5">Orientation</p>
      <div className="flex gap-1">
        {OPTIONS.map((o) => (
          <button
            key={o}
            onClick={() => choose(o)}
            className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-[11px] font-bold transition-colors ${
              pref === o
                ? 'bg-[var(--ds-green)] text-white'
                : 'bg-[var(--ds-sage-100)] text-[var(--ds-n700)] hover:text-[var(--ds-green)]'
            }`}
          >
            <OrientationIcon pref={o} />
            {ORIENTATION_LABELS[o]}
          </button>
        ))}
      </div>
    </div>
  );
}
