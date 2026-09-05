'use client';

// Étape 4 — « Répartition » (brief §4) : comment l'objectif du jour se répartit
// entre les créneaux — automatique (équilibré) ou personnalisé. Alerte si les
// horaires ne permettent pas raisonnablement d'atteindre l'objectif, avec les
// quatre issues proposées. Valide et enregistre le programme.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { SetupFrame } from '@/components/recitation/SetupSteps';
import { finalizeProgram, loadDraft, saveDraft, type ProgramDraft } from '@/lib/recitation/draft';
import { pagesLabel } from '@/lib/recitation/labels';
import { perimeterPages } from '@/lib/recitation/perimeter';
import {
  buildCycleDays,
  checkFeasibility,
  splitPagesAcrossSlots,
  splitPagesCustom,
} from '@/lib/recitation/planner';
import { formatTime, slotsForWeekday } from '@/lib/recitation/schedule';
import { scheduleRecitationNotifications } from '@/lib/recitation/notifications';

export default function RepartitionPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [saving, setSaving] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => setDraft(loadDraft()), []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const pages = useMemo(() => (draft ? perimeterPages(draft.selections) : []), [draft]);
  const firstDay = useMemo(() => {
    if (!draft?.objective) return [];
    return buildCycleDays(pages, draft.objective)[0]?.pages ?? [];
  }, [draft, pages]);
  const slots = useMemo(() => {
    if (!draft) return [];
    const day = draft.schedule.activeWeekdays[0] ?? 1;
    return slotsForWeekday(draft.schedule, day);
  }, [draft]);

  const customCounts = useMemo(() => {
    if (!draft) return [];
    if (draft.slotSplit.mode === 'custom' && draft.slotSplit.pagesPerSlot.length === slots.length) {
      return draft.slotSplit.pagesPerSlot;
    }
    return splitPagesAcrossSlots(firstDay, slots).map((s) => s.pages.length);
  }, [draft, firstDay, slots]);

  if (!draft) return <AppShell><div /></AppShell>;

  const isCustom = draft.slotSplit.mode === 'custom';
  const planned = isCustom
    ? splitPagesCustom(firstDay, slots, customCounts)
    : splitPagesAcrossSlots(firstDay, slots);
  const feasibility = checkFeasibility(firstDay.length, slots);
  const customTotal = customCounts.reduce((a, b) => a + b, 0);
  const customShort = isCustom && customTotal < firstDay.length;

  const update = (next: ProgramDraft) => {
    setDraft(next);
    saveDraft(next);
  };

  const setMode = (mode: 'auto' | 'custom') =>
    update({
      ...draft,
      slotSplit: mode === 'auto' ? { mode: 'auto' } : { mode: 'custom', pagesPerSlot: customCounts },
    });

  const setCount = (i: number, value: number) => {
    const counts = [...customCounts];
    counts[i] = Math.max(0, value);
    update({ ...draft, slotSplit: { mode: 'custom', pagesPerSlot: counts } });
  };

  const save = () => {
    setSaving(true);
    const result = finalizeProgram(draft, new Date());
    if (result) {
      scheduleRecitationNotifications(result.program, result.cycle, new Date()).catch(() => {});
      router.push('/recitation');
    } else {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <SetupFrame
        step={3}
        title="Répartition de la journée"
        subtitle={`Objectif du premier jour : ${firstDay.length} pages (${pagesLabel(firstDay)}).`}
        canContinue={slots.length > 0 && !customShort && !saving}
        continueLabel="Enregistrer le programme"
        onContinue={save}
      >
        {/* Mode */}
        <div className="flex gap-1.5 mb-4">
          {([
            { mode: 'auto', label: 'Répartition automatique' },
            { mode: 'custom', label: 'Répartition personnalisée' },
          ] as const).map((m) => (
            <button
              key={m.mode}
              type="button"
              onClick={() => setMode(m.mode)}
              className={`px-4 py-2 rounded-full text-[13px] font-bold transition-colors ${
                (isCustom ? 'custom' : 'auto') === m.mode
                  ? 'bg-[var(--ds-green)] text-white'
                  : 'ds-card text-[var(--ds-n600)]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Créneaux */}
        <section className="ds-card p-4 md:p-5">
          <div className="flex flex-col divide-y divide-[var(--ds-divider)]">
            {planned.map((slot, i) => (
              <div key={i} className="py-3 flex items-center gap-3">
                <span className="flex-none w-28 text-sm font-extrabold text-[var(--ds-green)]">
                  {formatTime(slot.startMin)} – {formatTime(slot.endMin)}
                </span>
                {isCustom ? (
                  <span className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={customCounts[i] ?? 0}
                      onChange={(e) => setCount(i, Number(e.target.value) || 0)}
                      className="w-16 rounded-lg border border-[var(--ds-divider)] px-2.5 py-1.5 text-sm"
                    />
                    <span className="text-sm text-[var(--ds-n600)]">page{(customCounts[i] ?? 0) > 1 ? 's' : ''}</span>
                  </span>
                ) : (
                  <span className="text-sm font-semibold">
                    {slot.pages.length} page{slot.pages.length > 1 ? 's' : ''}
                  </span>
                )}
                <span className="text-[13px] text-[var(--ds-n500)] flex-1 text-right">
                  {pagesLabel(slot.pages)}
                </span>
              </div>
            ))}
          </div>
          {customShort && (
            <p className="text-[13px] font-semibold text-[#b3542e] mt-3 pt-3 border-t border-[var(--ds-divider)]">
              Il manque {firstDay.length - customTotal} page{firstDay.length - customTotal > 1 ? 's' : ''} pour
              couvrir l’objectif du jour.
            </p>
          )}
        </section>

        {/* Alerte de faisabilité (brief §4) */}
        {!feasibility.ok && (
          <section className="rounded-[20px] border border-[var(--ds-gold)] bg-[var(--ds-gold-100)] p-5 mt-4">
            <p className="text-sm font-extrabold text-[var(--ds-gold-700)]">
              Objectif serré pour ces horaires
            </p>
            <p className="text-[13px] text-[var(--ds-n700)] mt-1">
              Environ {feasibility.neededMin} minutes de récitation sont nécessaires pour{' '}
              {firstDay.length} pages, mais vos créneaux n’offrent que {feasibility.availableMin} minutes.
              Vous pouvez :
            </p>
            <ul className="text-[13px] text-[var(--ds-n700)] mt-2 flex flex-col gap-1 list-disc pl-5">
              <li>accepter davantage de pages par créneau (garder tel quel) ;</li>
              <li>
                <Link className="underline font-semibold" href="/recitation/horaires">
                  ajouter des créneaux ou élargir la plage horaire
                </Link>{' '}
                ;
              </li>
              <li>
                <Link className="underline font-semibold" href="/recitation/objectif">
                  prolonger le cycle sur davantage de jours
                </Link>
                .
              </li>
            </ul>
          </section>
        )}

        {/* Préférences de report */}
        <section className="ds-card p-4 md:p-5 mt-4">
          <p className="text-sm font-extrabold mb-2">Si un créneau se termine incomplet</p>
          <div className="flex flex-col gap-1.5">
            {([
              { v: 'auto', label: 'Reporter automatiquement les pages restantes' },
              { v: 'never', label: 'Ne jamais reporter (reprises au cycle suivant)' },
              { v: 'ask', label: 'Toujours me demander' },
            ] as const).map((o) => (
              <label key={o.v} className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="carry"
                  checked={draft.carryOver === o.v}
                  onChange={() => update({ ...draft, carryOver: o.v })}
                  className="accent-[var(--ds-gold)]"
                />
                <span className="text-sm font-semibold">{o.label}</span>
              </label>
            ))}
          </div>
          <label className="flex items-center justify-between cursor-pointer mt-4 pt-3 border-t border-[var(--ds-divider)]">
            <span className="text-sm font-extrabold">
              Renforcement adaptatif
              <span className="block text-[12px] font-normal text-[var(--ds-n600)]">
                Les pages fragiles reviennent plus tôt, en tête de créneau.
              </span>
            </span>
            <input
              type="checkbox"
              checked={draft.reinforcementEnabled}
              onChange={(e) => update({ ...draft, reinforcementEnabled: e.target.checked })}
              className="w-5 h-5 accent-[var(--ds-gold)]"
            />
          </label>
        </section>
      </SetupFrame>
    </AppShell>
  );
}
