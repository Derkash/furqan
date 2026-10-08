'use client';

// Étape 2 — « Mon objectif » (brief §2) : choisir le rythme, puis APERÇU du
// cycle jour par jour avec les pages réellement prévues et les dates estimées.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { SetupFrame } from '@/components/recitation/SetupSteps';
import { loadDraft, saveDraft, type ProgramDraft } from '@/lib/recitation/draft';
import { formatDateKey, juzAmountLabel, pagesLabel, surahSpanLabel } from '@/lib/recitation/labels';
import { perimeterPages } from '@/lib/recitation/perimeter';
import { REPEAT_DAYS_CHOICES, buildCycleDays, repeatCycleDays, rotateCycleDays } from '@/lib/recitation/planner';
import { addDays, cycleDayDates, toDateKey } from '@/lib/recitation/schedule';
import { learningPagesForDay, learningProgress } from '@/lib/recitation/learning';
import { loadProgram } from '@/lib/recitation/store';
import { JUZ_PER_DAY_AMOUNTS, type JuzPerDayAmount, type Objective } from '@/lib/recitation/types';

type PresetId = 'half-juz' | 'juz' | 'pages' | 'days';

// Rythmes en juz' entiers proposés sous le preset « juz' par jour » (1 à 5).
const JUZ_CHOICES = JUZ_PER_DAY_AMOUNTS.filter((a): a is JuzPerDayAmount => a >= 1);

const PRESETS: { id: PresetId; label: string; hint: string }[] = [
  { id: 'half-juz', label: 'Un demi-juz’ par jour', hint: 'Découpé aux frontières de hizb' },
  { id: 'juz', label: 'Des juz’ entiers par jour', hint: 'De 1 à 5 juz’ chaque jour' },
  { id: 'pages', label: 'Un nombre de pages par jour', hint: 'Vous choisissez la quantité' },
  { id: 'days', label: 'Terminer en un nombre de jours', hint: 'Répartition équilibrée' },
];

function toObjective(
  preset: PresetId,
  pagesPerDay: number,
  days: number,
  juzPerDay: JuzPerDayAmount
): Objective {
  switch (preset) {
    case 'half-juz':
      return { kind: 'juzPerDay', amount: 0.5 };
    case 'juz':
      return { kind: 'juzPerDay', amount: juzPerDay };
    case 'pages':
      return { kind: 'pagesPerDay', pages: pagesPerDay };
    case 'days':
      return { kind: 'totalDays', days };
  }
}

function fromObjective(obj: Objective | null): PresetId | null {
  if (!obj) return null;
  if (obj.kind === 'juzPerDay') return obj.amount === 0.5 ? 'half-juz' : 'juz';
  return obj.kind === 'pagesPerDay' ? 'pages' : 'days';
}

