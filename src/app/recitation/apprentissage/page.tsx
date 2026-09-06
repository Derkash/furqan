'use client';

// « Sourate en cours » — le lâhiq : la sourate qu'on est en train de mémoriser,
// à réciter chaque jour depuis son début jusqu'à la page atteinte, dans une
// séance dédiée qui ne se mélange jamais au cycle de révision.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { formatTime, parseTime } from '@/lib/recitation/schedule';
import { pageRefLabel, pagesLabel } from '@/lib/recitation/labels';
import {
  LEARNING_MIN_PER_PAGE,
  buildLearningSlot,
  isVolumeHeavy,
  learningPagesForDay,
  learningDayIndex,
  learningProgress,
  learningSpan,
  nextSurah,
} from '@/lib/recitation/learning';
import { loadProgram, saveProgram } from '@/lib/recitation/store';
import { dailyLoad, learningOverlapsCycle, rebuildToday } from '@/lib/recitation/dayEngine';
import { refreshRecitationNative } from '@/lib/recitation/appSync';
import { toDateKey } from '@/lib/recitation/schedule';
import { SURAH_PAGES } from '@/utils/exercises/surahPages';
import type { LearningConfig, Program } from '@/lib/recitation/types';

const PLACEMENTS: { v: LearningConfig['placement']; label: string; hint: string }[] = [
  { v: 'end', label: 'En fin de journée', hint: 'Après la dernière séance de révision — la séparation est nette.' },
  { v: 'start', label: 'En début de journée', hint: 'Avant la révision, l’esprit frais : la mémorisation récente est la plus fragile.' },
  { v: 'custom', label: 'À une heure précise', hint: 'Vous choisissez le moment.' },
];

