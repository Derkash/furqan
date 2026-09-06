'use client';

// « Historique et statistiques » (brief §18) : sessions, pages récitées par
// période, pages délaissées, juz' les mieux maîtrisés. Des repères pour
// organiser sa révision — jamais une compétition.

import Link from 'next/link';
import { useMemo } from 'react';
import AppShell from '@/components/AppShell';
import { formatDateKey, pageRefLabel, pagesLabel } from '@/lib/recitation/labels';
import { masteryBreakdown } from '@/lib/recitation/mastery';
import { formatTime, toDateKey, addDays } from '@/lib/recitation/schedule';
import { JUZ_PAGES } from '@/lib/recitation/unitPages';
import {
  evaluationsByPage,
  loadEvaluations,
  loadProgram,
  loadSessions,
} from '@/lib/recitation/store';

const STATUS_LABEL = {
  done: { label: 'Terminée', cls: 'text-[var(--ds-sage)]' },
  partial: { label: 'Incomplète', cls: 'text-[var(--ds-gold-700)]' },
  missed: { label: 'Non réalisée', cls: 'text-[var(--ds-n500)]' },
} as const;

export default function HistoriquePage() {
  const program = useMemo(() => loadProgram(), []);
  const sessions = useMemo(() => [...loadSessions()].reverse(), []);
  const evals = useMemo(() => evaluationsByPage(loadEvaluations()), []);

  const stats = useMemo(() => {
    const today = toDateKey(new Date());
    const weekStart = addDays(today, -6);
    const monthStart = addDays(today, -29);
    const count = (from: string) => {
      // Une même page récitée deux jours différents compte deux fois (volume).
      const seen = new Set<string>();
      for (const s of sessions) if (s.date >= from) for (const p of s.recitedPages) seen.add(`${s.date}:${p}`);
      return seen.size;
    };
    return { day: count(today), week: count(weekStart), month: count(monthStart) };
  }, [sessions]);

  // Pages non récitées depuis longtemps (dans le périmètre).
  const stale = useMemo(() => {
    if (!program) return [];
    const lastByPage = new Map<number, string>();
    for (const s of loadSessions()) {
      for (const p of s.recitedPages) {
        const prev = lastByPage.get(p);
        if (!prev || s.date > prev) lastByPage.set(p, s.date);
      }
    }
    return program.perimeterPages
      .map((p) => ({ page: p, last: lastByPage.get(p) ?? null }))
      .sort((a, b) => (a.last ?? '0').localeCompare(b.last ?? '0'))
      .slice(0, 8);
  }, [program]);

  // Juz' triés par maîtrise.
  const juzRanking = useMemo(() => {
    if (!program) return [];
    return Array.from({ length: 30 }, (_, i) => i + 1)
      .map((j) => ({
        juz: j,
        pages: program.perimeterPages.filter((p) => p >= JUZ_PAGES[j].startPage && p <= JUZ_PAGES[j].endPage),
      }))
      .filter((u) => u.pages.length > 0)
      .map((u) => ({ ...u, breakdown: masteryBreakdown(u.pages, evals) }))
      .filter((u) => u.breakdown.percent != null)
      .sort((a, b) => (b.breakdown.percent ?? 0) - (a.breakdown.percent ?? 0));
  }, [program, evals]);

  if (!program) {
    return (
      <AppShell>
        <h1 className="ds-title text-3xl">Historique</h1>
        <p className="text-[var(--ds-n600)] mt-2">Créez d’abord votre programme de récitation.</p>
        <Link href="/recitation" className="ds-btn-gold inline-block px-6 py-2.5 text-sm mt-4">Mon programme</Link>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="flex items-center gap-3 mb-5">
        <Link href="/recitation" aria-label="Retour" className="text-2xl text-[var(--ds-n600)] hover:text-[var(--ds-green)]">←</Link>
        <h1 className="ds-title text-3xl">Historique</h1>
      </header>

      <div className="max-w-[680px] flex flex-col gap-4 pb-10">
        {/* Compteurs */}
        <section className="ds-card p-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Aujourd’hui', value: stats.day },
              { label: '7 derniers jours', value: stats.week },
              { label: '30 derniers jours', value: stats.month },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-extrabold text-[var(--ds-green)]">{s.value}</p>
                <p className="text-[12px] text-[var(--ds-n600)] font-semibold mt-0.5">
                  pages récitées
                  <br />
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Juz' les mieux maîtrisés */}
        {juzRanking.length > 0 && (
          <section className="ds-card p-5">
            <p className="text-sm font-extrabold mb-3">Vos juz’, du plus solide au plus fragile</p>
            <div className="flex flex-col gap-1.5">
              {juzRanking.map((u) => (
                <div key={u.juz} className="flex items-center gap-3 text-sm">
                  <span className="font-bold w-16 flex-none">Juz’ {u.juz}</span>
                  <div className="flex-1 h-2 rounded-full bg-[var(--ds-sage-100)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${u.breakdown.percent}%`, background: 'var(--ds-sage)' }}
                    />
                  </div>
                  <span className="font-extrabold text-[var(--ds-green)] w-12 text-right">
                    {u.breakdown.percent} %
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pages délaissées */}
        {stale.length > 0 && (
          <section className="ds-card p-5">
            <p className="text-sm font-extrabold mb-1">Pages non récitées depuis longtemps</p>
            <p className="text-[12px] text-[var(--ds-n500)] mb-3">
              De simples repères pour orienter la révision — le cycle finira par y repasser.
            </p>
            <div className="flex flex-wrap gap-2">
              {stale.map((s) => (
                <span key={s.page} className="rounded-full bg-[var(--ds-sage-100)] px-3.5 py-1.5 text-[13px] font-bold text-[var(--ds-green)]">
                  {pageRefLabel(s.page)}
                  <span className="text-[var(--ds-n500)] font-semibold">
                    {' '}· {s.last ? formatDateKey(s.last).replace(/^\w+ /, '') : 'jamais'}
                  </span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Sessions */}
        <section>
          <p className="ds-kicker mb-3">Sessions</p>
          <div className="ds-card divide-y divide-[var(--ds-divider)]">
            {sessions.slice(0, 30).map((s, i) => {
              const st = STATUS_LABEL[s.status];
              return (
                <div key={i} className="px-5 py-3 flex items-center gap-3">
                  <span className="flex-none w-32 text-[13px] font-bold text-[var(--ds-n600)] capitalize">
                    {formatDateKey(s.date)}
                  </span>
                  <span className="flex-none w-24 text-[13px] font-extrabold text-[var(--ds-green)]">
                    {formatTime(s.slot.startMin)}–{formatTime(s.slot.endMin)}
                  </span>
                  <span className="text-sm flex-1">
                    {s.recitedPages.length}/{s.plannedPages.length} · {pagesLabel(s.plannedPages)}
                  </span>
                  <span className={`text-[12px] font-bold ${st.cls}`}>{st.label}</span>
                </div>
              );
            })}
            {sessions.length === 0 && (
              <p className="px-5 py-4 text-sm text-[var(--ds-n600)]">Aucune session enregistrée pour le moment.</p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
