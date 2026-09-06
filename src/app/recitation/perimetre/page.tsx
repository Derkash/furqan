'use client';

// Étape 1 — « Ce que je connais » (brief §1) : déclarer le périmètre mémorisé
// par plage de sourates, sourates entières, juz', plage de pages ou pages à
// l'unité. Les sélections se cumulent ; chaque page n'est comptée qu'une fois.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { SetupFrame } from '@/components/recitation/SetupSteps';
import { loadDraft, saveDraft, type ProgramDraft } from '@/lib/recitation/draft';
import { pageRefLabel } from '@/lib/recitation/labels';
import { perimeterPages, perimeterSummary } from '@/lib/recitation/perimeter';
import { buildCycleDays } from '@/lib/recitation/planner';
import { SURAH_PAGES } from '@/utils/exercises/surahPages';
import type { MemorizedSelection } from '@/lib/recitation/types';

type Tab = 'surah-range' | 'surah' | 'juz' | 'page';

const TABS: { id: Tab; label: string }[] = [
  { id: 'surah-range', label: 'Plage de sourates' },
  { id: 'surah', label: 'Sourates' },
  { id: 'juz', label: 'Juz’' },
  { id: 'page', label: 'Pages' },
];

function selectionLabel(sel: MemorizedSelection): string {
  switch (sel.kind) {
    case 'surah-range': {
      const a = SURAH_PAGES[sel.fromSurah]?.nameSimple ?? sel.fromSurah;
      const b = SURAH_PAGES[sel.toSurah]?.nameSimple ?? sel.toSurah;
      return `Sourates ${a} → ${b}`;
    }
    case 'surah':
      return `Sourate ${SURAH_PAGES[sel.surah]?.nameSimple ?? sel.surah}`;
    case 'juz':
      return `Juz’ ${sel.juz}`;
    case 'page-range':
      return `Pages ${sel.fromPage} à ${sel.toPage}`;
    case 'page':
      return `Page ${sel.page}`;
  }
}

