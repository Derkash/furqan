'use client';

// « Bilan du cycle » (brief §17) : pages prévues / récitées / non récitées,
// ventilation de maîtrise, comparaison avec le cycle précédent et proposition
// d'ajustement — JAMAIS appliquée sans l'accord explicite de l'utilisateur.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { MASTERY_LABELS, masteryBreakdown } from '@/lib/recitation/mastery';
import { buildCycleDays } from '@/lib/recitation/planner';
import { toDateKey } from '@/lib/recitation/schedule';
import {
  evaluationsByPage,
  loadCycle,
  loadEvaluations,
  loadProgram,
  loadSessions,
  saveCycle,
  saveProgram,
  clearDayState,
} from '@/lib/recitation/store';
import type { MasteryLevel, Objective } from '@/lib/recitation/types';

function objectiveLabel(obj: Objective): string {
  if (obj.kind === 'juzPerDay') {
    return obj.amount === 0.5 ? 'un demi-juz’ par jour' : obj.amount === 1 ? 'un juz’ par jour' : 'deux juz’ par jour';
  }
  if (obj.kind === 'pagesPerDay') return `${obj.pages} pages par jour`;
  return `tout le périmètre en ${obj.days} jours`;
}

export default function BilanPage() {
  const router = useRouter();
  const [applied, setApplied] = useState(false);
  const program = useMemo(() => loadProgram(), []);
  const cycle = useMemo(() => loadCycle(), []);
  const sessions = useMemo(() => loadSessions(), []);
  const evals = useMemo(() => evaluationsByPage(loadEvaluations()), []);

  if (!program || !cycle) {
    return (
      <AppShell>
        <h1 className="ds-title text-3xl">Bilan du cycle</h1>
        <p className="text-[var(--ds-n600)] mt-2">Créez d’abord votre programme de récitation.</p>
        <Link href="/recitation" className="ds-btn-gold inline-block px-6 py-2.5 text-sm mt-4">Mon programme</Link>
      </AppShell>
    );
  }

  const cyclePages = new Set(cycle.days.flatMap((d) => d.pages));
  const cycleSessions = sessions.filter((s) => s.date >= cycle.startDate);
  const recited = new Set<number>();
  for (const s of cycleSessions) for (const p of s.recitedPages) if (cyclePages.has(p)) recited.add(p);
  const breakdown = masteryBreakdown([...cyclePages], evals);
  const notRecited = cyclePages.size - recited.size;

  // Cycle précédent : sessions antérieures au départ du cycle courant.
  const prevSessions = sessions.filter((s) => s.date < cycle.startDate);
  const prevRecited = new Set<number>();
  for (const s of prevSessions) for (const p of s.recitedPages) prevRecited.add(p);

  // Proposition d'ajustement (règles simples, explicables).
  const fragileCount = breakdown.counts['fragile'] + breakdown.counts['a-retravailler'];
  const completion = cyclePages.size ? recited.size / cyclePages.size : 0;
  let proposal: { text: string; objective: Objective | null } = {
    text: `Votre maîtrise est stable : vous pouvez conserver ${objectiveLabel(program.objective)}.`,
    objective: null,
  };
  if (fragileCount > breakdown.evaluated * 0.3 && breakdown.evaluated > 0) {
    proposal = {
      text: 'Plusieurs pages restent fragiles : conservez ce rythme et laissez le renforcement adaptatif les reproposer plus tôt.',
      objective: null,
    };
  } else if (completion < 0.6 && cycleSessions.length > 0) {
    const softer: Objective =
      program.objective.kind === 'pagesPerDay'
        ? { kind: 'pagesPerDay', pages: Math.max(1, Math.floor(program.objective.pages * 0.7)) }
        : program.objective.kind === 'juzPerDay' && program.objective.amount > 0.5
          ? { kind: 'juzPerDay', amount: program.objective.amount === 2 ? 1 : 0.5 }
          : { kind: 'totalDays', days: cycle.days.length + Math.ceil(cycle.days.length / 2) };
    proposal = {
      text: `Une partie du cycle n’a pas pu être récitée : un rythme un peu plus doux (${objectiveLabel(softer)}) rendrait le programme plus serein.`,
      objective: softer,
    };
  } else if (completion >= 0.95 && breakdown.percent != null && breakdown.percent >= 85) {
    const harder: Objective =
      program.objective.kind === 'pagesPerDay'
        ? { kind: 'pagesPerDay', pages: program.objective.pages + Math.max(1, Math.round(program.objective.pages * 0.25)) }
        : program.objective.kind === 'juzPerDay' && program.objective.amount < 2
          ? { kind: 'juzPerDay', amount: program.objective.amount === 0.5 ? 1 : 2 }
          : program.objective;
    if (JSON.stringify(harder) !== JSON.stringify(program.objective)) {
      proposal = {
        text: `Votre cycle est bien tenu et bien maîtrisé : vous pouvez essayer ${objectiveLabel(harder)}.`,
        objective: harder,
      };
    }
  }

  const applyProposal = () => {
    if (!proposal.objective) return;
    const updated = { ...program, objective: proposal.objective, updatedAt: new Date().toISOString() };
    saveProgram(updated);
    saveCycle({
      number: cycle.number + 1,
      startDate: toDateKey(new Date()),
      days: buildCycleDays(updated.perimeterPages, proposal.objective),
    });
    clearDayState();
    setApplied(true);
    router.push('/recitation');
  };

  const rows: { label: string; value: number }[] = [
    { label: 'Pages prévues au cycle', value: cyclePages.size },
    { label: 'Pages récitées', value: recited.size },
    { label: 'Pages non récitées', value: notRecited },
  ];

  return (
    <AppShell>
      <header className="flex items-center gap-3 mb-5">
        <Link href="/recitation" aria-label="Retour" className="text-2xl text-[var(--ds-n600)] hover:text-[var(--ds-green)]">←</Link>
        <div>
          <p className="ds-kicker">Cycle n° {cycle.number}</p>
          <h1 className="ds-title text-3xl">Bilan du cycle</h1>
        </div>
      </header>

      <div className="max-w-[640px] flex flex-col gap-4 pb-10">
        <section className="ds-card p-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            {rows.map((r) => (
              <div key={r.label}>
                <p className="text-2xl font-extrabold text-[var(--ds-green)]">{r.value}</p>
                <p className="text-[12px] text-[var(--ds-n600)] font-semibold mt-0.5">{r.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="ds-card p-5">
          <p className="text-sm font-extrabold mb-3">Maîtrise des pages du cycle</p>
          <div className="flex flex-col gap-2">
            {(Object.keys(MASTERY_LABELS) as MasteryLevel[]).map((l) => (
              <div key={l} className="flex items-center justify-between text-sm">
                <span className="font-semibold">{MASTERY_LABELS[l]}</span>
                <span className="font-extrabold text-[var(--ds-green)]">{breakdown.counts[l]}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-sm text-[var(--ds-n500)]">
              <span className="font-semibold">Jamais évaluées</span>
              <span className="font-extrabold">{breakdown.neverEvaluated}</span>
            </div>
          </div>
          {prevRecited.size > 0 && (
            <p className="text-[13px] text-[var(--ds-n600)] mt-3 pt-3 border-t border-[var(--ds-divider)]">
              Cycle précédent : {prevRecited.size} pages récitées — ce cycle : {recited.size}.
            </p>
          )}
        </section>

        {/* Proposition (jamais appliquée sans accord) */}
        <section className="rounded-[20px] p-5 text-white" style={{ background: 'var(--ds-green)', boxShadow: 'var(--ds-shadow-md)' }}>
          <p className="ds-kicker" style={{ color: 'var(--ds-gold-100)' }}>Proposition</p>
          <p className="text-[15px] font-semibold mt-1.5 leading-relaxed">{proposal.text}</p>
          <div className="flex flex-wrap gap-2 mt-4">
            {proposal.objective && !applied && (
              <button type="button" onClick={applyProposal} className="ds-btn-gold px-5 py-2.5 text-[13px]">
                Appliquer cette proposition
              </button>
            )}
            <Link href="/recitation" className="rounded-full bg-white/15 px-5 py-2.5 text-[13px] font-bold hover:bg-white/25 transition-colors">
              Garder mon programme
            </Link>
            <Link href="/recitation/objectif" className="rounded-full bg-white/15 px-5 py-2.5 text-[13px] font-bold hover:bg-white/25 transition-colors">
              Ajuster manuellement
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
