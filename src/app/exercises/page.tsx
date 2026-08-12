'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { isNativeApp } from '@/utils/audioStore';
import { getCurrentUser } from '@/utils/exercises/userStats';
import { computeHomeStats, DAILY_GOAL_VERSES, type HomeStats } from '@/utils/homeStats';

/**
 * Accueil (design Application2) : salutation, progression du jour, reprise de
 * la dernière session, accès rapides et sessions récentes. Les exercices
 * eux-mêmes (setup + practice) sont inchangés.
 */

function ProgressRing({ percent }: { percent: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * c;
  return (
    <svg width="116" height="116" viewBox="0 0 116 116" aria-hidden>
      <circle cx="58" cy="58" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="11" />
      <circle
        cx="58"
        cy="58"
        r={r}
        fill="none"
        stroke="var(--ds-gold)"
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${c - filled}`}
        transform="rotate(-90 58 58)"
      />
      <text
        x="58"
        y="58"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize="26"
        fontWeight="800"
        fontFamily="var(--ds-font)"
      >
        {Math.round(percent)}%
      </text>
    </svg>
  );
}

const QUICK_ACCESS: { href: string; label: string; emojiFallback?: string; icon: React.ReactNode }[] = [
  {
    href: '/exercises/lecture/setup',
    label: 'Lecture',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 7v14" />
        <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
      </svg>
    ),
  },
  {
    href: '/revision',
    label: 'Révision',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
      </svg>
    ),
  },
  {
    href: '/vocab',
    label: 'Vocabulaire',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="8" height="8" rx="2" />
        <rect x="13" y="13" width="8" height="8" rx="2" />
        <path d="M13 7h4M7 13v4" />
      </svg>
    ),
  },
  {
    href: '/reperes',
    label: 'Repères',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    href: '/adhkar',
    label: 'Adhkâr',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
      </svg>
    ),
  },
  {
    href: '/dashboard',
    label: 'Progression',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <rect x="7" y="10" width="3" height="7" rx="1" />
        <rect x="12" y="6" width="3" height="11" rx="1" />
        <rect x="17" y="13" width="3" height="4" rx="1" />
      </svg>
    ),
  },
];

export default function AccueilPage() {
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [showDownloads, setShowDownloads] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setStats(computeHomeStats());
    setUser(getCurrentUser());
    setShowDownloads(isNativeApp());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const percent = stats ? Math.min(100, (stats.todayCount / DAILY_GOAL_VERSES) * 100) : 0;

  return (
    <AppShell>
      {/* En-tête */}
      <header className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="ds-title text-3xl md:text-4xl">
            Assalâmu ’alaykum{user ? ` ${user}` : ''}
          </h1>
          <p className="text-[var(--ds-n600)] mt-1">
            Qu’Allah facilite votre révision aujourd’hui.
          </p>
        </div>
        {stats && stats.streakDays > 0 && (
          <span className="flex-none ds-card px-3.5 py-1.5 text-sm font-bold text-[var(--ds-n700)]">
            🔥 {stats.streakDays} jour{stats.streakDays > 1 ? 's' : ''} de série
          </span>
        )}
      </header>

      {/* Progression du jour + Reprendre */}
      <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4 mb-8">
        <div
          className="rounded-[24px] p-6 flex items-center gap-5 text-white"
          style={{ background: 'var(--ds-green)', boxShadow: 'var(--ds-shadow-md)' }}
        >
          <ProgressRing percent={percent} />
          <div className="min-w-0">
            <p className="ds-kicker" style={{ color: 'var(--ds-gold-100)' }}>
              Aujourd’hui
            </p>
            <p className="text-xl md:text-2xl font-extrabold mt-0.5">Votre révision</p>
            <p className="text-sm text-white/80 mt-1">
              {stats
                ? `${stats.todayCount} / ${DAILY_GOAL_VERSES} versets travaillés`
                : '— / ' + DAILY_GOAL_VERSES + ' versets'}
              {stats?.todayAccuracy != null && ` · ${stats.todayAccuracy} % de réussite`}
            </p>
          </div>
        </div>

        <div className="ds-card p-6 flex flex-col justify-center">
          <p className="ds-kicker">Reprendre</p>
          <p className="text-xl md:text-2xl font-extrabold text-[var(--ds-text)] mt-1">
            {stats?.lastExerciseLabel ? `${stats.lastExerciseLabel}` : 'Commencer une révision'}
          </p>
          <p className="text-sm text-[var(--ds-n600)] mt-1">
            {stats?.lastExerciseLabel
              ? 'Votre dernière session — la plage et les réglages sont mémorisés.'
              : 'Choisissez un mode de révision adapté à votre mémorisation.'}
          </p>
          <div className="flex items-center gap-2.5 mt-4">
            <Link
              href={stats?.lastExerciseId ? `/exercises/${stats.lastExerciseId}/setup` : '/revision'}
              className="ds-btn-gold px-5 py-2.5 text-sm"
            >
              {stats?.lastExerciseId ? 'Reprendre la session' : 'Commencer'}
            </Link>
            <Link href="/revision" className="ds-btn-ghost px-5 py-2.5 text-sm">
              Autres modes
            </Link>
          </div>
        </div>
      </div>

      {/* Accès rapide + Sessions récentes */}
      <div className="grid md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-8">
        <section>
          <p className="ds-kicker mb-3">Accès rapide</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {QUICK_ACCESS.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="ds-card p-4 hover:shadow-[var(--ds-shadow-md)] transition-shadow"
              >
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[var(--ds-sage-100)] text-[var(--ds-green)]">
                  {q.icon}
                </span>
                <p className="font-bold text-[15px] mt-2.5">{q.label}</p>
              </Link>
            ))}
            {showDownloads && (
              <Link
                href="/telechargements"
                className="ds-card p-4 hover:shadow-[var(--ds-shadow-md)] transition-shadow"
              >
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[var(--ds-gold-100)] text-[var(--ds-gold-700)]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12" />
                    <path d="m7 10 5 5 5-5" />
                    <path d="M5 21h14" />
                  </svg>
                </span>
                <p className="font-bold text-[15px] mt-2.5">Audio hors ligne</p>
              </Link>
            )}
          </div>
        </section>

        <section>
          <p className="ds-kicker mb-3">Sessions récentes</p>
          {stats && stats.recent.length > 0 ? (
            <div className="space-y-2.5">
              {stats.recent.map((s) => (
                <Link
                  key={`${s.exerciseId}-${s.at}`}
                  href={`/exercises/${s.exerciseId}/setup`}
                  className="ds-card flex items-center gap-3 px-4 py-3 hover:shadow-[var(--ds-shadow-md)] transition-shadow"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[15px] truncate">
                      {s.label} — {s.count} verset{s.count > 1 ? 's' : ''}
                    </p>
                    <p className="text-sm text-[var(--ds-n600)]">{s.dayLabel}</p>
                  </div>
                  <span className="flex-none text-xs font-extrabold bg-[var(--ds-sage-100)] text-[var(--ds-green)] rounded-full px-2.5 py-1">
                    {s.accuracy}%
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="ds-card px-4 py-5 text-sm text-[var(--ds-n600)]">
              Vos sessions apparaîtront ici.
              {!user && (
                <>
                  {' '}
                  <Link href="/dashboard" className="font-bold text-[var(--ds-gold-700)] underline">
                    Connectez-vous
                  </Link>{' '}
                  pour mémoriser votre progression.
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Pied */}
      <footer className="mt-12 text-center text-[var(--ds-n500)] text-xs">
        <p dir="rtl" style={{ fontFamily: "'Amiri','Scheherazade New',serif" }} className="text-base">
          بارك الله فيك
        </p>
      </footer>
    </AppShell>
  );
}
