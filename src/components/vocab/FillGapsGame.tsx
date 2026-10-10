'use client';

import { useCallback, useEffect, useState } from 'react';
import { getVocab, recordReview, type VocabEntry } from '@/utils/vocab/vocabStore';
import { buildGapItems, playablePool, type GapItem } from '@/utils/vocab/fragments';
import { toArabicNumbers } from '@/utils/arabicNumbers';

/**
 * « Replacer les mots » (façon Duolingo) : un FRAGMENT de verset (pas le verset
 * entier) où les mots du lexique sont retirés ; on les remet depuis une banque
 * de tuiles (réponses + leurres tirés du lexique). Les particules collées
 * (و, ف, بِ…) restent affichées hors du trou. Indice : le sens DANS CE VERSET.
 */

const SESSION = 10;
const AR_FONT = "'UthmanicHafs','Amiri','Scheherazade New',serif";

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
  const [hint, setHint] = useState(false);
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
    setHint(false);
    if (!built.length) {
      setPhase('empty');
      return;
    }
    setFilled(Array(built[0].gaps.length).fill(null));
    setUsedTiles([]);
    setPhase('play');
  }, [startPage, endPage]);

  useEffect(() => {
    prepare();
  }, [prepare]);

  // Traduction Hamidullah (affichée après vérification, comme contexte).
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

  const placeTile = (tileIdx: number) => {
    if (phase !== 'play' || !item) return;
    if (usedTiles.includes(tileIdx)) return;
    const slot = filled.findIndex((f) => f === null);
    if (slot < 0) return;
    const nf = [...filled];
    nf[slot] = item.tiles[tileIdx];
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
    setHint(false);
    setPhase('play');
  };

  if (phase === 'loading') {
    return (
      <Centered>
        <p className="text-[var(--ds-n600)] text-sm">Préparation des fragments…</p>
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

      <h2 className="text-sm md:text-base font-bold text-center text-[var(--ds-text)] mb-3">
        Replace {item.gaps.length > 1 ? 'les mots manquants' : 'le mot manquant'} dans le verset
      </h2>

      {/* Fragment à trous */}
      <div className="bg-white rounded-3xl shadow-sm border border-[var(--ds-gold)]/30 px-4 py-5 mb-4">
        <p dir="rtl" className="text-[var(--ds-text)] leading-[2.4]" style={{ fontFamily: AR_FONT, fontSize: '1.9em' }}>
          {item.words.map((w) => {
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
                  className={`inline-flex items-center justify-center align-baseline min-w-[3.2em] px-2 mx-0.5 rounded-xl border-2 transition-colors ${
                    good
                      ? 'border-[var(--ds-green)] bg-[var(--ds-sage-100)] text-[var(--ds-green)]'
                      : bad
                        ? 'border-red-400 bg-red-50 text-red-700 line-through'
                        : value
                          ? 'border-[var(--ds-gold)] bg-[var(--ds-gold)]/15 text-[var(--ds-green)]'
                          : 'border-dashed border-[var(--ds-gold)]/60 bg-[var(--ds-bg)] text-transparent'
                  }`}
                  style={{ lineHeight: 1.6 }}
                >
                  {value ?? '…'}
                </button>
                {bad && (
                  <span className="text-[var(--ds-green)] font-bold mx-0.5">{item.gaps[gi].answer}</span>
                )}{' '}
              </span>
            );
          })}
        </p>
        <p className="text-[11px] text-[var(--ds-n500)] italic mt-1" dir="ltr">
          Verset {item.verseKey} en entier — touche un trou rempli pour le vider.
        </p>
      </div>

      {/* Traduction Hamidullah COMPLÈTE du verset (contexte permanent) */}
      {trans?.[item.verseKey] && (
        <p className="text-[13px] text-gray-700 leading-relaxed bg-white/70 rounded-xl px-3 py-2 mb-3 border border-[var(--ds-gold)]/20">
          <span className="font-bold text-[#7a5d2c]">Traduction (Hamidullah) : </span>
          {trans[item.verseKey]}
        </p>
      )}

      {/* Indice : sens dans ce verset */}
      {phase === 'play' && (
        <div className="mb-3">
          {hint ? (
            <ul className="text-[13px] text-[var(--ds-n700)] bg-[var(--ds-gold)]/10 rounded-xl px-3 py-2 space-y-0.5">
              {item.gaps.map((g, i) => (
                <li key={g.position}>
                  <span className="font-bold text-[#7a5d2c]">Mot {toArabicNumbers(i + 1)} :</span> {g.gloss || '—'}
                </li>
              ))}
            </ul>
          ) : (
            <button
              type="button"
              onClick={() => setHint(true)}
              className="text-xs font-bold text-[var(--ds-sage)] border border-[var(--ds-gold)]/50 rounded-full px-3 py-1 hover:bg-white/60"
            >
              💡 Indice (sens dans ce verset)
            </button>
          )}
        </div>
      )}

      {/* Après vérification : sens + traduction du verset */}
      {phase === 'checked' && (
        <div className="mb-3 rounded-xl border border-[var(--ds-gold)]/30 bg-white/70 px-3 py-2">
          <ul className="text-[13px] text-[var(--ds-n700)] space-y-0.5 mb-1.5">
            {item.gaps.map((g) => (
              <li key={g.position} className="flex items-baseline gap-2">
                <span dir="rtl" className="text-[var(--ds-green)] font-bold" style={{ fontFamily: AR_FONT, fontSize: '1.25em' }}>
                  {g.answer}
                </span>
                <span>{g.gloss || '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Banque de tuiles */}
      <div className="flex flex-wrap gap-2 justify-center mb-5" dir="rtl">
        {item.tiles.map((t, i) => {
          const used = usedTiles.includes(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => placeTile(i)}
              disabled={used || phase !== 'play'}
              className={`rounded-2xl border-[1.5px] px-4 py-2 transition-all shadow-sm ${
                used
                  ? 'opacity-25 border-[var(--ds-divider)] bg-white'
                  : 'border-[var(--ds-green)] bg-white hover:bg-[var(--ds-sage-100)] active:scale-[0.97]'
              }`}
            >
              <span className="text-[var(--ds-text)]" style={{ fontFamily: AR_FONT, fontSize: '1.6em', lineHeight: 1.5 }}>
                {t}
              </span>
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3 max-w-md mx-auto w-full">
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
