'use client';

// « Maîtrise » (brief §10) : consultation par juz', sourate ou page du niveau
// de maîtrise. Couleur TOUJOURS accompagnée d'un libellé. Fiche détaillée par
// page : niveau, dernières évaluations, prochaine révision et sa raison, notes.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { formatDateKey, pageRefLabel, surahsOfPage } from '@/lib/recitation/labels';
import {
  MASTERY_LABELS,
  currentLevel,
  masteryBreakdown,
  reinforcementDelayDays,
  reinforcementReason,
} from '@/lib/recitation/mastery';
import { addDays } from '@/lib/recitation/schedule';
import { JUZ_PAGES } from '@/lib/recitation/unitPages';
import { evaluationsByPage, loadEvaluations, loadProgram } from '@/lib/recitation/store';
import { SURAH_PAGES } from '@/utils/exercises/surahPages';
import type { MasteryLevel } from '@/lib/recitation/types';

const LEVEL_STYLE: Record<MasteryLevel, { dot: string; icon: string }> = {
  'maitrisee': { dot: '#2d5a47', icon: '●' },
  'plutot-maitrisee': { dot: '#538271', icon: '◐' },
  'fragile': { dot: '#c5a059', icon: '◔' },
  'a-retravailler': { dot: '#b3542e', icon: '○' },
};

function LevelBadge({ level }: { level: MasteryLevel | null }) {
  if (!level) {
    return <span className="text-[12px] font-bold text-[var(--ds-n500)]">— Jamais évaluée</span>;
  }
  const st = LEVEL_STYLE[level];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: st.dot }}>
      <span aria-hidden>{st.icon}</span>
      {MASTERY_LABELS[level]}
    </span>
  );
}

function BreakdownBar({ pages }: { pages: number[] }) {
  const evals = useMemo(() => evaluationsByPage(loadEvaluations()), []);
  const b = masteryBreakdown(pages, evals);
  const segments: { level: MasteryLevel | null; count: number; color: string }[] = [
    { level: 'maitrisee', count: b.counts['maitrisee'], color: '#2d5a47' },
    { level: 'plutot-maitrisee', count: b.counts['plutot-maitrisee'], color: '#538271' },
    { level: 'fragile', count: b.counts['fragile'], color: '#c5a059' },
    { level: 'a-retravailler', count: b.counts['a-retravailler'], color: '#b3542e' },
    { level: null, count: b.neverEvaluated, color: '#d9e3de' },
  ];
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-[var(--ds-sage-100)]">
      {segments.map(
        (s, i) =>
          s.count > 0 && (
            <div
              key={i}
              style={{ width: `${(s.count / b.total) * 100}%`, background: s.color }}
              title={`${s.level ? MASTERY_LABELS[s.level] : 'Jamais évaluée'} : ${s.count}`}
            />
          )
      )}
    </div>
  );
}

function PageSheet({ page, onClose }: { page: number; onClose: () => void }) {
  const evals = useMemo(() => evaluationsByPage(loadEvaluations()).get(page) ?? [], [page]);
  const level = currentLevel(evals);
  const last = evals[evals.length - 1];
  const delay = last ? reinforcementDelayDays(last.level) : null;
  const nextReview = last && delay != null ? addDays(last.at.slice(0, 10), delay) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" role="dialog" aria-modal>
      <button type="button" aria-label="Fermer" className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-white rounded-t-[28px] md:rounded-[28px] p-6 shadow-[var(--ds-shadow-lg)] max-h-[85dvh] overflow-y-auto">
        <p className="ds-kicker">
          {pageRefLabel(page)} · {surahsOfPage(page).map((s) => s.nameSimple).join(' · ')}
        </p>
        <div className="mt-2">
          <LevelBadge level={level} />
        </div>

        {last && (
          <p className="text-[13px] text-[var(--ds-n600)] mt-2">
            Dernière récitation : {formatDateKey(last.at.slice(0, 10))}
          </p>
        )}
        {nextReview && last && (
          <div className="rounded-2xl bg-[var(--ds-gold-100)] p-3.5 mt-3">
            <p className="text-[13px] font-bold text-[var(--ds-gold-700)]">
              Prochaine révision : {formatDateKey(nextReview)}
            </p>
            <p className="text-[12px] text-[var(--ds-n700)] mt-0.5">{reinforcementReason(last.level)}</p>
          </div>
        )}

        {evals.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-extrabold mb-2">Dernières évaluations</p>
            <div className="flex flex-col gap-1.5">
              {evals
                .slice(-5)
                .reverse()
                .map((e, i) => (
                  <div key={i} className="flex items-center justify-between text-[13px]">
                    <LevelBadge level={e.level} />
                    <span className="text-[var(--ds-n500)]">{formatDateKey(e.at.slice(0, 10))}</span>
                  </div>
                ))}
            </div>
            {evals.some((e) => e.note) && (
              <div className="mt-3">
                <p className="text-sm font-extrabold mb-1">Notes</p>
                {evals
                  .filter((e) => e.note)
                  .slice(-3)
                  .map((e, i) => (
                    <p key={i} className="text-[13px] text-[var(--ds-n600)]">
                      « {e.note} »
                    </p>
                  ))}
              </div>
            )}
          </div>
        )}

        <Link href="/recitation/en-cours" className="ds-btn-gold inline-block px-6 py-2.5 text-sm mt-5">
          Réciter cette page
        </Link>
      </div>
    </div>
  );
}

