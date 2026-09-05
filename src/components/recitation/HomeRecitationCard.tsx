'use client';

// Carte de synthèse sur l'ACCUEIL (brief §11) : l'accueil actuel est conservé,
// cette carte s'y ajoute. Récitation en cours → progression + Continuer ;
// sinon → prochaine session. Masquée tant qu'aucun programme n'existe.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ensureToday } from '@/lib/recitation/dayEngine';
import { pagesLabel } from '@/lib/recitation/labels';
import { currentSlot, formatTime, nextSlot } from '@/lib/recitation/schedule';

interface CardState {
  mode: 'active' | 'upcoming';
  slotLabel: string;
  done: number;
  total: number;
  pages: string;
  endMin: number;
}

export default function HomeRecitationCard() {
  const [state, setState] = useState<CardState | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const now = new Date();
    const ctx = ensureToday(now);
    if (!ctx?.dayState) return;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const active = currentSlot(ctx.dayState.slots, nowMin);
    const upcoming = nextSlot(ctx.dayState.slots, nowMin);
    const ref = active ?? upcoming;
    if (!ref) return;
    const slot = ctx.dayState.slots.find((s) => s.startMin === ref.startMin);
    if (!slot || !slot.pages.length) return;
    const recited = new Set(ctx.dayState.recitedPages);
    setState({
      mode: active ? 'active' : 'upcoming',
      slotLabel: active
        ? `${formatTime(slot.startMin)} – ${formatTime(slot.endMin)}`
        : formatTime(slot.startMin),
      done: slot.pages.filter((p) => recited.has(p)).length,
      total: slot.pages.length,
      pages: pagesLabel(slot.pages),
      endMin: slot.endMin,
    });
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!state) return null;

  return (
    <Link
      href="/recitation/en-cours"
      className="block rounded-[24px] p-5 md:p-6 text-white mb-8 transition-transform active:scale-[0.99]"
      style={{ background: 'var(--ds-green-deep)', boxShadow: 'var(--ds-shadow-md)' }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="ds-kicker" style={{ color: 'var(--ds-gold-100)' }}>
            {state.mode === 'active' ? 'Récitation en cours' : 'Prochaine récitation'}
          </p>
          {state.mode === 'active' ? (
            <>
              <p className="text-xl md:text-2xl font-extrabold mt-0.5">
                {state.done} / {state.total} pages récitées
              </p>
              <p className="text-sm text-white/80 mt-0.5">
                {state.pages} · jusqu’à {formatTime(state.endMin)}
              </p>
            </>
          ) : (
            <p className="text-xl md:text-2xl font-extrabold mt-0.5">
              À {state.slotLabel} — {state.pages.toLowerCase()}
            </p>
          )}
        </div>
        <div className="flex-none flex items-center gap-3">
          {state.mode === 'active' && (
            <div className="hidden sm:flex gap-1">
              {Array.from({ length: state.total }, (_, i) => (
                <span
                  key={i}
                  className={`w-6 h-1.5 rounded-full ${i < state.done ? 'bg-[var(--ds-gold)]' : 'bg-white/25'}`}
                />
              ))}
            </div>
          )}
          <span className="ds-btn-gold px-5 py-2.5 text-sm whitespace-nowrap">
            {state.mode === 'active' ? 'Continuer' : 'Voir'}
          </span>
        </div>
      </div>
    </Link>
  );
}
