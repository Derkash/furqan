'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getRootOccurrences,
  describeMorphology,
  type RootOccurrence,
} from '@/utils/vocab/morphology';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import { useQuranUnits } from '@/hooks/exercises/useQuranUnits';
import { unitToPageRange } from '@/utils/exercises/rangeToPages';
import RangePicker, { type RangePickerValue } from '@/components/exercises/RangePicker';

interface Props {
  root: string;
  gloss?: string;
  /** Lemme du mot étudié : son groupe est mis en avant (même sens). */
  lemma?: string;
  onClose: () => void;
}

/** Explorateur : occurrences d'une racine sur une plage, REGROUPÉES PAR LEMME
 *  (une même racine peut couvrir plusieurs sens : فَتَاة « jeune fille » vs
 *   اِسْتَفْتَى « demander un avis » partagent ف‑ت‑ي mais pas le sens). */
export default function OccurrencesExplorer({ root, gloss, lemma, onClose }: Props) {
  const { data: units } = useQuranUnits();
  const [range, setRange] = useState<RangePickerValue>({ mode: 'juz', start: null, end: null });
  const [occ, setOcc] = useState<RootOccurrence[] | null>(null);
  const [loading, setLoading] = useState(false);

  const { startPage, endPage } = useMemo(
    () => unitToPageRange(range.mode, range.start, range.end, units),
    [range, units]
  );
  // Plage effective : la sélection, sinon tout le Coran.
  const start = startPage ?? 1;
  const end = endPage ?? 604;

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

  // Regroupement par LEMME (proxy déterministe du sens). Le lemme du mot étudié
  // passe en premier ; sinon ordre d'apparition dans le Mushaf.
  const groups = useMemo(() => {
    if (!occ) return [];
    const map = new Map<string, RootOccurrence[]>();
    for (const o of occ) {
      const key = o.morph?.lemma ?? '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    const arr = Array.from(map, ([lem, items]) => ({ lem, items }));
    arr.sort((a, b) => {
      if (lemma) {
        if (a.lem === lemma) return -1;
        if (b.lem === lemma) return 1;
      }
      return a.items[0].page - b.items[0].page;
    });
    return arr;
  }, [occ, lemma]);

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

          {/* Plage : page / hizb / juz / sourate (vide = tout le Coran) */}
          <div className="mt-3">
            <RangePicker value={range} onChange={setRange} chapters={units?.chapters ?? []} />
            <div className="flex items-center justify-between mt-2 text-xs">
              <span className="text-[#7a5d2c]">
                {startPage != null
                  ? `pages ${Math.min(startPage, endPage!)}–${Math.max(startPage, endPage!)}`
                  : 'tout le Coran'}
              </span>
              <span className="text-[#4a7c23] font-bold">
                {occ ? `${toArabicNumbers(occ.length)} apparition${occ.length > 1 ? 's' : ''}` : ''}
              </span>
            </div>
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

        {/* Liste groupée par lemme */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading && <p className="text-center text-gray-400 py-6 text-sm">Recherche…</p>}
          {!loading && occ?.length === 0 && (
            <p className="text-center text-gray-500 py-6 text-sm">
              Aucune occurrence sur cette plage.
            </p>
          )}
          {!loading && groups.length > 1 && (
            <p className="text-[11px] text-gray-400 italic">
              Regroupé par forme-mère (lemme) : une même racine peut couvrir plusieurs sens.
            </p>
          )}
          {!loading &&
            groups.map((g) => {
              const highlighted = lemma && g.lem === lemma;
              return (
                <div key={g.lem}>
                  {/* En-tête de lemme */}
                  <div
                    className={`flex items-baseline gap-2 mb-1.5 px-1 ${
                      highlighted ? '' : ''
                    }`}
                  >
                    <span
                      dir="rtl"
                      className={`font-bold ${highlighted ? 'text-[#2d5016]' : 'text-[#7a5d2c]'}`}
                      style={{ fontFamily: "'Amiri',serif", fontSize: '1.5em' }}
                    >
                      {g.lem}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {toArabicNumbers(g.items.length)} forme{g.items.length > 1 ? 's' : ''}
                    </span>
                    {highlighted && (
                      <span className="text-[10px] font-bold text-[#4a7c23] bg-[#4a7c23]/10 rounded-full px-2 py-0.5">
                        ton mot
                      </span>
                    )}
                  </div>
                  <div className={`space-y-2 ${highlighted ? 'ring-2 ring-[#c9a959]/40 rounded-2xl p-2' : ''}`}>
                    {g.items.map((o) => (
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
              );
            })}
        </div>
      </div>
    </div>
  );
}