export default function ApprentissagePage() {
  const [program, setProgram] = useState<Program | null>(null);
  const [config, setConfig] = useState<LearningConfig | null>(null);
  const [search, setSearch] = useState('');
  // Date figée au montage : le rendu reste pur (pas de Date.now() en rendu).
  const [today] = useState(() => new Date());
  const [load, setLoad] = useState(() => dailyLoad(null));
  const [overlap, setOverlap] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const p = loadProgram();
    setProgram(p);
    setConfig(p?.learning ?? null);
    const ctx = rebuildToday(new Date());
    setLoad(dailyLoad(ctx?.dayState ?? null));
    setOverlap(learningOverlapsCycle(ctx?.dayState ?? null));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const persist = (next: LearningConfig | null) => {
    if (!program) return;
    setConfig(next);
    const updated: Program = { ...program, learning: next, updatedAt: new Date().toISOString() };
    setProgram(updated);
    saveProgram(updated);
    // Reconstruire la journée SANS perdre ce qui a déjà été récité aujourd'hui.
    const ctx = rebuildToday(new Date());
    setLoad(dailyLoad(ctx?.dayState ?? null));
    setOverlap(learningOverlapsCycle(ctx?.dayState ?? null));
    refreshRecitationNative(new Date());
  };

  const progress = useMemo(() => (config ? learningProgress(config) : null), [config]);
  const todayPages = useMemo(
    () =>
      config && program
        ? learningPagesForDay(config, learningDayIndex(program.createdAt, toDateKey(today)))
        : [],
    [config, program, today]
  );
  const slot = useMemo(
    () => (config && program ? buildLearningSlot(config, program.schedule, program.createdAt, toDateKey(today)) : null),
    [config, program, today]
  );
  const span = config ? learningSpan(config) : [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = Array.from({ length: 114 }, (_, i) => i + 1);
    if (!q) return list;
    return list.filter((s) => String(s) === q || SURAH_PAGES[s]?.nameSimple.toLowerCase().includes(q));
  }, [search]);

  if (!program) {
    return (
      <AppShell>
        <h1 className="ds-title text-3xl">Sourate en cours</h1>
        <p className="text-[var(--ds-n600)] mt-2">Créez d’abord votre programme de récitation.</p>
        <Link href="/recitation" className="ds-btn-gold inline-block px-6 py-2.5 text-sm mt-4">Mon programme</Link>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="flex items-center gap-3 mb-5">
        <Link href="/recitation" aria-label="Retour" className="text-2xl text-[var(--ds-n600)] hover:text-[var(--ds-green)]">←</Link>
        <div>
          <p className="ds-kicker">Consolidation quotidienne</p>
          <h1 className="ds-title text-2xl md:text-3xl">Sourate en cours</h1>
        </div>
      </header>

      <div className="max-w-[680px] flex flex-col gap-4 pb-10">
        <p className="text-[var(--ds-n600)] leading-relaxed">
          La sourate que vous mémorisez en ce moment se récite <strong>en entier chaque jour</strong>,
          depuis son début jusqu’à la page atteinte — dans une séance à part, jamais mêlée à la
          révision du cycle.
        </p>

        {!config ? (
          <section className="ds-card p-5">
            <p className="text-sm font-extrabold mb-3">Quelle sourate mémorisez-vous ?</p>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom ou numéro…"
              className="w-full rounded-xl border border-[var(--ds-divider)] px-4 py-2.5 text-sm mb-3 outline-none focus:border-[var(--ds-gold)]"
            />
            <div className="max-h-[340px] overflow-y-auto flex flex-col divide-y divide-[var(--ds-divider)]">
              {filtered.map((s) => {
                const info = SURAH_PAGES[s];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      persist({ surah: s, currentPage: info.startPage, placement: 'end', dailyCap: null })
                    }
                    className="flex items-center gap-3 py-2.5 text-left hover:bg-[var(--ds-sage-100)] rounded-lg px-2"
                  >
                    <span className="text-sm font-semibold flex-1">{s}. {info?.nameSimple}</span>
                    <span dir="rtl" className="text-[15px] text-[var(--ds-n600)]" style={{ fontFamily: "'Amiri','Scheherazade New',serif" }}>
                      {info?.nameArabic}
                    </span>
                    <span className="text-xs text-[var(--ds-n500)] w-16 text-right">
                      {info.endPage - info.startPage + 1} p.
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <>
            {/* Progression dans la sourate */}
            {progress && (
              <section className="rounded-[20px] p-5 text-white" style={{ background: 'var(--ds-green)', boxShadow: 'var(--ds-shadow-md)' }}>
                <p className="ds-kicker" style={{ color: 'var(--ds-gold-100)' }}>
                  Sourate {String(config.surah).padStart(2, '0')}
                </p>
                <p className="text-2xl font-extrabold mt-0.5">{progress.surahName}</p>
                <p className="text-sm text-white/85 mt-1">
                  Mémorisé jusqu’à {pageRefLabel(progress.currentPage, config.surah)} —{' '}
                  {progress.done} page{progress.done > 1 ? 's' : ''} sur {progress.total}
                </p>
                <div className="h-2 rounded-full bg-white/20 mt-3 overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--ds-gold)]" style={{ width: `${progress.percent}%` }} />
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <button
                    type="button"
                    disabled={progress.complete}
                    onClick={() => persist({ ...config, currentPage: config.currentPage + 1 })}
                    className="ds-btn-gold px-4 py-2 text-[13px] disabled:opacity-40"
                  >
                    J’ai mémorisé une page de plus
                  </button>
                  {progress.currentPage > progress.startPage && (
                    <button
                      type="button"
                      onClick={() => persist({ ...config, currentPage: config.currentPage - 1 })}
                      className="rounded-full bg-white/15 px-4 py-2 text-[13px] font-bold hover:bg-white/25 transition-colors"
                    >
                      Reculer d’une page
                    </button>
                  )}
                </div>
                {progress.complete && (
                  <div className="rounded-2xl bg-white/12 p-3.5 mt-3">
                    <p className="text-sm font-bold">Sourate terminée — qu’Allah accepte.</p>
                    <p className="text-[13px] text-white/85 mt-0.5">
                      Ajoutez-la à votre périmètre mémorisé pour qu’elle entre dans le cycle de révision,
                      puis passez à la suivante.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {nextSurah(config.surah) && (
                        <button
                          type="button"
                          onClick={() => {
                            const ns = nextSurah(config.surah)!;
                            const info = SURAH_PAGES[ns];
                            const withSurah: Program = {
                              ...program,
                              selections: [...program.selections, { kind: 'surah', surah: config.surah }],
                              learning: { ...config, surah: ns, currentPage: info.startPage },
                              updatedAt: new Date().toISOString(),
                            };
                            saveProgram(withSurah);
                            setProgram(withSurah);
                            setConfig(withSurah.learning);
                            rebuildToday(new Date());
                            refreshRecitationNative(new Date());
                          }}
                          className="ds-btn-gold px-4 py-2 text-[13px]"
                        >
                          Passer à {SURAH_PAGES[nextSurah(config.surah)!]?.nameSimple}
                        </button>
                      )}
                      <Link href="/recitation/perimetre" className="rounded-full bg-white/15 px-4 py-2 text-[13px] font-bold">
                        Modifier le périmètre
                      </Link>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Séance du jour */}
            <section className="ds-card p-5">
              <p className="text-sm font-extrabold mb-1">Votre séance d’aujourd’hui</p>
              <p className="text-[13px] text-[var(--ds-n600)]">
                {todayPages.length} page{todayPages.length > 1 ? 's' : ''} · {pagesLabel(todayPages, config.surah)}
                {slot && ` · ${formatTime(slot.startMin)} – ${formatTime(slot.endMin)}`}
              </p>
              {config.dailyCap && span.length > config.dailyCap && (
                <p className="text-[12px] text-[var(--ds-n500)] mt-1">
                  Les dernières pages sont au programme chaque jour ; le début tourne par fenêtre,
                  toute la sourate est couverte en quelques jours.
                </p>
              )}
              {isVolumeHeavy(config) && (
                <div className="rounded-2xl border border-[var(--ds-gold)] bg-[var(--ds-gold-100)] p-3.5 mt-3">
                  <p className="text-[13px] font-bold text-[var(--ds-gold-700)]">
                    {span.length} pages par jour, en plus de votre cycle
                  </p>
                  <p className="text-[12px] text-[var(--ds-n700)] mt-0.5">
                    Cela représente environ {span.length * LEARNING_MIN_PER_PAGE} minutes quotidiennes.
                    Un plafond garderait les pages récentes tous les jours et ferait tourner le début.
                  </p>
                  <button
                    type="button"
                    onClick={() => persist({ ...config, dailyCap: 10 })}
                    className="ds-btn-gold px-4 py-2 text-[13px] mt-2.5"
                  >
                    Plafonner à 10 pages par jour
                  </button>
                </div>
              )}
            </section>

            {/* Charge totale de la journée — le point que l'objectif du cycle
                ne dit pas : la séance de la sourate s'AJOUTE à la révision. */}
            <section className="ds-card p-5">
              <p className="text-sm font-extrabold mb-2">Votre charge quotidienne</p>
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-2xl font-extrabold text-[var(--ds-green)]">{load.cyclePages}</p>
                  <p className="text-[12px] text-[var(--ds-n600)] font-semibold">pages de révision</p>
                </div>
                <span className="text-xl text-[var(--ds-n400)] pb-1">+</span>
                <div>
                  <p className="text-2xl font-extrabold text-[var(--ds-gold-700)]">{load.learningPages}</p>
                  <p className="text-[12px] text-[var(--ds-n600)] font-semibold">pages de sourate</p>
                </div>
                <span className="text-xl text-[var(--ds-n400)] pb-1">=</span>
                <div>
                  <p className="text-2xl font-extrabold text-[var(--ds-text)]">{load.totalPages}</p>
                  <p className="text-[12px] text-[var(--ds-n600)] font-semibold">
                    pages · ~{Math.round(load.estimatedMinutes / 5) * 5} min
                  </p>
                </div>
              </div>
              {load.estimatedMinutes > 90 && (
                <p className="text-[12px] text-[var(--ds-gold-700)] font-semibold mt-2.5">
                  Plus d’une heure et demie par jour, révision comprise. Un plafond sur la sourate,
                  ou un{' '}
                  <Link href="/recitation/objectif" className="underline">
                    cycle plus long
                  </Link>{' '}
                  rendrait le rythme plus tenable.
                </p>
              )}
              {overlap && (
                <p className="text-[12px] text-[#b3542e] font-semibold mt-2.5">
                  Cette séance chevauche un créneau de révision : à cette heure-là, deux séances se
                  disputeraient l’écran. Choisissez un autre moment.
                </p>
              )}
            </section>

            {/* Placement */}
            <section className="ds-card p-5">
              <p className="text-sm font-extrabold mb-2">Quand réciter cette sourate ?</p>
              <div className="flex flex-col gap-1.5">
                {PLACEMENTS.map((o) => (
                  <label key={o.v} className="flex items-start gap-2.5 cursor-pointer py-1">
                    <input
                      type="radio"
                      name="placement"
                      checked={config.placement === o.v}
                      onChange={() => persist({ ...config, placement: o.v, customStartMin: config.customStartMin ?? 20 * 60 })}
                      className="accent-[var(--ds-gold)] mt-1"
                    />
                    <span>
                      <span className="text-sm font-semibold block">{o.label}</span>
                      <span className="text-[12px] text-[var(--ds-n600)]">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {config.placement === 'custom' && (
                <input
                  type="time"
                  value={`${String(Math.floor((config.customStartMin ?? 1200) / 60)).padStart(2, '0')}:${String((config.customStartMin ?? 1200) % 60).padStart(2, '0')}`}
                  onChange={(e) => {
                    const v = parseTime(e.target.value);
                    if (v != null) persist({ ...config, customStartMin: v });
                  }}
                  className="mt-2 rounded-xl border border-[var(--ds-divider)] px-3 py-2 text-sm bg-white"
                />
              )}
            </section>

            {/* Plafond */}
            <section className="ds-card p-5">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm font-extrabold">
                  Plafonner le volume quotidien
                  <span className="block text-[12px] font-normal text-[var(--ds-n600)]">
                    Les pages récentes restent tous les jours, le début tourne.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={config.dailyCap != null}
                  onChange={(e) => persist({ ...config, dailyCap: e.target.checked ? 10 : null })}
                  className="w-5 h-5 accent-[var(--ds-gold)]"
                />
              </label>
              {config.dailyCap != null && (
                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="number"
                    min={2}
                    max={30}
                    value={config.dailyCap}
                    onChange={(e) => persist({ ...config, dailyCap: Math.max(2, Number(e.target.value) || 2) })}
                    className="w-20 rounded-lg border border-[var(--ds-divider)] px-2.5 py-1.5 text-sm"
                  />
                  <span className="text-sm text-[var(--ds-n600)]">pages par jour au maximum</span>
                </div>
              )}
            </section>

            <button
              type="button"
              onClick={() => persist(null)}
              className="ds-btn-ghost px-5 py-3 text-sm self-start"
            >
              Arrêter la séance quotidienne
            </button>
          </>
        )}
      </div>
    </AppShell>
  );
}
