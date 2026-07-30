'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toArabicNumbers } from '@/utils/arabicNumbers';

interface Dhikr {
  ar: string;
  fr: string;
  count: number;
  note?: string;
}
interface AdhkarData {
  matin: Dhikr[];
  soir: Dhikr[];
}

type Session = 'matin' | 'soir';

const AR_FONT = "'Amiri','Scheherazade New','Traditional Arabic',serif";

const META: Record<Session, { label: string; arabic: string; icon: string; grad: string }> = {
  matin: { label: 'Invocations du matin', arabic: 'أذكار الصباح', icon: '🌅', grad: 'from-[#c9a959] to-[#e0b968]' },
  soir: { label: 'Invocations du soir', arabic: 'أذكار المساء', icon: '🌙', grad: 'from-[#2d5016] to-[#4a7c23]' },
};

export default function AdhkarPractice() {
  const [data, setData] = useState<AdhkarData | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  const [counted, setCounted] = useState(0); // répétitions comptées pour la carte courante
  const [showTrans, setShowTrans] = useState(false);

  useEffect(() => {
    fetch('/adhkar.json')
      .then((r) => r.json())
      .then((d: AdhkarData) => setData(d))
      .catch(() => {});
  }, []);

  const list = session && data ? data[session] : [];
  const card: Dhikr | null = list[index] ?? null;

  // Réinitialise le compteur et ferme la traduction à chaque changement de carte.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCounted(0);
    setShowTrans(false);
  }, [index, session]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const total = list.length;
  const hasCounter = !!card && card.count > 1;
  const done = hasCounter && counted >= card!.count;

  const go = (dir: -1 | 1) => {
    setIndex((i) => Math.max(0, Math.min(total - 1, i + dir)));
  };

  const meta = session ? META[session] : null;

  // ---- Écran d'entrée : choix matin / soir ----
  if (!session) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-[#fdfaf3] to-[#f4e9d0] flex flex-col" dir="ltr">
        <div className="px-4 pt-4">
          <Link href="/exercises" className="text-[#4a7c23] text-sm hover:underline">
            ← Retour aux exercices
          </Link>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-5 gap-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-[#2d5016]" dir="rtl" style={{ fontFamily: AR_FONT }}>
              أذكار الصباح والمساء
            </h1>
            <p className="text-[#7a8b3e] font-semibold mt-1">Invocations du matin et du soir</p>
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
          {!data && <p className="text-[#4a7c23]/70 text-sm">Chargement…</p>}
        </div>
      </div>
    );
  }

  // ---- Écran d'une invocation ----
  return (
    <div className="h-[100dvh] bg-[#fdfaf3] flex flex-col overflow-hidden" dir="ltr">
      {/* Barre */}
      <div className="flex-none bg-[#2d5016] text-white px-3 py-2 flex items-center justify-between gap-2">
        <button onClick={() => setSession(null)} className="text-sm hover:underline whitespace-nowrap">
          ← {meta!.icon}
        </button>
        <span className="text-sm font-medium truncate">{meta!.label}</span>
        <span className="text-xs font-bold bg-[#1f3a0f] rounded-full px-2.5 py-1 whitespace-nowrap">
          {toArabicNumbers(index + 1)} / {toArabicNumbers(total)}
        </span>
      </div>

      {/* Barre de progression */}
      <div className="flex-none h-1 bg-[#f4e9d0]">
        <div
          className="h-full bg-[#c9a959] transition-all"
          style={{ width: `${total ? ((index + 1) / total) * 100 : 0}%` }}
        />
      </div>

      {card && (
        <>
          {/* Texte arabe — plein écran, défilable si long */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-6 flex items-center justify-center">
            <div className="w-full max-w-2xl">
              {card.note && (
                <div className="text-center mb-4">
                  <span className="inline-block text-[11px] font-bold text-[#7a5d2c] bg-[#c9a959]/20 rounded-full px-3 py-1">
                    {card.note}
                  </span>
                </div>
              )}
              <p
                dir="rtl"
                className="text-[#1a1a1a] text-center"
                style={{ fontFamily: AR_FONT, fontSize: 'clamp(1.6rem, 6.5vw, 2.6rem)', lineHeight: 2 }}
              >
                {card.ar}
              </p>
            </div>
          </div>

          {/* Compteur (si l'invocation a un nombre de répétitions) */}
          {hasCounter && (
            <div className="flex-none px-5 pb-2 flex flex-col items-center gap-2">
              <button
                onClick={() => setCounted((c) => Math.min(card.count, c + 1))}
                className={`w-28 h-28 rounded-full flex flex-col items-center justify-center shadow-lg border-4 active:scale-95 transition-all ${
                  done
                    ? 'bg-[#2d5016] text-white border-[#c9a959]'
                    : 'bg-white text-[#2d5016] border-[#c9a959]'
                }`}
              >
                <span className="text-4xl font-bold tabular-nums leading-none">
                  {toArabicNumbers(counted)}
                </span>
                <span className="text-xs opacity-70 mt-1">/ {toArabicNumbers(card.count)}</span>
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCounted(0)}
                  className="text-xs font-bold text-[#7a3030] px-3 py-1 rounded-full border border-[#7a3030]/30"
                >
                  ↺ Réinitialiser
                </button>
                {done && <span className="text-sm font-bold text-[#2d5016]">✓ Terminé</span>}
                <span className="text-xs text-gray-400">Touche le cercle pour compter</span>
              </div>
            </div>
          )}

          {/* Actions bas de page */}
          <div className="flex-none px-4 py-3 border-t border-[#c9a959]/30 bg-[#fdfaf3] flex items-center gap-2">
            <button
              onClick={() => go(-1)}
              disabled={index === 0}
              className="px-3 py-2.5 rounded-xl text-sm font-bold border-2 border-[#c9a959]/40 text-[#2d5016] disabled:opacity-30 active:scale-95"
            >
              ‹ Préc.
            </button>
            <button
              onClick={() => setShowTrans(true)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold border-2 border-[#2d5016] text-[#2d5016] active:scale-95 flex items-center justify-center gap-1.5"
            >
              📖 Traduction
            </button>
            {index < total - 1 ? (
              <button
                onClick={() => go(1)}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold text-white active:scale-95 shadow-md ${
                  done || !hasCounter ? 'bg-[#2d5016] animate-none' : 'bg-[#4a7c23]'
                }`}
              >
                Suivant ›
              </button>
            ) : (
              <button
                onClick={() => setSession(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#2d5016] active:scale-95 shadow-md"
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
            className="relative bg-[#fdfaf3] rounded-t-2xl shadow-2xl border-t-2 border-[#c9a959] max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-none px-4 pt-3 pb-2 border-b border-[#c9a959]/40 flex items-center justify-between">
              <span className="text-sm font-bold text-[#2d5016]">Traduction</span>
              <button onClick={() => setShowTrans(false)} className="text-[#2d5016] text-lg leading-none px-2">
                ✕
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
              <p className="text-[15px] text-[#2d3a1a] leading-relaxed max-w-2xl mx-auto">{card.fr}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