export default function PerimetrePage() {
  const router = useRouter();
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [tab, setTab] = useState<Tab>('surah-range');
  const [fromSurah, setFromSurah] = useState(1);
  const [toSurah, setToSurah] = useState(2);
  const [surahSearch, setSurahSearch] = useState('');
  const [fromPage, setFromPage] = useState('');
  const [toPage, setToPage] = useState('');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => setDraft(loadDraft()), []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const update = (next: ProgramDraft) => {
    setDraft(next);
    saveDraft(next);
  };

  const addSelection = (sel: MemorizedSelection) => {
    if (!draft) return;
    update({ ...draft, selections: [...draft.selections, sel] });
  };
  const removeSelection = (index: number) => {
    if (!draft) return;
    update({ ...draft, selections: draft.selections.filter((_, i) => i !== index) });
  };
  const toggleUnit = (sel: MemorizedSelection, present: number) => {
    if (!draft) return;
    if (present >= 0) removeSelection(present);
    else addSelection(sel);
  };

  const pages = useMemo(() => (draft ? perimeterPages(draft.selections) : []), [draft]);
  const summary = useMemo(() => perimeterSummary(pages), [pages]);
  const cycleLen = useMemo(
    () => (draft?.objective ? buildCycleDays(pages, draft.objective).length : null),
    [draft, pages]
  );

  const filteredSurahs = useMemo(() => {
    const q = surahSearch.trim().toLowerCase();
    const list = Array.from({ length: 114 }, (_, i) => i + 1);
    if (!q) return list;
    return list.filter((s) => {
      const info = SURAH_PAGES[s];
      return String(s) === q || info?.nameSimple.toLowerCase().includes(q);
    });
  }, [surahSearch]);

  if (!draft) return <AppShell><div /></AppShell>;

  const juzSelected = (j: number) => draft.selections.findIndex((s) => s.kind === 'juz' && s.juz === j);
  const surahSelected = (s: number) => draft.selections.findIndex((x) => x.kind === 'surah' && x.surah === s);

  return (
    <AppShell>
      <SetupFrame
        step={0}
        title="Ce que je connais"
        subtitle="Déclarez ce que vous avez mémorisé — combinez librement sourates, juz’ et pages."
        canContinue={pages.length > 0}
        onContinue={() => router.push('/recitation/objectif')}
      >
        {/* Sélections actives */}
        {draft.selections.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {draft.selections.map((sel, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-sage-100)] text-[var(--ds-green)] px-3.5 py-1.5 text-[13px] font-bold"
              >
                {selectionLabel(sel)}
                <button
                  type="button"
                  aria-label="Retirer"
                  onClick={() => removeSelection(i)}
                  className="text-[var(--ds-n500)] hover:text-[var(--ds-green)] font-extrabold"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Onglets de méthode */}
        <div className="flex gap-1.5 mb-3 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-full text-[13px] font-bold whitespace-nowrap transition-colors ${
                tab === t.id ? 'bg-[var(--ds-green)] text-white' : 'ds-card text-[var(--ds-n600)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="ds-card p-4 md:p-5">
          {tab === 'surah-range' && (
            <div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'De la sourate…', value: fromSurah, set: setFromSurah },
                  { label: 'Jusqu’à la sourate…', value: toSurah, set: setToSurah },
                ].map((f) => (
                  <label key={f.label} className="block">
                    <span className="text-xs font-bold text-[var(--ds-n600)]">{f.label}</span>
                    <select
                      value={f.value}
                      onChange={(e) => f.set(Number(e.target.value))}
                      className="mt-1 w-full rounded-xl border border-[var(--ds-divider)] px-3 py-2.5 text-sm bg-white"
                    >
                      {Array.from({ length: 114 }, (_, i) => i + 1).map((s) => (
                        <option key={s} value={s}>
                          {s}. {SURAH_PAGES[s]?.nameSimple}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => addSelection({ kind: 'surah-range', fromSurah, toSurah })}
                className="ds-btn-gold px-5 py-2.5 text-sm mt-3.5"
              >
                Ajouter cette plage
              </button>
            </div>
          )}

          {tab === 'surah' && (
            <div>
              <input
                type="search"
                value={surahSearch}
                onChange={(e) => setSurahSearch(e.target.value)}
                placeholder="Rechercher par nom ou numéro…"
                className="w-full rounded-xl border border-[var(--ds-divider)] px-4 py-2.5 text-sm mb-3 outline-none focus:border-[var(--ds-gold)]"
              />
              <div className="max-h-[320px] overflow-y-auto flex flex-col divide-y divide-[var(--ds-divider)]">
                {filteredSurahs.map((s) => {
                  const idx = surahSelected(s);
                  const info = SURAH_PAGES[s];
                  return (
                    <label key={s} className="flex items-center gap-3 py-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={idx >= 0}
                        onChange={() => toggleUnit({ kind: 'surah', surah: s }, idx)}
                        className="w-4.5 h-4.5 accent-[var(--ds-gold)]"
                      />
                      <span className="text-sm font-semibold flex-1">
                        {s}. {info?.nameSimple}
                      </span>
                      <span dir="rtl" className="text-[15px] text-[var(--ds-n600)]" style={{ fontFamily: "'Amiri','Scheherazade New',serif" }}>
                        {info?.nameArabic}
                      </span>
                      <span className="text-xs text-[var(--ds-n500)] w-20 text-right">
                        p. {info?.startPage}–{info?.endPage}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'juz' && (
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
              {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => {
                const idx = juzSelected(j);
                return (
                  <button
                    key={j}
                    type="button"
                    onClick={() => toggleUnit({ kind: 'juz', juz: j }, idx)}
                    className={`rounded-xl py-2.5 text-sm font-bold transition-colors ${
                      idx >= 0
                        ? 'bg-[var(--ds-gold)] text-white'
                        : 'border border-[var(--ds-divider)] text-[var(--ds-n700)] hover:border-[var(--ds-gold)]'
                    }`}
                  >
                    {j}
                  </button>
                );
              })}
            </div>
          )}

          {tab === 'page' && (
            <div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-bold text-[var(--ds-n600)]">De la page…</span>
                  <input
                    type="number"
                    min={1}
                    max={604}
                    value={fromPage}
                    onChange={(e) => setFromPage(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--ds-divider)] px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-[var(--ds-n600)]">Jusqu’à la page…</span>
                  <input
                    type="number"
                    min={1}
                    max={604}
                    value={toPage}
                    onChange={(e) => setToPage(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--ds-divider)] px-3 py-2.5 text-sm"
                  />
                </label>
              </div>
              <p className="text-xs text-[var(--ds-n500)] mt-2">
                Une seule page ? Laissez la seconde case vide. Les recouvrements avec d’autres
                sélections sont comptés une seule fois.
              </p>
              <button
                type="button"
                onClick={() => {
                  const a = Number(fromPage);
                  const b = toPage ? Number(toPage) : a;
                  if (!a || a < 1 || a > 604 || b < 1 || b > 604) return;
                  addSelection(a === b ? { kind: 'page', page: a } : { kind: 'page-range', fromPage: a, toPage: b });
                  setFromPage('');
                  setToPage('');
                }}
                className="ds-btn-gold px-5 py-2.5 text-sm mt-3"
              >
                Ajouter ces pages
              </button>
            </div>
          )}
        </div>

        {/* Résumé */}
        <div
          className="rounded-[20px] p-5 mt-4 text-white"
          style={{ background: 'var(--ds-green)', boxShadow: 'var(--ds-shadow-md)' }}
        >
          <p className="ds-kicker" style={{ color: 'var(--ds-gold-100)' }}>
            Votre périmètre
          </p>
          {pages.length ? (
            <div className="mt-1.5 text-sm leading-relaxed">
              <p className="text-xl font-extrabold">
                {summary.totalPages} page{summary.totalPages > 1 ? 's' : ''} mémorisée{summary.totalPages > 1 ? 's' : ''}
              </p>
              <p className="text-white/85 mt-1">
                {pageRefLabel(summary.firstPage!)} → {pageRefLabel(summary.lastPage!)} · {summary.surahs.length} sourate{summary.surahs.length > 1 ? 's' : ''} ·{' '}
                {summary.juzs.length} juz’ touché{summary.juzs.length > 1 ? 's' : ''}
                {summary.completeJuzs.length > 0 && ` (dont ${summary.completeJuzs.length} complet${summary.completeJuzs.length > 1 ? 's' : ''})`}
              </p>
              {cycleLen != null && (
                <p className="text-white/85">
                  Au rythme choisi : un cycle complet en {cycleLen} jour{cycleLen > 1 ? 's' : ''}.
                </p>
              )}
            </div>
          ) : (
            <p className="text-white/80 text-sm mt-1">Ajoutez au moins une sélection pour continuer.</p>
          )}
        </div>
      </SetupFrame>
    </AppShell>
  );
}
