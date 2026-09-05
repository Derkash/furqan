'use client';

// Cadre commun des quatre écrans de mise en place du programme :
// fil d'étapes (1 périmètre → 2 objectif → 3 horaires → 4 répartition),
// en-tête et barre d'actions Continuer / Retour.

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export const SETUP_STEPS = [
  { href: '/recitation/perimetre', label: 'Ce que je connais' },
  { href: '/recitation/objectif', label: 'Mon objectif' },
  { href: '/recitation/horaires', label: 'Jours et horaires' },
  { href: '/recitation/repartition', label: 'Répartition' },
] as const;

export function SetupFrame({
  step,
  title,
  subtitle,
  children,
  canContinue,
  continueLabel,
  onContinue,
}: {
  step: number; // 0-3
  title: string;
  subtitle: string;
  children: React.ReactNode;
  canContinue: boolean;
  continueLabel?: string;
  onContinue: () => void;
}) {
  const router = useRouter();
  return (
    <div className="max-w-[720px]">
      <header className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          {SETUP_STEPS.map((s, i) => (
            <Link
              key={s.href}
              href={i <= step ? s.href : '#'}
              aria-disabled={i > step}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < step ? 'bg-[var(--ds-sage)]' : i === step ? 'bg-[var(--ds-gold)]' : 'bg-[var(--ds-sage-200)] pointer-events-none'
              }`}
              title={s.label}
            />
          ))}
        </div>
        <p className="ds-kicker">Programme de récitation · étape {step + 1} sur 4</p>
        <h1 className="ds-title text-2xl md:text-3xl mt-1">{title}</h1>
        <p className="text-[var(--ds-n600)] mt-1">{subtitle}</p>
      </header>

      {children}

      <div className="flex items-center gap-2.5 mt-6 pb-8">
        <button
          type="button"
          disabled={!canContinue}
          onClick={onContinue}
          className="ds-btn-gold px-7 py-3 text-sm disabled:opacity-40"
        >
          {continueLabel ?? 'Continuer'}
        </button>
        {step > 0 && (
          <button type="button" onClick={() => router.back()} className="ds-btn-ghost px-5 py-3 text-sm">
            Retour
          </button>
        )}
      </div>
    </div>
  );
}
