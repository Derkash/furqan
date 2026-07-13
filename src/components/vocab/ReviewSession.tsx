'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  dueVocab,
  getVocab,
  recordReview,
  seedVocabIfNeeded,
  importSeed,
  type VocabEntry,
} from '@/utils/vocab/vocabStore';
import { toArabicNumbers } from '@/utils/arabicNumbers';

type Dir = 'ar2fr' | 'fr2ar';

/** Révision façon flashcards (Leitner) du vocabulaire personnel. */
export default function ReviewSession({ onEmpty }: { onEmpty?: () => void }) {
  const [ready, setReady] = useState(false);
  const [total, setTotal] = useState(0);
  const [dueOnly, setDueOnly] = useState(true);
  const [dir, setDir] = useState<Dir>('ar2fr');
  const [queue, setQueue] = useState<VocabEntry[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState<{ reviewed: number; known: number } | null>(null);
  const scored = useRef({ reviewed: 0, known: 0 });

  // Au montage : importe le lexique perso si besoin, puis prépare la file.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    seedVocabIfNeeded().then(() => {
      setTotal(getVocab().length);
      setReady(true);
    });
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const buildQueue = (all: boolean) => {
    const list = all ? shuffle(getVocab()) : dueVocab();
    setQueue(list.slice(0, 30));
    setIdx(0);
    setRevealed(false);
    setDone(null);
    scored.current = { reviewed: 0, known: 0 };
  };

  const start = (all: boolean) => {
    setDueOnly(!all);
    buildQueue(all);
  };

  const grade = (known: boolean) => {
    const card = queue[idx];
    if (card) {
      recordReview(card.id, known);
      scored.current.reviewed++;
      if (known) scored.current.known++;
    }
    if (idx + 1 >= queue.length) {
      setDone({ ...scored.current });
    } else {
      setIdx(idx + 1);
      setRevealed(false);
    }
  };

  const current = queue[idx];

  if (!ready) {
    return <Centered>Chargement…</Centered>;
  }

  // Aucun mot du tout
  if (total === 0) {
    return (
      <Centered>
        <p className="text-gray-500 mb-4">Ton lexique est vide.</p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={async () => {
              const n = await importSeed();
              setTotal(getVocab().length);
              if (n === 0) onEmpty?.();
            }}
            className="px-4 py-2 bg-[#2d5016] text-white rounded-lg text-sm font-bold"
          >
            Importer mon lexique
          </button>
          <button onClick={() => onEmpty?.()} className="px-4 py-2 border-2 border-[#c9a959]/40 text-[#4a7c23] rounded-lg text-sm font-bold">
            Enregistrer des mots
          </button>
        </div>
      </Centered>
    );
  }

  // Écran d'accueil de la session
  if (queue.length === 0 && !done) {
    const dueCount = dueVocab().length;
    return (
      <Centered>
        <p className="text-[#2d5016] text-lg font-bold mb-1">Prêt à réviser ?</p>
        <p className="text-sm text-gray-500 mb-4">
          {toArabicNumbers(dueCount)} mot{dueCount > 1 ? 's' : ''} à revoir aujourd&apos;hui ·{' '}
          {toArabicNumbers(total)} au total
        </p>

        <DirToggle dir={dir} setDir={setDir} />

        <div className="flex gap-2 justify-center mt-4">
          <button
            onClick={() => start(false)}
            disabled={dueCount === 0}
            className="px-5 py-2.5 bg-gradient-to-r from-[#2d5016] to-[#4a7c23] text-white rounded-xl text-sm font-bold disabled:opacity-40"
          >
            Réviser ({toArabicNumbers(Math.min(dueCount, 30))})
          </button>
          <button
            onClick={() => start(true)}
            className="px-5 py-2.5 border-2 border-[#c9a959]/40 text-[#4a7c23] rounded-xl text-sm font-bold hover:border-[#c9a959]"
          >
            Tout mélanger
          </button>
        </div>
        {dueCount === 0 && (
          <p className="text-xs text-gray-400 mt-3">Rien d&apos;urgent — « Tout mélanger » pour réviser librement.</p>
        )}
      </Centered>
    );
  }

  // Fin de session
  if (done) {
    return (
      <Centered>
        <p className="text-2xl font-bold text-[#2d5016] mb-1">Session terminée 🎉</p>
        <p className="text-[#4a7c23] mb-4">
          {toArabicNumbers(done.known)}/{toArabicNumbers(done.reviewed)} su
        </p>
        <button
          onClick={() => start(dueOnly ? false : true)}
          className="px-5 py-2.5 bg-[#2d5016] text-white rounded-xl text-sm font-bold"
        >
          Continuer
        </button>
      </Centered>
    );
  }

  if (!current) return <Centered>…</Centered>;

  const front = dir === 'ar2fr'
    ? { arabic: true, text: current.arabic }
    : { arabic: false, text: current.gloss };
  const back = dir === 'ar2fr' ? current.gloss : current.arabic;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Progression */}
      <div className="flex-none px-4 pt-3">
        <div className="flex items-center justify-between text-xs text-[#7a5d2c] mb-1">
          <span>
            {toArabicNumbers(idx + 1)} / {toArabicNumbers(queue.length)}
          </span>
          <DirToggle dir={dir} setDir={setDir} compact />
        </div>
        <div className="h-1.5 bg-[#c9a959]/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#4a7c23] transition-all"
            style={{ width: `${((idx) / queue.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Carte */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-4">
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="w-full max-w-md bg-white rounded-3xl shadow-lg border-2 border-[#c9a959]/30 p-8 text-center min-h-[240px] flex flex-col items-center justify-center gap-4"
        >
          {front.arabic ? (
            <span dir="rtl" className="text-[#2d5016]" style={{ fontFamily: "'Amiri',serif", fontSize: '3em', lineHeight: 1.4 }}>
              {front.text}
            </span>
          ) : (
            <span className="text-[#2d5016] text-2xl font-semibold">{front.text}</span>
          )}

          {!revealed ? (
            <span className="text-xs text-gray-400">Touche pour voir la réponse</span>
          ) : (
            <div className="border-t border-[#c9a959]/30 pt-4 w-full">
              {dir === 'ar2fr' ? (
                <span className="text-[#4a7c23] text-xl font-semibold">{back}</span>
              ) : (
                <span dir="rtl" className="text-[#4a7c23]" style={{ fontFamily: "'Amiri',serif", fontSize: '2.4em' }}>
                  {back}
                </span>
              )}
              {current.root && (
                <div className="mt-2">
                  <span dir="rtl" className="text-[11px] text-[#7a5d2c] bg-[#c9a959]/15 rounded-full px-2 py-0.5" style={{ fontFamily: "'Amiri',serif" }}>
                    {current.root.split('').join(' ')}
                  </span>
                </div>
              )}
            </div>
          )}
        </button>
      </div>

      {/* Notation */}
      <div className="flex-none p-4">
        {revealed ? (
          <div className="flex gap-3 max-w-md mx-auto">
            <button
              onClick={() => grade(false)}
              className="flex-1 py-3 rounded-xl bg-[#7a3030]/10 text-[#7a3030] font-bold border-2 border-[#7a3030]/20 active:scale-95 transition-all"
            >
              😕 À revoir
            </button>
            <button
              onClick={() => grade(true)}
              className="flex-1 py-3 rounded-xl bg-[#2d5016] text-white font-bold active:scale-95 transition-all"
            >
              ✅ Je savais
            </button>
          </div>
        ) : (
          <button
            onClick={() => setRevealed(true)}
            className="w-full max-w-md mx-auto block py-3 rounded-xl border-2 border-[#c9a959]/40 text-[#4a7c23] font-bold"
          >
            Voir la réponse
          </button>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">{children}</div>
    </div>
  );
}

function DirToggle({ dir, setDir, compact }: { dir: Dir; setDir: (d: Dir) => void; compact?: boolean }) {
  return (
    <div className={`inline-flex rounded-full bg-[#c9a959]/15 p-0.5 ${compact ? '' : 'mt-1'}`}>
      {(['ar2fr', 'fr2ar'] as Dir[]).map((d) => (
        <button
          key={d}
          onClick={() => setDir(d)}
          className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
            dir === d ? 'bg-[#2d5016] text-white' : 'text-[#7a5d2c]'
          }`}
        >
          {d === 'ar2fr' ? 'ع → fr' : 'fr → ع'}
        </button>
      ))}
    </div>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
