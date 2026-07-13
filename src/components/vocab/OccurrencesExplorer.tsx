'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getRootOccurrences,
  describeMorphology,
  type RootOccurrence,
} from '@/utils/vocab/morphology';
import { toArabicNumbers } from '@/utils/arabicNumbers';

interface Props {
  root: string;
  gloss?: string;
  onClose: () => void;
}

/** Explorateur : toutes les formes d'une racine sur une plage de pages. */
export default function OccurrencesExplorer({ root, gloss, onClose }: Props) {
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(604);
  const [occ, setOcc] = useState<RootOccurrence[] | null>(null);
  const [loading, setLoading] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRootOccurrences(root, start, end).then((res) => {
      if (cancelled) return;
      setOcc(res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [root, start, end]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Formes distinctes rencontrées (pour un aperçu des variations)
  const distinctForms = useMemo(() => {
    if (!occ) return [];
    const seen = new Set<string>();
    const forms: string[] = [];
    for (const o of occ) {
      const f = o.morph?.form;
      if (f && !seen.has(f)) {
        seen.add(f);
        forms.push(f);
      }
    }
    return forms;
  }, [occ]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="bg-[#fdfaf3] rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border-2 border-[#c9a959]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex-none p-4 border-b border-[#c9a959]/30">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959]">
                Occurrences de la racine
              </p>
              <p dir="rtl" className="text-2xl font-bold text-[#2d5016]" style={{ fontFamily: "'Amiri',serif" }}>
                {root.split('').join(' ')}
              </p>
              {gloss && <p className="text-sm text-gray-500">{gloss}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="w-8 h-8 rounded-full bg-[#2d5016]/10 text-[#2d5016] flex items-center justify-center hover:bg-[#2d5016]/20"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Plage de pages */}
          <div className="flex items-center gap-2 mt-3 text-sm">
            <span className="text-[#7a5d2c] font-semibold">Pages</span>
            <input
              type="number"
              min={1}
              max={604}
              value={start}
              onChange={(e) => setStart(Math.max(1, Math.min(604, Number(e.target.value) || 1)))}
              className="w-16 px-2 py-1 rounded-lg border-2 border-[#c9a959]/30 text-center font-bold text-[#2d5016]"
            />
            <span className="text-gray-400">→</span>
            <input
              type="number"
              min={1}
              max={604}
              value={end}
              onChange={(e) => setEnd(Math.max(1, Math.min(604, Number(e.target.value) || 604)))}
              className="w-16 px-2 py-1 rounded-lg border-2 border-[#c9a959]/30 text-center font-bold text-[#2d5016]"
            />
            <span className="ml-auto text-[#4a7c23] font-bold">
              {occ ? `${toArabicNumbers(occ.length)} occ.` : ''}
            </span>
          </div>

          {/* Formes distinctes */}
          {distinctForms.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-2">
              {distinctForms.slice(0, 12).map((f) => (
                <span
                  key={f}
                  dir="rtl"
                  className="text-[#2d5016] bg-white/70 border border-[#c9a959]/30 rounded-lg px-2 py-0.5"
                  style={{ fontFamily: "'Amiri',serif", fontSize: '1.2em' }}
                >
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && <p className="text-center text-gray-400 py-6 text-sm">Recherche…</p>}
          {!loading && occ?.length === 0 && (
            <p className="text-center text-gray-500 py-6 text-sm">
              Aucune occurrence sur cette plage.
            </p>
          )}
          {!loading &&
            occ?.map((o) => (
              <div key={o.location} className="bg-white/70 rounded-xl p-3 border border-[#c9a959]/20">
                <div className="flex items-baseline justify-between gap-2">
                  <span dir="rtl" className="text-[#2d5016]" style={{ fontFamily: "'Amiri',serif", fontSize: '1.7em' }}>
                    {o.morph?.form ?? ''}
                  </span>
                  <span className="text-[11px] text-[#7a5d2c] font-bold whitespace-nowrap">
                    {o.verseKey} · p.{toArabicNumbers(o.page)}
                  </span>
                </div>
                {o.morph && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    {describeMorphology(o.morph).slice(0, 3).join(' · ')}
                  </p>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
