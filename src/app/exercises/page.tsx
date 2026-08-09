'use client';

import Link from 'next/link';
import { getAllExercises } from '@/utils/exercises/exerciseRegistry';
import ExerciseCard from '@/components/exercises/ExerciseCard';

export default function ExercisesPage() {
  const exercises = getAllExercises();

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-[#fdfaf3] via-[#fdfaf3] to-[#f4e9d0] pb-12"
      style={{
        minHeight: '100dvh',
        WebkitOverflowScrolling: 'touch',
      }}
      dir="ltr"
    >
      {/* Header décoratif type Mushaf */}
      <header className="relative pt-10 pb-8 px-5">
        {/* Ornement décoratif en haut */}
        <div className="flex justify-center mb-4">
          <svg width="120" height="22" viewBox="0 0 120 22" aria-hidden>
            <defs>
              <pattern id="hpattern" patternUnits="userSpaceOnUse" width="14" height="22">
                <path d="M7 3 L13 11 L7 19 L1 11 Z" fill="none" stroke="#c9a959" strokeWidth="0.8" />
                <circle cx="7" cy="11" r="1.5" fill="#c9a959" />
              </pattern>
            </defs>
            <rect x="10" y="0" width="100" height="22" fill="url(#hpattern)" />
            <line x1="0" y1="11" x2="10" y2="11" stroke="#c9a959" strokeWidth="1" />
            <line x1="110" y1="11" x2="120" y2="11" stroke="#c9a959" strokeWidth="1" />
          </svg>
        </div>

        {/* Titre arabe principal */}
        <h1 className="text-center text-[#2d5016] font-bold text-5xl tracking-tight" dir="rtl" style={{ fontFamily: "'Amiri', 'Scheherazade New', serif" }}>
          المراجعة
        </h1>

        {/* Sous-titre latin */}
        <p className="text-center text-[#7a8b3e] font-semibold text-lg mt-1 tracking-widest uppercase">
          Al-Muraja3a
        </p>

        {/* Tagline */}
        <p className="text-center text-[#4a7c23]/80 text-sm mt-3 max-w-xs mx-auto">
          Révision et mémorisation du Saint Coran
        </p>

        {/* Petit séparateur en bas */}
        <div className="flex items-center justify-center gap-3 mt-6">
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-[#c9a959]" />
          <span className="text-[#c9a959] text-xs uppercase tracking-[0.3em] font-semibold">Exercices</span>
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-[#c9a959]" />
        </div>
      </header>

      {/* Liste des exercices */}
      <main className="px-4">
        <div className="max-w-2xl mx-auto space-y-3">
          {/* Invocations du matin et du soir */}
          <Link
            href="/adhkar"
            className="group flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-[#2d5016] to-[#4a7c23] text-white shadow-lg active:scale-[0.99] transition-all"
          >
            <span className="text-4xl flex-none">🌅</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg">Invocations matin &amp; soir</h3>
                <span className="text-lg" dir="rtl" style={{ fontFamily: "'Amiri','Scheherazade New',serif" }}>
                  أذكار
                </span>
              </div>
              <p className="text-sm text-white/80 mt-0.5">Lecture &amp; révision des adhkâr, avec compteur et traduction</p>
            </div>
            <span className="text-2xl flex-none">🌙</span>
          </Link>

          {/* Lecture séquencée */}
          <Link
            href="/lecture-sequencee"
            className="group flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-[#4a7c23] to-[#2d5016] text-white shadow-lg active:scale-[0.99] transition-all"
          >
            <span className="text-4xl flex-none">⏱️</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg">Lecture séquencée</h3>
                <span className="text-lg" dir="rtl" style={{ fontFamily: "'Amiri','Scheherazade New',serif" }}>
                  تلاوة متدرجة
                </span>
              </div>
              <p className="text-sm text-white/80 mt-0.5">Le récitateur lit, un intervalle pour réciter, puis on continue</p>
            </div>
          </Link>

          {/* Repères Début / Milieu / Fin (niveaux 0→8) */}
          <Link
            href="/reperes"
            className="group flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-[#2f5496] to-[#1f3a63] text-white shadow-lg active:scale-[0.99] transition-all"
          >
            <span className="text-4xl flex-none">📑</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg">Repères — Début · Milieu · Fin</h3>
              <p className="text-sm text-white/80 mt-0.5">Retrouve les repères de chaque page par sourate, difficulté 0→8</p>
            </div>
          </Link>

          {exercises.map((exercise, idx) => (
            <ExerciseCard key={exercise.id} exercise={exercise} index={idx} />
          ))}

          {/* Vocabulaire */}
          <Link
            href="/vocab"
            className="group flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-[#c9a959]/40 text-[#4a7c23] font-semibold text-sm hover:border-[#c9a959] hover:bg-white/60 transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 7v14" />
              <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
            </svg>
            Vocabulaire — capture &amp; racines
          </Link>

          {/* Tableau de bord de maîtrise */}
          <Link
            href="/dashboard"
            className="group flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-[#c9a959]/40 text-[#4a7c23] font-semibold text-sm hover:border-[#c9a959] hover:bg-white/60 transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v16a2 2 0 0 0 2 2h16" />
              <rect x="7" y="10" width="3" height="7" rx="1" />
              <rect x="12" y="6" width="3" height="11" rx="1" />
              <rect x="17" y="13" width="3" height="4" rx="1" />
            </svg>
            Tableau de bord — maîtrise &amp; fautes
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-10 text-center text-[#4a7c23]/60 text-xs">
        <p dir="rtl" className="font-arabic">بارك الله فيك</p>
      </footer>
    </div>
  );
}
