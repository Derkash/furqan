'use client';

// Feuille d'évaluation d'une page après récitation (brief §8) : quatre niveaux
// gradués, note facultative, « évaluer plus tard ». Simple, rapide, jamais
// culpabilisant — la couleur est toujours accompagnée d'un libellé.

import { useState } from 'react';
import { MASTERY_LABELS } from '@/lib/recitation/mastery';
import type { MasteryLevel } from '@/lib/recitation/types';

const LEVELS: { level: MasteryLevel; hint: string; dot: string }[] = [
  { level: 'maitrisee', hint: 'Récitation fluide, sans blocage significatif.', dot: '#2d5a47' },
  { level: 'plutot-maitrisee', hint: 'Quelques hésitations, globalement correcte.', dot: '#538271' },
  { level: 'fragile', hint: 'Plusieurs hésitations — à revoir prochainement.', dot: '#c5a059' },
  { level: 'a-retravailler', hint: 'Difficile — renforcement rapproché.', dot: '#b3542e' },
];

export default function EvaluationSheet({
  page,
  onEvaluate,
  onSkip,
}: {
  page: number;
  onEvaluate: (level: MasteryLevel, note?: string) => void;
  onSkip: () => void;
}) {
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<MasteryLevel | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" role="dialog" aria-modal>
      <button
        type="button"
        aria-label="Évaluer plus tard"
        className="absolute inset-0 bg-black/35"
        onClick={onSkip}
      />
      <div className="relative w-full md:max-w-md bg-white rounded-t-[28px] md:rounded-[28px] p-6 shadow-[var(--ds-shadow-lg)]">
        <p className="ds-kicker">Page {page} récitée</p>
        <h2 className="text-xl font-extrabold text-[var(--ds-green)] mt-1">
          Comment s&rsquo;est passée cette page ?
        </h2>

        <div className="flex flex-col gap-2 mt-4">
          {LEVELS.map(({ level, hint, dot }) => (
            <button
              key={level}
              type="button"
              onClick={() => setSelected(level)}
              className={`text-left rounded-2xl border px-4 py-3 transition-colors ${
                selected === level
                  ? 'border-[var(--ds-gold)] bg-[var(--ds-gold-100)]'
                  : 'border-[var(--ds-divider)] hover:border-[var(--ds-n400)]'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full flex-none" style={{ background: dot }} />
                <span className="font-bold text-[15px]">{MASTERY_LABELS[level]}</span>
              </span>
              <span className="block text-[13px] text-[var(--ds-n600)] mt-0.5 ml-[22px]">{hint}</span>
            </button>
          ))}
        </div>

        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (facultatif) — ex. « hésitation au verset 12 »"
          className="w-full mt-3 rounded-xl border border-[var(--ds-divider)] px-4 py-2.5 text-sm outline-none focus:border-[var(--ds-gold)]"
        />

        <div className="flex items-center gap-2.5 mt-4">
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onEvaluate(selected, note.trim() || undefined)}
            className="ds-btn-gold px-6 py-2.5 text-sm flex-1 disabled:opacity-40"
          >
            Valider
          </button>
          <button type="button" onClick={onSkip} className="ds-btn-ghost px-5 py-2.5 text-sm">
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
}