type View = 'juz' | 'surah';

export default function MaitrisePage() {
  const [view, setView] = useState<View>('juz');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [sheet, setSheet] = useState<number | null>(null);

  const program = useMemo(() => loadProgram(), []);
  const evals = useMemo(() => evaluationsByPage(loadEvaluations()), []);
  const perimeter = useMemo(() => new Set(program?.perimeterPages ?? []), [program]);

  if (!program) {
    return (
      <AppShell>
        <h1 className="ds-title text-3xl">Maîtrise</h1>
        <p className="text-[var(--ds-n600)] mt-2">Créez d’abord votre programme de récitation.</p>
        <Link href="/recitation" className="ds-btn-gold inline-block px-6 py-2.5 text-sm mt-4">
          Mon programme
        </Link>
      </AppShell>
    );
  }

  const globalB = masteryBreakdown(program.perimeterPages, evals);
  const units =
    view === 'juz'
      ? Array.from({ length: 30 }, (_, i) => i + 1)
          .map((j) => ({
            id: j,
            label: `Juz’ ${j}`,
            pages: program.perimeterPages.filter(
              (p) => p >= JUZ_PAGES[j].startPage && p <= JUZ_PAGES[j].endPage
            ),
          }))
          .filter((u) => u.pages.length > 0)
      : Array.from({ length: 114 }, (_, i) => i + 1)
          .map((s) => ({
            id: s,
            label: `${s}. ${SURAH_PAGES[s]?.nameSimple}`,
            pages: program.perimeterPages.filter(
              (p) => p >= SURAH_PAGES[s].startPage && p <= SURAH_PAGES[s].endPage
            ),
          }))
          .filter((u) => u.pages.length > 0);

  return (
    <AppShell>
      <header className="flex items-center gap-3 mb-5">
        <Link href="/recitation" aria-label="Retour" className="text-2xl text-[var(--ds-n600)] hover:text-[var(--ds-green)]">←</Link>
        <h1 className="ds-title text-3xl">Maîtrise</h1>
      </header>

      <div className="max-w-[720px]">
        {/* Vue globale */}
        <section className="ds-card p-5 mb-4">
          <div className="flex items-baseline justify-between mb-2.5">
            <p className="text-sm font-extrabold">Ensemble du périmètre</p>
            <p className="text-sm font-extrabold text-[var(--ds-green)]">
              {globalB.percent != null ? `${globalB.percent} %` : '—'}
              <span className="text-[var(--ds-n500)] font-semibold text-[12px]">
                {' '}· {globalB.evaluated}/{globalB.total} pages évaluées
              </span>
            </p>
          </div>
          <BreakdownBar pages={program.perimeterPages} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
            {(Object.keys(MASTERY_LABELS) as MasteryLevel[]).map((l) => (
              <span key={l} className="text-[12px]">
                <LevelBadge level={l} />{' '}
                <span className="text-[var(--ds-n500)] font-semibold">{globalB.counts[l]}</span>
              </span>
            ))}
            <span className="text-[12px] font-bold text-[var(--ds-n500)]">
              — Jamais évaluée <span className="font-semibold">{globalB.neverEvaluated}</span>
            </span>
          </div>
        </section>

        {/* Sélecteur de vue */}
        <div className="flex gap-1.5 mb-3">
          {([
            { v: 'juz', label: 'Par juz’' },
            { v: 'surah', label: 'Par sourate' },
          ] as const).map((t) => (
            <button
              key={t.v}
              type="button"
              onClick={() => {
                setView(t.v);
                setExpanded(null);
              }}
              className={`px-4 py-2 rounded-full text-[13px] font-bold transition-colors ${
                view === t.v ? 'bg-[var(--ds-green)] text-white' : 'ds-card text-[var(--ds-n600)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Unités */}
        <div className="flex flex-col gap-2.5 pb-8">
          {units.map((u) => {
            const b = masteryBreakdown(u.pages, evals);
            const open = expanded === u.id;
            return (
              <section key={u.id} className="ds-card p-4">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : u.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-[15px] font-extrabold">{u.label}</p>
                    <p className="text-[13px] font-bold text-[var(--ds-green)]">
                      {b.percent != null ? `Maîtrise : ${b.percent} %` : 'Pas encore évalué'}
                      <span className="text-[var(--ds-n500)] font-semibold">
                        {' '}· {b.evaluated}/{b.total} p.
                      </span>
                    </p>
                  </div>
                  <BreakdownBar pages={u.pages} />
                </button>
                {open && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-3 pt-3 border-t border-[var(--ds-divider)]">
                    {u.pages.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSheet(p)}
                        className="flex items-center justify-between rounded-xl border border-[var(--ds-divider)] px-3 py-2 hover:border-[var(--ds-gold)] transition-colors"
                      >
                        <span className="text-[13px] font-bold">{pageRefLabel(p)}</span>
                        <LevelBadge level={currentLevel(evals.get(p) ?? [])} />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          {perimeter.size === 0 && (
            <p className="text-sm text-[var(--ds-n600)]">Aucune page dans le périmètre.</p>
          )}
        </div>
      </div>

      {sheet != null && <PageSheet page={sheet} onClose={() => setSheet(null)} />}
    </AppShell>
  );
}
