'use client';

// Étape 2 — « Mon objectif » (brief §2) : choisir le rythme, puis APERÇU du
// cycle jour par jour avec les pages réellement prévues et les dates estimées.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { SetupFrame } from '@/components/recitation/SetupSteps';
import { loadDraft, saveDraft, type ProgramDraft } from '@/lib/recitation/draft';
import { formatDateKey, pagesLabel, surahSpanLabel } from '@/lib/recitation/labels';
import { perimeterPages } from '@/lib/recitation/perimeter';
import { buildCycleDays } from '@/lib/recitation/planner';
import { addDays, cycleDayDates, toDateKey } from '@/lib/recitation/schedule';
import type { Objective } from '@/lib/recitation/types';

type PresetId = 'half-juz' | 'one-juz' | 'two-juz' | 'pages' | 'days';

const PRESETS: { id: PresetId; label: string; hint: string }[] = [
  { id: 'half-juz', label: 'Un demi-juz’ par jour', hint: 'Découpé aux frontières de hizb' },
  { id: 'one-juz', label: 'Un juz’ par jour', hint: 'Un juz’ entier chaque jour' },
  { id: 'two-juz', label: 'Deux juz’ par jour', hint: 'Rythme soutenu' },
  { id: 'pages', label: 'Un nombre de pages par jour', hint: 'Vous choisissez la quantité' },
  { id: 'days', label: 'Terminer en un nombre de jours', hint: 'Répartition équilibrée' },
];

function toObjective(preset: PresetId, pagesPerDay: number, days: number): Objective {
  switch (preset) {
    case 'half-juz':
      return { kind: 'juzPerDay', amount: 0.5 };
    case 'one-juz':
      return { kind: 'juzPerDay', amount: 1 };
    case 'two-juz':
      return { kind: 'juzPerDay', amount: 2 };
    case 'pages':
      return { kind: 'pagesPerDay', pages: pagesPerDay };
    case 'days':
      return { kind: 'totalDays', days };
  }
}

function fromObjective(obj: Objective | null): PresetId | null {
  if (!obj) return null;
  if (obj.kind === 'juzPerDay') return obj.amount === 0.5 ? 'half-juz' : obj.amount === 1 ? 'one-juz' : 'two-juz';
  return obj.kind === 'pagesPerDay' ? 'pages' : 'days';
}

export default function ObjectifPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [preset, setPreset] = useState<PresetId | null>(null);
  const [pagesPerDay, setPagesPerDay] = useState(5);
  const [days, setDays] = useState(7);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const d = loadDraft();
    setDraft(d);
    setPreset(fromObjective(d.objective));
    if (d.objective?.kind === 'pagesPerDay') setPagesPerDay(d.objective.pages);
    if (d.objective?.kind === 'totalDays') setDays(d.objective.days);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const pages = useMemo(() => (draft ? perimeterPages(draft.selections) : []), [draft]);
  const objective = preset ? toObjective(preset, pagesPerDay, days) : null;
  const cycleDays = useMemo(
    () => (objective ? buildCycleDays(pages, objective) : []),
    [pages, objective]
  );
  const dates = useMemo(() => {
    if (!draft || !cycleDays.length) return [];
    return cycleDayDates(draft.schedule, toDateKey(new Date()), cycleDays.length);
  }, [draft, cycleDays]);

  if (!draft) return <AppShell><div /></AppShell>;

  const persist = (p: PresetId, nPages = pagesPerDay, nDays = days) => {
    setPreset(p);
    const next = { ...draft, objective: toObjective(p, nPages, nDays) };
    setDraft(next);
    saveDraft(next);
  };

  const endDate = dates[dates.length - 1];
  const nextCycleStart = endDate ? addDays(endDate, 1) : null;

  return (
    <AppShell>
      <SetupFrame
        step={1}
        title="Mon objectif"
        subtitle={`${pages.length} pages mémorisées — choisissez votre rythme de récitation.`}
        canContinue={!!objective && cycleDays.length > 0}
        onContinue={() => router.push('/recitation/horaires')}
      >
        <div className="flex flex-col gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => persist(p.id)}
              className={`text-left rounded-2xl border px-4 py-3 transition-colors ${
                preset === p.id
                  ? 'border-[var(--ds-gold)] bg-[var(--ds-gold-100)]'
                  : 'border-[var(--ds-divider)] bg-white hover:border-[var(--ds-n400)]'
              }`}
            >
              <span className="font-bold text-[15px]">{p.label}</span>
              <span className="block text-[13px] text-[var(--ds-n600)] mt-0.5">{p.hint}</span>
              {p.id === 'pages' && preset === 'pages' && (
                <span className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={pagesPerDay}
                    onChange={(e) => {
                      const v = Math.max(1, Number(e.target.value) || 1);
                      setPagesPerDay(v);
                      persist('pages', v, days);
                    }}
                    className="w-20 rounded-lg border border-[var(--ds-divider)] px-2.5 py-1.5 text-sm"
                  />
                  <span className="text-sm text-[var(--ds-n600)]">pages par jour</span>
                </span>
              )}
              {p.id === 'days' && preset === 'days' && (
                <span className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={days}
                    onChange={(e) => {
                      const v = Math.max(1, Number(e.target.value) || 1);
                      setDays(v);
                      persist('days', pagesPerDay, v);
                    }}
                    className="w-20 rounded-lg border border-[var(--ds-divider)] px-2.5 py-1.5 text-sm"
                  />
                  <span className="text-sm text-[var(--ds-n600)]">jours pour tout réciter</span>
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Aperçu du cycle */}
        {cycleDays.length > 0 && (
          <section className="ds-card p-5 mt-4">
            <h2 className="text-base font-extrabold mb-3">
              Aperçu — cycle de {cycleDays.length} jour{cycleDays.length > 1 ? 's' : ''}
            </h2>
            <div className="flex flex-col divide-y divide-[var(--ds-divider)] max-h-[300px] overflow-y-auto">
              {cycleDays.map((day, i) => (
                <div key={day.index} className="py-2.5 flex items-baseline gap-3">
                  <span className="flex-none w-14 text-[13px] font-extrabold text-[var(--ds-gold-700)]">
                    Jour {i + 1}
                  </span>
                  <span className="text-sm font-semibold flex-1">
                    {pagesLabel(day.pages)}
                    <span className="text-[var(--ds-n500)] font-normal"> · {day.pages.length} p.</span>
                  </span>
                  <span className="text-xs text-[var(--ds-n500)] text-right hidden sm:block">
                    {surahSpanLabel(day.pages)}
                  </span>
                  {dates[i] && (
                    <span className="text-xs text-[var(--ds-n500)] flex-none w-24 text-right">
                      {formatDateKey(dates[i]).replace(/^\w+ /, '')}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {endDate && (
              <p className="text-[13px] text-[var(--ds-n600)] mt-3 pt-3 border-t border-[var(--ds-divider)]">
                Fin de cycle estimée : <strong>{formatDateKey(endDate)}</strong>
                {nextCycleStart && (
                  <> · prochain cycle à partir du {formatDateKey(nextCycleStart)}</>
                )}
              </p>
            )}
          </section>
        )}
      </SetupFrame>
    </AppShell>
  );
}
