'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getVocab, recordReview, type VocabEntry } from '@/utils/vocab/vocabStore';
import { buildGapItems, playablePool, type GapItem } from '@/utils/vocab/fragments';
import { toArabicNumbers } from '@/utils/arabicNumbers';

/**
 * « Replacer les mots » (façon Duolingo). Ordre d'affichage : (1) texte arabe
 * FENÊTRÉ autour des trous (une ligne avant / après, bouton « voir tout »),
 * (2) banque de tuiles — chaque tuile = un mot + SA TRADUCTION dessous,
 * (3) traduction Hamidullah du verset (bouton « voir tout »). Les particules
 * collées (و, ف, بِ) restent hors du trou. Arabe volontairement compact.
 */

const SESSION = 10;
const AR_FONT = "'UthmanicHafs','Amiri','Scheherazade New',serif";
// Fenêtre par défaut autour des trous : ~une ligne de Mushaf de chaque côté.
const LINE_WORDS = 7;
const TRANS_PREVIEW = 90; // caractères de traduction avant « voir tout »

type Phase = 'loading' | 'empty' | 'play' | 'checked' | 'done';

export default function FillGapsGame({
  startPage = null,
  endPage = null,
}: {
  startPage?: number | null;
  endPage?: number | null;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [items, setItems] = useState<GapItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [filled, setFilled] = useState<(string | null)[]>([]); // par trou
  const [usedTiles, setUsedTiles] = useState<number[]>([]); // index de tuile par trou
  const [showAllVerse, setShowAllVerse] = useState(false);
  const [showAllTrans, setShowAllTrans] = useState(false);
  const [trans, setTrans] = useState<Record<string, string> | null>(null);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  const [poolSize, setPoolSize] = useState(0);

  const prepare = useCallback(async () => {
    setPhase('loading');
    const all: VocabEntry[] = getVocab().filter((e) => e.arabic);
    const { pool, hits } = await playablePool(all, startPage, endPage);
    setPoolSize(pool.length);
    const built = await buildGapItems(pool, SESSION, hits);
    setItems(built);
    setIdx(0);
    setScore({ ok: 0, total: 0 });
    if (!built.length) {
      setPhase('empty');
      return;
    }
    setFilled(Array(built[0].gaps.length).fill(null));
    setUsedTiles([]);
    setShowAllVerse(false);
    setShowAllTrans(false);
    setPhase('play');
  }, [startPage, endPage]);

  useEffect(() => {
    prepare();
  }, [prepare]);

  useEffect(() => {
    let cancelled = false;
    fetch('/qcf-data/translation-hamidullah.fr.json')
      .then((r) => r.json())
      .then((d) => !cancelled && setTrans(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const item = items[idx];

  // Fenêtre d'affichage : mots autour des trous (une ligne avant / après).
  const window = useMemo(() => {
    if (!item) return { start: 1, end: 1 };
    const positions = item.gaps.map((g) => g.position);
    const minG = Math.min(...positions);
    const maxG = Math.max(...positions);
    const n = item.words.length ? item.words[item.words.length - 1].position : maxG;
    return {
      start: Math.max(1, minG - LINE_WORDS),
      end: Math.min(n, maxG + LINE_WORDS),
    };
  }, [item]);

  const placeTile = (tileIdx: number) => {
    if (phase !== 'play' || !item) return;
    if (usedTiles.includes(tileIdx)) return;
    const slot = filled.findIndex((f) => f === null);
    if (slot < 0) return;
    const nf = [...filled];
    nf[slot] = item.tiles[tileIdx].word;
    setFilled(nf);
    const nu = [...usedTiles];
    nu[slot] = tileIdx;
    setUsedTiles(nu);
  };

  const clearGap = (slot: number) => {
    if (phase !== 'play') return;
    const nf = [...filled];
    nf[slot] = null;
    setFilled(nf);
    const nu = [...usedTiles];
    nu[slot] = -1;
    setUsedTiles(nu);
  };

  const check = () => {
    if (!item) return;
    let ok = 0;
    item.gaps.forEach((g, i) => {
      const good = filled[i] === g.answer;
      if (good) ok++;
      recordReview(g.entryId, good);
    });
    setScore((s) => ({ ok: s.ok + ok, total: s.total + item.gaps.length }));
    setPhase('checked');
  };

  const next = () => {
    if (idx + 1 >= items.length) {
      setPhase('done');
      return;
    }
    const n = idx + 1;
    setIdx(n);
    setFilled(Array(items[n].gaps.length).fill(null));
    setUsedTiles([]);
    setShowAllVerse(false);
    setShowAllTrans(false);
    setPhase('play');
  };

  if (phase === 'loading') {
    return (
      <Centered>
        <p className="text-[var(--ds-n600)] text-sm">Préparation des versets…</p>
      </Centered>
    );
  }

  if (phase === 'empty') {
    return (
      <Centered>
        <p className="font-extrabold text-lg text-[var(--ds-green)]">Rien à replacer pour l’instant.</p>
        <p className="text-[var(--ds-n600)] text-sm max-w-sm mt-1">
          {poolSize === 0
            ? 'Aucun mot de ton lexique dans cette plage. Élargis la plage ou ajoute des mots en lisant.'
            : 'Les mots de ta plage n’ont pas encore d’occurrence repérée. Ajoute-les depuis le Mushaf (bouton +) pour capturer leur verset.'}
        </p>
      </Centered>
    );
  }

  if (phase === 'done') {
    return (
      <Centered>
        <div className="w-16 h-16 rounded-full bg-[var(--ds-sage-100)] text-[var(--ds-green)] flex items-center justify-center text-3xl mx-auto">
          ✓
        </div>
        <p className="font-extrabold text-2xl text-[var(--ds-green)] mt-3">Session terminée</p>
        <p className="text-[var(--ds-n700)] mt-1">
          {toArabicNumbers(score.ok)} / {toArabicNumbers(score.total)} mots bien replacés
        </p>
        <button onClick={prepare} className="ds-btn-gold px-6 py-3 text-sm mt-4">
          Rejouer
        </button>
      </Centered>
    );
  }

  if (!item) return null;
  const allFilled = filled.every((f) => f !== null);
  const gapIndexAt = (position: number) => item.gaps.findIndex((g) => g.position === position);
  const visibleWords = showAllVerse
    ? item.words
    : item.words.filter((w) => w.position >= window.start && w.position <= window.end);
  const truncatedStart = !showAllVerse && window.start > 1;
  const truncatedEnd =
    !showAllVerse && item.words.length > 0 && window.end < item.words[item.words.length - 1].position;
  const verseHasMore =
    item.words.length > visibleWords.length || showAllVerse;

  const fullTrans = trans?.[item.verseKey] ?? '';
  const transTooLong = fullTrans.length > TRANS_PREVIEW;
  const shownTrans = showAllTrans || !transTooLong ? fullTrans : fullTrans.slice(0, TRANS_PREVIEW).trimEnd() + '…';

  return (
    <div dir="ltr" className="flex flex-col h-full max-w-2xl mx-auto" style={{ fontFamily: 'var(--ds-font)' }}>
      {/* En-tête */}
      <div className="flex items-center justify-between text-xs text-[#7a5d2c] mb-2">
        <span>
          {toArabicNumbers(idx + 1)} / {toArabicNumbers(items.length)}
        </span>
        <span className="font-bold text-[var(--ds-green)]">{item.verseKey}</span>
        <span className="text-[var(--ds-sage)]">✓ {toArabicNumbers(score.ok)}</span>
      </div>
      <div className="h-1.5 bg-[var(--ds-gold)]/20 rounded-full overflow-hidden mb-4">
        <div className="h-full bg-[var(--ds-sage)] transition-all" style={{ width: `${(idx / items.length) * 100}%` }} />
      </div>

      <h2 className="text-sm font-bold text-center text-[var(--ds-text)] mb-3">
        Replace {item.gaps.length > 1 ? 'les mots' : 'le mot'} dans le verset
      </h2>

      {/* 1) TEXTE ARABE fenêtré, compact */}
      <div className="bg-white rounded-2xl shadow-sm border border-[var(--ds-gold)]/30 px-3 py-4 mb-2">
        <p dir="rtl" className="text-[var(--ds-text)] text-center" style={{ fontFamily: AR_FONT, fontSize: '1.35em', lineHeight: 2.1 }}>
          {truncatedStart && <span className="text-[var(--ds-n400)]">… </span>}
          {visibleWords.map((w) => {
            const gi = gapIndexAt(w.position);
            if (gi < 0) return <span key={w.position}>{w.form} </span>;
            const value = filled[gi];
            const good = phase === 'checked' && value === item.gaps[gi].answer;
            const bad = phase === 'checked' && !good;
            return (
              <span key={w.position} className="inline-block whitespace-nowrap">
                {w.prefix && <span>{w.prefix}</span>}
                <button
                  type="button"
                  onClick={() => clearGap(gi)}
                  className={`inline-flex items-center justify-center align-baseline min-w-[2.6em] px-1.5 mx-0.5 rounded-lg border-2 transition-colors ${
                    good
                      ? 'border-[var(--ds-green)] bg-[var(--ds-sage-100)] text-[var(--ds-green)]'
                      : bad
                        ? 'border-red-400 bg-red-50 text-red-700'
                        : value
                          ? 'border-[var(--ds-gold)] bg-[var(--ds-gold)]/15 text-[var(--ds-green)]'
                          : 'border-dashed border-[var(--ds-gold)]/60 bg-[var(--ds-bg)] text-transparent'
                  }`}
                  style={{ lineHeight: 1.4 }}
                >
                  {value ?? '•••'}
                </button>
                {bad && <span className="text-[var(--ds-green)] font-bold mx-0.5">{item.gaps[gi].answer}</span>}{' '}
              </span>
            );
          })}
          {truncatedEnd && <span className="text-[var(--ds-n400)]"> …</span>}
        </p>
        {verseHasMore && (
          <div className="text-center mt-1">
            <button
              type="button"
              onClick={() => setShowAllVerse((v) => !v)}
              className="text-[11px] font-bold text-[var(--ds-sage)] underline"
            >
              {showAllVerse ? 'Réduire au passage' : 'Voir tout le verset'}
            </button>
          </div>
        )}
      </div>

      {/* 2) BANQUE DE TUILES : chaque tuile = mot + sa traduction dessous */}
      <p className="text-center text-[11px] text-[var(--ds-n500)] italic mb-2">
        Touche une carte pour la placer dans le prochain trou — touche un trou rempli pour le vider.
      </p>
      <div className="flex flex-wrap gap-2 justify-center mb-4">
        {item.tiles.map((t, i) => {
          const used = usedTiles.includes(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => placeTile(i)}
              disabled={used || phase !== 'play'}
              className={`flex flex-col items-center rounded-2xl border-[1.5px] px-3 py-2 min-w-[5.5em] transition-all shadow-sm ${
                used
                  ? 'opacity-25 border-[var(--ds-divider)] bg-white'
                  : 'border-[var(--ds-green)] bg-white hover:bg-[var(--ds-sage-100)] active:scale-[0.97]'
              }`}
            >
              <span dir="rtl" className="text-[var(--ds-text)]" style={{ fontFamily: AR_FONT, fontSize: '1.5em', lineHeight: 1.5 }}>
                {t.word}
              </span>
              <span className="text-[11px] text-[var(--ds-n600)] text-center leading-tight mt-0.5">{t.gloss}</span>
            </button>
          );
        })}
      </div>

      {/* 3) TRADUCTION Hamidullah, repliée par défaut */}
      {fullTrans && (
        <div className="bg-white/70 rounded-xl px-3 py-2 mb-4 border border-[var(--ds-gold)]/20">
          <p className="text-[13px] text-gray-700 leading-relaxed">
            <span className="font-bold text-[#7a5d2c]">Traduction : </span>
            {shownTrans}
          </p>
          {transTooLong && (
            <button
              type="button"
              onClick={() => setShowAllTrans((v) => !v)}
              className="text-[11px] font-bold text-[var(--ds-sage)] underline mt-0.5"
            >
              {showAllTrans ? 'Réduire' : 'Voir toute la traduction'}
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 max-w-md mx-auto w-full mt-auto">
        {phase === 'play' ? (
          <button
            onClick={check}
            disabled={!allFilled}
            className="flex-1 py-3 rounded-xl bg-[var(--ds-green)] text-white font-bold disabled:opacity-40 active:scale-95 transition-all"
          >
            Vérifier
          </button>
        ) : (
          <button
            onClick={next}
            className="flex-1 py-3 rounded-xl bg-[var(--ds-green)] text-white font-bold active:scale-95 transition-all"
          >
            {idx + 1 >= items.length ? 'Terminer' : 'Suivant'}
          </button>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-20 text-center" dir="ltr">
      {children}
    </div>
  );
}
