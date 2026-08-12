'use client';

import { useState } from 'react';
import SwipeReview from './SwipeReview';
import ReviewSession from './ReviewSession';

type Sub = 'swipe' | 'guess';

/** Onglet Révision : « Parcourir » (swipe, sens visible) par défaut, et
 *  « Deviner » (flashcards) gardé à côté. */
export default function ReviewTab({ onEmpty }: { onEmpty?: () => void }) {
  const [sub, setSub] = useState<Sub>('swipe');

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-none flex justify-center gap-1 py-1.5 bg-[var(--ds-bg)] border-b border-[var(--ds-gold)]/20">
        {([
          { id: 'swipe', label: '🃏 Parcourir' },
          { id: 'guess', label: '❓ Deviner' },
        ] as { id: Sub; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
              sub === t.id ? 'bg-[var(--ds-green)] text-white' : 'text-[var(--ds-sage)] hover:bg-[var(--ds-gold)]/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'swipe' ? <SwipeReview onEmpty={onEmpty} /> : <ReviewSession onEmpty={onEmpty} />}
    </div>
  );
}
