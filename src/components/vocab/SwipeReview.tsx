'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getVocab,
  recordReview,
  seedVocabIfNeeded,
  importSeed,
  type VocabEntry,
} from '@/utils/vocab/vocabStore';
import { scopeVocabToPages } from '@/utils/vocab/rangeScope';
import { toArabicNumbers } from '@/utils/arabicNumbers';

const THRESHOLD = 110;

interface QItem {
  entry: VocabEntry;
  ref?: { verseKey: string; page: number };
  count: number;
}

/**
 * Révision « à la Tinder », SCOPÉE À UNE PLAGE (« où j'en suis »). Le mot et son
 * sens sont affichés directement ; on glisse à droite (acquis) / gauche (à revoir).
 * Seuls les mots du lexique PRÉSENTS dans la plage choisie sont proposés
 * (identité par lemme, comme le surlignage du Mushaf — jamais par racine seule).
 */
export default function SwipeReview({
  onEmpty,
  startPage,
  endPage,
}: {
  onEmpty?: () => void;
  startPage: number | null;
  endPage: number | null;
}) {
  const [ready, setReady] = useState(false);
  const [total, setTotal] = useState(0);
  const [building, setBuilding] = useState(false);
  const [queue, setQueue] = useState<QItem[]>([]);
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<{ reviewed: number; known: number } | null>(null);
  const scored = useRef({ reviewed: 0, known: 0 });
  const [knownCount, setKnownCount] = useState(0); // pour l'affichage (pas de ref en rendu)

  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const committing = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    seedVocabIfNeeded().then(() => {
      setTotal(getVocab().length);
      setReady(true);
    });
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Construit la file scopée à la plage : mots du lexique qui y apparaissent,
  // triés par 1re apparition (ordre de progression).
  const beginRange = async () => {
    if (startPage == null || endPage == null) return;
    setBuilding(true);
    const scoped = await scopeVocabToPages(getVocab(), startPage, endPage);
    launch(
      scoped.map(({ entry, hit }) => ({
        entry,
        ref: { verseKey: hit.verseKey, page: hit.firstPage },
        count: hit.count,
      }))
    );
    setBuilding(false);
  };

  const beginAll = () => {
    launch(shuffle(getVocab()).map((entry) => ({ entry, count: 0 })));
  };

  const launch = (items: QItem[]) => {
    setQueue(items);
    setIdx(0);
    setDone(null);
    setDx(0);
    setStarted(true);
    scored.current = { reviewed: 0, known: 0 };
    setKnownCount(0);
  };

  const current = queue[idx];
  const next = queue[idx + 1];

  const advance = () => {
    if (idx + 1 >= queue.length) setDone({ ...scored.current });
    else setIdx(idx + 1);
    setAnimating(false);
    setDx(0);
    committing.current = false;
  };

  const commit = (known: boolean) => {
    if (committing.current || !current) return;
    committing.current = true;
    recordReview(current.entry.id, known);
    scored.current.reviewed++;
    if (known) {
      scored.current.known++;
      setKnownCount((c) => c + 1);
    }
    setAnimating(true);
    setDx(known ? 700 : -700);
  };

  const onDown = (e: React.PointerEvent) => {
    if (committing.current) return;
    dragging.current = true;
    startX.current = e.clientX;
    setAnimating(false);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragging.current) setDx(e.clientX - startX.current);
  };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (Math.abs(dx) > THRESHOLD) commit(dx > 0);
    else {
      setAnimating(true);
      setDx(0);
    }
  };

  if (!ready) return <Centered>Chargement…</Centered>;

  if (total === 0) {
    return (
      <Centered>
        <p className="text-gray-500 mb-4">Ton lexique est vide.</p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={async () => {
              await importSeed();
              setTotal(getVocab().length);
            }}
            className="px-4 py-2 bg-[var(--ds-green)] text-white rounded-lg text-sm font-bold"
          >
            Importer mon lexique
          </button>
          <button onClick={() => onEmpty?.()} className="px-4 py-2 border-2 border-[var(--ds-gold)]/40 text-[var(--ds-sage)] rounded-lg text-sm font-bold">
            Enregistrer des mots
          </button>
        </div>
      </Centered>
    );
  }

  // Écran d'accueil : on se cale sur la plage GLOBALE (sélecteur en haut).
  if (!started) {
    const hasRange = startPage != null && endPage != null;
    return (
      <Centered>
        <p className="text-[var(--ds-green)] text-lg font-bold mb-1">Parcourir mon vocabulaire</p>
        {hasRange ? (
          <p className="text-sm text-gray-500 mb-4">
            Sur ta plage (pages {Math.min(startPage!, endPage!)}→{Math.max(startPage!, endPage!)}),
            je ne te propose que les mots qui <b>y apparaissent</b>.
          </p>
        ) : (
          <p className="text-sm text-gray-500 mb-4">Définis ta plage en haut ↑ pour cibler ta révision.</p>
        )}
        <div className="flex gap-2 justify-center">
          <button
            onClick={beginRange}
            disabled={!hasRange || building}
            className="px-5 py-2.5 bg-gradient-to-r from-[var(--ds-green)] to-[var(--ds-sage)] text-white rounded-xl text-sm font-bold disabled:opacity-40"
          >
            {building ? 'Préparation…' : 'Réviser cette plage'}
          </button>
          <button
            onClick={beginAll}
            className="px-5 py-2.5 border-2 border-[var(--ds-gold)]/40 text-[var(--ds-sage)] rounded-xl text-sm font-bold hover:border-[var(--ds-gold)]"
          >
            Tout ({toArabicNumbers(total)})
          </button>
        </div>
      </Centered>
    );
  }

  // File vide après filtrage
  if (queue.length === 0) {
    return (
      <Centered>
        <p className="text-gray-500 mb-4">Aucun mot de ton lexique dans cette plage.</p>
        <div className="flex gap-2 justify-center">
          <button onClick={() => setStarted(false)} className="px-4 py-2 bg-[var(--ds-green)] text-white rounded-lg text-sm font-bold">
            Retour
          </button>
          <button onClick={beginAll} className="px-4 py-2 border-2 border-[var(--ds-gold)]/40 text-[var(--ds-sage)] rounded-lg text-sm font-bold">
            Tout mon lexique
          </button>
        </div>
      </Centered>
    );
  }

  if (done) {
    return (
      <Centered>
        <p className="text-2xl font-bold text-[var(--ds-green)] mb-1">Terminé 🎉</p>
        <p className="text-[var(--ds-sage)] mb-4">
          {toArabicNumbers(done.known)}/{toArabicNumbers(done.reviewed)} acquis
        </p>
        <div className="flex gap-2 justify-center">
          <button onClick={() => launch(queue)} className="px-5 py-2.5 bg-[var(--ds-green)] text-white rounded-xl text-sm font-bold">
            Recommencer
          </button>
          <button onClick={() => setStarted(false)} className="px-5 py-2.5 border-2 border-[var(--ds-gold)]/40 text-[var(--ds-sage)] rounded-xl text-sm font-bold">
            Retour
          </button>
        </div>
      </Centered>
    );
  }

  if (!current) return <Centered>…</Centered>;
  const rot = dx / 22;
  const rightHint = Math.max(0, Math.min(1, dx / THRESHOLD));
  const leftHint = Math.max(0, Math.min(1, -dx / THRESHOLD));

  return (
    <div className="flex-1 min-h-0 flex flex-col select-none">
      <div className="flex-none px-4 pt-3">
        <div className="flex items-center justify-between text-xs text-[#7a5d2c] mb-1">
          <button onClick={() => setStarted(false)} className="hover:underline">
            ↤ plage
          </button>
          <span>
            {toArabicNumbers(idx + 1)} / {toArabicNumbers(queue.length)}
          </span>
          <span className="text-[var(--ds-sage)]">✓ {toArabicNumbers(knownCount)}</span>
        </div>
        <div className="h-1.5 bg-[var(--ds-gold)]/20 rounded-full overflow-hidden">
          <div className="h-full bg-[var(--ds-sage)] transition-all" style={{ width: `${(idx / queue.length) * 100}%` }} />
        </div>
      </div>

      <div className="flex-1 min-h-0 relative flex items-center justify-center p-4">
        {next && (
          <div className="absolute w-full max-w-md" style={{ transform: 'scale(0.95) translateY(10px)', opacity: 0.5 }}>
            <Card item={next} />
          </div>
        )}
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onTransitionEnd={() => {
            if (animating && Math.abs(dx) > 600) advance();
          }}
          className="absolute w-full max-w-md touch-none cursor-grab active:cursor-grabbing"
          style={{
            transform: `translateX(${dx}px) rotate(${rot}deg)`,
            transition: animating ? 'transform 0.25s ease-out' : 'none',
          }}
        >
          <Card item={current} rightHint={rightHint} leftHint={leftHint} />
        </div>
      </div>

      <div className="flex-none p-4 flex gap-3 max-w-md mx-auto w-full">
        <button
          onClick={() => commit(false)}
          className="flex-1 py-3 rounded-xl bg-[#7a3030]/10 text-[#7a3030] font-bold border-2 border-[#7a3030]/20 active:scale-95 transition-all"
        >
          ↺ À revoir
        </button>
        <button
          onClick={() => commit(true)}
          className="flex-1 py-3 rounded-xl bg-[var(--ds-green)] text-white font-bold active:scale-95 transition-all"
        >
          Acquis ✓
        </button>
      </div>
    </div>
  );
}

