'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface SurahItem {
  name: string;
  fr: string;
  count: number;
}
interface Dhikr {
  ar?: string;
  fr?: string;
  count?: number;
  note?: string;
  label?: string;
  kind?: 'surahs';
  surahs?: SurahItem[];
}
interface AdhkarData {
  matin: Dhikr[];
  soir: Dhikr[];
}

type Session = 'matin' | 'soir';

const AR_FONT = "'Amiri','Scheherazade New','Traditional Arabic',serif";

const META: Record<Session, { label: string; arabic: string; icon: string; grad: string }> = {
  matin: { label: 'Invocations du matin', arabic: 'أذكار الصباح', icon: '🌅', grad: 'from-[var(--ds-gold)] to-[#e0b968]' },
  soir: { label: 'Invocations du soir', arabic: 'أذكار المساء', icon: '🌙', grad: 'from-[var(--ds-green)] to-[var(--ds-sage)]' },
};

/**
 * Texte qui remplit au maximum son conteneur SANS déborder (donc sans scroll) :
 * recherche dichotomique de la plus grande taille de police qui tient.
 */
function FitText({ text, dir = 'rtl', min = 15, max = 68 }: { text: string; dir?: 'rtl' | 'ltr'; min?: number; max?: number }) {
  const cRef = useRef<HTMLDivElement>(null);
  const tRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const c = cRef.current;
    const t = tRef.current;
    if (!c || !t) return;
    const fit = () => {
      let lo = min;
      let hi = max;
      let best = min;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        t.style.fontSize = `${mid}px`;
        if (t.scrollHeight <= c.clientHeight && t.scrollWidth <= c.clientWidth) {
          best = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }
      t.style.fontSize = `${best}px`;
    };
    fit();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(fit);
      ro.observe(c);
      return () => ro.disconnect();
    }
  }, [text, min, max]);

  return (
    <div
      ref={cRef}
      style={{ height: '100%', width: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        ref={tRef}
        dir={dir}
        className="text-center text-[#1a1a1a]"
        style={{ fontFamily: AR_FONT, lineHeight: 1.9, fontSize: `${max}px` }}
      >
        {text}
      </div>
    </div>
  );
}

export default function AdhkarPractice() {
  const [data, setData] = useState<AdhkarData | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  const [counted, setCounted] = useState(0); // compteur d'une invocation simple
  const [surahCounts, setSurahCounts] = useState<number[]>([]); // compteurs de la carte « sourates »
  const [showTrans, setShowTrans] = useState(false);

  useEffect(() => {
    fetch('/adhkar.json')
      .then((r) => r.json())
      .then((d: AdhkarData) => setData(d))
      .catch(() => {});
  }, []);

  const list = session && data ? data[session] : [];
  const card: Dhikr | null = list[index] ?? null;
  const total = list.length;
  const isSurahs = card?.kind === 'surahs';
  const hasCounter = !!card && !isSurahs && (card.count ?? 1) > 1;
  const done = hasCounter && counted >= (card!.count ?? 1);

  // Réinitialise compteurs + traduction à chaque changement de carte.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCounted(0);
    setShowTrans(false);
    setSurahCounts(card?.surahs ? card.surahs.map(() => 0) : []);
  }, [index, session]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const go = (dir: -1 | 1) => setIndex((i) => Math.max(0, Math.min(total - 1, i + dir)));
  const meta = session ? META[session] : null;

  // ---- Écran d'entrée ----
  if (!session) {
    return (
      <div className="min-h-full bg-gradient-to-b from-[var(--ds-bg)] to-[var(--ds-sage-100)] flex flex-col" dir="ltr">
        <div className="px-4 pt-4">
          <Link href="/exercises" className="text-[var(--ds-sage)] text-sm hover:underline">
            ← Retour aux exercices
          </Link>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-5 gap-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-[var(--ds-green)]" dir="rtl" style={{ fontFamily: AR_FONT }}>
              أذكار الصباح والمساء
            </h1>
            <p className="text-[var(--ds-sage)] font-semibold mt-1">Invocations du matin et du soir</p>
          </div>
          <div className="w-full max-w-sm flex flex-col gap-4">
            {(['matin', 'soir'] as Session[]).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSession(s);
                  setIndex(0);
                }}
                disabled={!data}
                className={`w-full rounded-3xl p-6 text-white shadow-lg active:scale-[0.98] transition-all bg-gradient-to-br ${META[s].grad} disabled:opacity-50`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <div className="text-2xl font-bold" dir="rtl" style={{ fontFamily: AR_FONT }}>
                      {META[s].arabic}
                    </div>
                    <div className="text-sm opacity-90 mt-0.5">{META[s].label}</div>
                  </div>
                  <span className="text-5xl">{META[s].icon}</span>
                </div>
              </button>
            ))}
          </div>
          {!data && <p className="text-[var(--ds-sage)]/70 text-sm">Chargement…</p>}
        </div>
      </div>
    );
  }

  // ---- Écran d'une invocation ----
  return (
    <div className="h-full bg-[var(--ds-bg)] flex flex-col overflow-hidden" dir="ltr">
      {/* Barre */}
      <div dir="ltr" className="app-topbar flex-none bg-[var(--ds-green)] text-white px-3 py-2 flex items-center justify-between gap-2">
        <button onClick={() => setSession(null)} className="text-sm hover:underline whitespace-nowrap">
          ← {meta!.icon}
        </button>
        <span className="text-sm font-medium truncate">{card?.label ?? meta!.label}</span>
        <span className="text-xs font-bold bg-[var(--ds-green-deep)] rounded-full px-2.5 py-1 whitespace-nowrap">
          {index + 1} / {total}
        </span>
      </div>

      {/* Progression */}
      <div className="flex-none h-1 bg-[var(--ds-sage-100)]">
        <div className="h-full bg-[var(--ds-gold)] transition-all" style={{ width: `${total ? ((index + 1) / total) * 100 : 0}%` }} />
      </div>

      {card?.note && (
        <div className="flex-none text-center py-1.5">
          <span className="inline-block text-[11px] font-bold text-[#7a5d2c] bg-[var(--ds-gold)]/20 rounded-full px-3 py-1">
            {card.note}
          </span>
        </div>
      )}

      {card && (
        <>
          {isSurahs ? (
            /* Carte « trois sourates » : un compteur par sourate */
            <div className="flex-1 min-h-0 overflow-hidden px-5 py-3 flex flex-col justify-center gap-3">
              {card.surahs!.map((su, i) => {
                const c = surahCounts[i] ?? 0;
                const finished = c >= su.count;
                return (
                  <div
                    key={su.name}
                    className="flex items-center justify-between gap-3 bg-white rounded-2xl border-2 border-[var(--ds-gold)]/40 px-4 py-3 shadow-sm"
                  >
                    <div className="min-w-0">
                      <div dir="rtl" className="font-bold text-[var(--ds-green)] leading-tight" style={{ fontFamily: AR_FONT, fontSize: 'clamp(1.5rem,7vw,2.4rem)' }}>
                        {su.name}
                      </div>
                      <div className="text-xs text-[var(--ds-sage)]">{su.fr}</div>
                    </div>
                    <button
                      onClick={() => setSurahCounts((arr) => arr.map((v, j) => (j === i ? Math.min(su.count, v + 1) : v)))}
                      className={`flex-none w-20 h-20 rounded-full flex flex-col items-center justify-center border-4 active:scale-95 transition-all ${
                        finished ? 'bg-[var(--ds-green)] text-white border-[var(--ds-gold)]' : 'bg-[var(--ds-bg)] text-[var(--ds-green)] border-[var(--ds-gold)]'
                      }`}
                    >
                      <span className="text-2xl font-bold tabular-nums leading-none">{c}</span>
                      <span className="text-[10px] opacity-70">/ {su.count}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Invocation : texte arabe qui remplit l'écran sans scroll */
            <div className="flex-1 min-h-0 px-4 py-3">
              <FitText text={card.ar ?? ''} />
            </div>
          )}

          {/* Compteur d'une invocation simple */}
          {hasCounter && (
            <div className="flex-none px-5 pb-2 flex flex-col items-center gap-1.5">
              <button
                onClick={() => setCounted((c) => Math.min(card.count ?? 1, c + 1))}
                className={`w-28 h-28 rounded-full flex flex-col items-center justify-center shadow-lg border-4 active:scale-95 transition-all ${
                  done ? 'bg-[var(--ds-green)] text-white border-[var(--ds-gold)]' : 'bg-white text-[var(--ds-green)] border-[var(--ds-gold)]'
                }`}
              >
                <span className="text-5xl font-bold tabular-nums leading-none">{counted}</span>
                <span className="text-xs opacity-70 mt-1">/ {card.count}</span>
              </button>
              <div className="flex items-center gap-3 text-xs">
                <button onClick={() => setCounted(0)} className="font-bold text-[#7a3030] px-3 py-1 rounded-full border border-[#7a3030]/30">
                  ↺ Réinitialiser
                </button>
                {done ? <span className="font-bold text-[var(--ds-green)]">✓ Terminé</span> : <span className="text-gray-400">Touche pour compter</span>}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex-none px-4 py-3 border-t border-[var(--ds-gold)]/30 bg-[var(--ds-bg)] flex items-center gap-2">
            <button
              onClick={() => go(-1)}
              disabled={index === 0}
              className="px-3 py-2.5 rounded-xl text-sm font-bold border-2 border-[var(--ds-gold)]/40 text-[var(--ds-green)] disabled:opacity-30 active:scale-95"
            >
              ‹ Préc.
            </button>
            <button
              onClick={() => setShowTrans(true)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold border-2 border-[var(--ds-green)] text-[var(--ds-green)] active:scale-95 flex items-center justify-center gap-1.5"
            >
              📖 Traduction
            </button>
            {index < total - 1 ? (
              <button
                onClick={() => go(1)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[var(--ds-green)] active:scale-95 shadow-md"
              >
                Suivant ›
              </button>
            ) : (
              <button
                onClick={() => setSession(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[var(--ds-green)] active:scale-95 shadow-md"
              >
                Terminer ✓
              </button>
            )}
          </div>
        </>
      )}

      {/* Layer traduction */}
      {showTrans && card && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={() => setShowTrans(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-[var(--ds-bg)] rounded-t-2xl shadow-2xl border-t-2 border-[var(--ds-gold)] max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-none px-4 pt-3 pb-2 border-b border-[var(--ds-gold)]/40 flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--ds-green)]">Traduction</span>
              <button onClick={() => setShowTrans(false)} className="text-[var(--ds-green)] text-lg leading-none px-2">
                ✕
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
              {isSurahs ? (
                <ul className="text-[15px] text-[#2d3a1a] leading-relaxed max-w-2xl mx-auto space-y-1">
                  {card.surahs!.map((su) => (
                    <li key={su.name}>
                      <span className="font-bold">{su.fr}</span> — à réciter {su.count} fois.
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[15px] text-[#2d3a1a] leading-relaxed max-w-2xl mx-auto">{card.fr}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
