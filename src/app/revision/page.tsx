'use client';

import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { getAllExercises } from '@/utils/exercises/exerciseRegistry';

/**
 * Révision (design Application2) : tous les modes d'exercice. Les cartes ne
 * font que NAVIGUER vers les setups existants — les exercices sont inchangés.
 */

const ICON: Record<string, string> = {
  lecture: '📖',
  'audio-quiz': '🎧',
  sequential: '↔️',
  recitation: '🎙️',
  'page-number': '🔢',
  'verse-start': '✳️',
  hifz: '🧠',
};

const EXTRA_MODES: { href: string; icon: string; name: string; nameArabic?: string; description: string }[] = [
  {
    href: '/lecture-sequencee',
    icon: '⏱️',
    name: 'Lecture séquencée',
    nameArabic: 'تلاوة متدرجة',
    description: 'Le récitateur lit, un intervalle pour réciter, puis on continue.',
  },
  {
    href: '/reperes',
    icon: '📑',
    name: 'Repères — Début · Milieu · Fin',
    description: 'Retrouve les repères de chaque page par sourate, difficulté 0→8.',
  },
  {
    href: '/adhkar',
    icon: '🌅',
    name: 'Invocations matin & soir',
    nameArabic: 'أذكار',
    description: 'Lecture & révision des adhkâr, avec compteur et traduction.',
  },
];

export default function RevisionPage() {
  const exercises = getAllExercises();

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="ds-title text-3xl md:text-4xl">Révision</h1>
        <p className="text-[var(--ds-n600)] mt-1">
          Choisissez votre mode — la plage et les réglages de chaque exercice sont mémorisés.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {exercises.map((exercise) => (
          <Link
            key={exercise.id}
            href={`/exercises/${exercise.id}/setup`}
            className="ds-card p-5 flex flex-col hover:shadow-[var(--ds-shadow-md)] transition-shadow"
          >
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-[var(--ds-sage-100)] text-xl">
              {ICON[exercise.id] ?? '📗'}
            </span>
            <div className="flex items-baseline gap-2 mt-3">
              <h3 className="font-extrabold text-lg text-[var(--ds-text)]">{exercise.name}</h3>
              <span
                className="text-[var(--ds-n600)] text-base"
                dir="rtl"
                style={{ fontFamily: "'Amiri','Scheherazade New',serif" }}
              >
                {exercise.nameArabic}
              </span>
            </div>
            <p className="text-sm text-[var(--ds-n600)] mt-1.5 flex-1">{exercise.description}</p>
            <div className="mt-4">
              <span className="ds-btn-ghost inline-block px-5 py-2 text-sm">Commencer</span>
            </div>
          </Link>
        ))}

        {EXTRA_MODES.map((mode) => (
          <Link
            key={mode.href}
            href={mode.href}
            className="ds-card p-5 flex flex-col hover:shadow-[var(--ds-shadow-md)] transition-shadow"
          >
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-[var(--ds-gold-100)] text-xl">
              {mode.icon}
            </span>
            <div className="flex items-baseline gap-2 mt-3">
              <h3 className="font-extrabold text-lg text-[var(--ds-text)]">{mode.name}</h3>
              {mode.nameArabic && (
                <span
                  className="text-[var(--ds-n600)] text-base"
                  dir="rtl"
                  style={{ fontFamily: "'Amiri','Scheherazade New',serif" }}
                >
                  {mode.nameArabic}
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--ds-n600)] mt-1.5 flex-1">{mode.description}</p>
            <div className="mt-4">
              <span className="ds-btn-ghost inline-block px-5 py-2 text-sm">Commencer</span>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