function Card({ item, rightHint = 0, leftHint = 0 }: { item: QItem; rightHint?: number; leftHint?: number }) {
  const { entry, ref, count } = item;
  return (
    <div className="relative bg-white rounded-3xl shadow-xl border-2 border-[var(--ds-gold)]/30 p-8 min-h-[280px] flex flex-col items-center justify-center gap-4 text-center">
      <div className="absolute top-4 left-4 text-[var(--ds-green)] font-black text-lg border-2 border-[var(--ds-green)] rounded-lg px-2 py-0.5 rotate-[-12deg]" style={{ opacity: rightHint }}>
        ACQUIS
      </div>
      <div className="absolute top-4 right-4 text-[#7a3030] font-black text-lg border-2 border-[#7a3030] rounded-lg px-2 py-0.5 rotate-[12deg]" style={{ opacity: leftHint }}>
        À REVOIR
      </div>

      <span dir="rtl" className="text-[var(--ds-green)]" style={{ fontFamily: "'Amiri',serif", fontSize: '3.2em', lineHeight: 1.3 }}>
        {entry.arabic}
      </span>
      <span className="text-[var(--ds-sage)] text-xl font-semibold">{entry.gloss}</span>

      <div className="flex items-center gap-2 flex-wrap justify-center">
        {entry.root && (
          <span dir="rtl" className="text-[11px] text-[#7a5d2c] bg-[var(--ds-gold)]/15 rounded-full px-2 py-0.5" style={{ fontFamily: "'Amiri',serif" }}>
            {entry.root.split('').join(' ')}
          </span>
        )}
        {ref && (
          <span className="text-[11px] text-[var(--ds-green)] bg-[var(--ds-green)]/8 rounded-full px-2 py-0.5 font-semibold">
            {ref.verseKey} · p.{toArabicNumbers(ref.page)}
            {count > 1 ? ` (+${toArabicNumbers(count - 1)})` : ''}
          </span>
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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