export default function ObjectifPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [preset, setPreset] = useState<PresetId | null>(null);
  const [pagesPerDay, setPagesPerDay] = useState(5);
  const [days, setDays] = useState(7);
  const [juzPerDay, setJuzPerDay] = useState<JuzPerDayAmount>(1);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const d = loadDraft();
    setDraft(d);
    setPreset(fromObjective(d.objective));
    if (d.objective?.kind === 'pagesPerDay') setPagesPerDay(d.objective.pages);
    if (d.objective?.kind === 'totalDays') setDays(d.objective.days);
    if (d.objective?.kind === 'juzPerDay' && d.objective.amount >= 1)
      setJuzPerDay(d.objective.amount);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const pages = useMemo(() => (draft ? perimeterPages(draft.selections) : []), [draft]);
  // La sourate en cours n'est PAS dans cet objectif : elle s'y ajoute chaque
  // jour, dans sa propre séance. Le dire ici évite de sous-estimer sa journée.
  const learning = useMemo(() => {
    const cfg = draft?.learning ?? loadProgram()?.learning ?? null;
    if (!cfg) return null;
    return { config: cfg, pages: learningPagesForDay(cfg, 0), progress: learningProgress(cfg) };
  }, [draft]);
  const objective = preset ? toObjective(preset, pagesPerDay, days, juzPerDay) : null;
  // Jours dans l'ordre du mushaf (pour le sélecteur de départ)…
  const baseDays = useMemo(
    () => (objective ? buildCycleDays(pages, objective) : []),
    [pages, objective]
  );
  // …puis pivotés sur le point de départ choisi et répétés (consolidation) :
  // c'est l'ordre réel du cycle.
  const repeat = draft?.repeatDays ?? 1;
  const cycleDays = useMemo(
    () => repeatCycleDays(rotateCycleDays(baseDays, draft?.startPage ?? null), draft?.repeatDays),
    [baseDays, draft]
  );
  const dates = useMemo(() => {
    if (!draft || !cycleDays.length) return [];
    return cycleDayDates(draft.schedule, toDateKey(new Date()), cycleDays.length);
  }, [draft, cycleDays]);

  if (!draft) return <AppShell><div /></AppShell>;

  const persist = (
    p: PresetId,
    nPages = pagesPerDay,
    nDays = days,
    nJuz: JuzPerDayAmount = juzPerDay
  ) => {
    setPreset(p);
    const next = { ...draft, objective: toObjective(p, nPages, nDays, nJuz) };
    setDraft(next);
    saveDraft(next);
  };

  const endDate = dates[dates.length - 1];
  const nextCycleStart = endDate ? addDays(endDate, 1) : null;

  return (
    <AppShell>
      <SetupFrame
        step={1}
        freeNav={draft.selections.length > 0 && !!draft.objective}
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
              {p.id === 'juz' && preset === 'juz' && (
                <span className="flex flex-wrap items-center gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                  {JUZ_CHOICES.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setJuzPerDay(n);
                        persist('juz', pagesPerDay, days, n);
                      }}
                      className={`min-w-[44px] rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                        juzPerDay === n
                          ? 'bg-[var(--ds-green)] text-white'
                          : 'bg-white border border-[var(--ds-divider)] text-[var(--ds-n700)] hover:border-[var(--ds-n400)]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="text-sm text-[var(--ds-n600)]">
                    juz’ par jour — {juzAmountLabel(juzPerDay)} chaque jour
                  </span>
                </span>
              )}
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

        {/* Point de départ du cycle : « je commence par le juz 3 » — les
            jours tournent, rien n'est sauté ni re-récité. */}
        {baseDays.length > 1 && (
          <section className="ds-card p-4 mt-4">
            <p className="text-sm font-extrabold mb-1.5">Commencer le cycle par…</p>
            <select
              value={draft.startPage ?? ''}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                const next = { ...draft, startPage: v };
                setDraft(next);
                saveDraft(next);
              }}
              className="w-full rounded-xl border border-[var(--ds-divider)] px-3 py-2.5 text-sm bg-white"
            >
              <option value="">Le début du périmètre (ordre du mushaf)</option>
              {baseDays.map((day, i) => (
                <option key={day.pages[0]} value={day.pages[0]}>
                  Jour {i + 1} · {pagesLabel(day.pages)} · {surahSpanLabel(day.pages)}
                </option>
              ))}
            </select>
            {draft.startPage != null && (
              <p className="text-[12px] text-[var(--ds-n600)] mt-2">
                Le cycle démarre là, va jusqu’à la fin du périmètre, puis boucle par le début —
                rien n’est sauté.
              </p>
            )}
          </section>
        )}

        {/* Consolidation : chaque portion revient n jours de suite avant
            d'avancer — J1 juz' 1-2, J2 juz' 1-2, J3 juz' 3-4… */}
        {baseDays.length > 0 && (
          <section className="ds-card p-4 mt-4">
            <p className="text-sm font-extrabold">Réciter chaque portion…</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {REPEAT_DAYS_CHOICES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    const next = { ...draft, repeatDays: n };
                    setDraft(next);
                    saveDraft(next);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                    repeat === n
                      ? 'bg-[var(--ds-green)] text-white'
                      : 'bg-white border border-[var(--ds-divider)] text-[var(--ds-n700)] hover:border-[var(--ds-n400)]'
                  }`}
                >
                  {n === 1 ? '1 jour' : `${n} jours de suite`}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-[var(--ds-n600)] mt-2">
              {repeat === 1
                ? 'On avance chaque jour sur la portion suivante.'
                : baseDays.length > 1
                  ? `Consolidation : ${pagesLabel(baseDays[0].pages)} ${repeat} jours de suite, puis ${pagesLabel(baseDays[1].pages)} ${repeat} jours, etc. — le cycle dure ${repeat} fois plus longtemps.`
                  : `Consolidation : la même portion ${repeat} jours de suite avant d’avancer.`}
            </p>
          </section>
        )}

        {/* La sourate en cours s'ajoute à cet objectif */}
        {learning?.progress && learning.pages.length > 0 && (
          <section className="rounded-[20px] border border-[var(--ds-gold)] bg-[var(--ds-gold-100)] p-4 mt-4">
            <p className="text-[13px] font-extrabold text-[var(--ds-gold-700)]">
              S’ajoute à cet objectif : {learning.progress.surahName}
            </p>
            <p className="text-[13px] text-[var(--ds-n700)] mt-0.5">
              {learning.pages.length} page{learning.pages.length > 1 ? 's' : ''} de plus chaque jour,
              dans une séance séparée —{' '}
              <Link href="/recitation/apprentissage" className="underline font-semibold">
                sourate en cours
              </Link>
              .
            </p>
          </section>
        )}

        {/* Aperçu du cycle */}
        {cycleDays.length > 0 && (
          <section className="ds-card p-5 mt-4">
            <h2 className="text-base font-extrabold mb-3">
              Aperçu — cycle de {cycleDays.length} jour{cycleDays.length > 1 ? 's' : ''}
              {learning?.pages.length ? ' (révision seule)' : ''}
            </h2>
            <div className="flex flex-col divide-y divide-[var(--ds-divider)] max-h-[300px] overflow-y-auto">
              {cycleDays.map((day, i) => (
                <div key={day.index} className="py-2.5 flex items-baseline gap-3">
                  <span className="flex-none w-14 text-[13px] font-extrabold text-[var(--ds-gold-700)]">
                    Jour {i + 1}
                  </span>
                  <span className="text-sm font-semibold flex-1">
                    {pagesLabel(day.pages)}
                    {repeat > 1 && i % repeat > 0 && (
                      <span className="text-[var(--ds-n500)] font-normal"> · {(i % repeat) + 1}ᵉ passage</span>
                    )}
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
