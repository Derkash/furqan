'use client';

// Étape 3 — « Jours et horaires » (brief §3) : jours actifs, plage horaire,
// fréquence des créneaux (ou créneaux manuels), rappels.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { SetupFrame } from '@/components/recitation/SetupSteps';
import { loadDraft, saveDraft, type ProgramDraft } from '@/lib/recitation/draft';
import { WEEKDAY_SHORT } from '@/lib/recitation/labels';
import { formatTime, parseTime, slotsForWeekday } from '@/lib/recitation/schedule';
import type { Slot } from '@/lib/recitation/types';

const FREQUENCIES: { value: number | null; label: string }[] = [
  { value: 60, label: 'Toutes les heures' },
  { value: 120, label: 'Toutes les 2 heures' },
  { value: 180, label: 'Toutes les 3 heures' },
  { value: 240, label: 'Toutes les 4 heures' },
  { value: -1, label: 'Fréquence personnalisée' },
  { value: null, label: 'Créneaux saisis manuellement' },
];

function minToInput(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export default function HorairesPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [customFreq, setCustomFreq] = useState(90);
  const [manualStart, setManualStart] = useState('07:00');
  const [manualEnd, setManualEnd] = useState('08:00');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const d = loadDraft();
    setDraft(d);
    const f = d.schedule.hours.frequencyMin;
    if (f != null && ![60, 120, 180, 240].includes(f)) setCustomFreq(f);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const update = (next: ProgramDraft) => {
    setDraft(next);
    saveDraft(next);
  };

  const slots = useMemo(() => {
    if (!draft) return [];
    const day = draft.schedule.activeWeekdays[0] ?? 1;
    return slotsForWeekday(draft.schedule, day);
  }, [draft]);

  if (!draft) return <AppShell><div /></AppShell>;
  const { schedule } = draft;
  const freq = schedule.hours.frequencyMin;
  const isCustomFreq = freq != null && ![60, 120, 180, 240].includes(freq);

  const setHours = (patch: Partial<typeof schedule.hours>) =>
    update({ ...draft, schedule: { ...schedule, hours: { ...schedule.hours, ...patch } } });

  const toggleDay = (d: number) => {
    const set = new Set(schedule.activeWeekdays);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    update({ ...draft, schedule: { ...schedule, activeWeekdays: [...set].sort() } });
  };

  const addManualSlot = () => {
    const a = parseTime(manualStart);
    const b = parseTime(manualEnd);
    if (a == null || b == null || b <= a) return;
    const manualSlots: Slot[] = [...(schedule.hours.manualSlots ?? []), { startMin: a, endMin: b }];
    setHours({ manualSlots });
  };

  return (
    <AppShell>
      <SetupFrame
        step={2}
        title="Jours et horaires"
        subtitle="Quand récitez-vous ? L’objectif du jour sera réparti entre ces créneaux."
        canContinue={schedule.activeWeekdays.length > 0 && slots.length > 0}
        onContinue={() => router.push('/recitation/repartition')}
      >
        {/* Jours actifs */}
        <section className="ds-card p-4 md:p-5 mb-4">
          <p className="text-sm font-extrabold mb-2.5">Jours actifs</p>
          <div className="flex gap-1.5 flex-wrap">
            {WEEKDAY_SHORT.map((label, d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`px-3.5 py-2 rounded-full text-[13px] font-bold transition-colors ${
                  schedule.activeWeekdays.includes(d)
                    ? 'bg-[var(--ds-green)] text-white'
                    : 'border border-[var(--ds-divider)] text-[var(--ds-n600)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Plage horaire + fréquence */}
        <section className="ds-card p-4 md:p-5 mb-4">
          <p className="text-sm font-extrabold mb-2.5">Plage de récitation</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <label className="block">
              <span className="text-xs font-bold text-[var(--ds-n600)]">Début de journée</span>
              <input
                type="time"
                value={minToInput(schedule.hours.startMin)}
                onChange={(e) => {
                  const v = parseTime(e.target.value);
                  if (v != null) setHours({ startMin: v });
                }}
                className="mt-1 w-full rounded-xl border border-[var(--ds-divider)] px-3 py-2.5 text-sm bg-white"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-[var(--ds-n600)]">Fin de journée</span>
              <input
                type="time"
                value={minToInput(schedule.hours.endMin)}
                onChange={(e) => {
                  const v = parseTime(e.target.value);
                  if (v != null) setHours({ endMin: v });
                }}
                className="mt-1 w-full rounded-xl border border-[var(--ds-divider)] px-3 py-2.5 text-sm bg-white"
              />
            </label>
          </div>

          <p className="text-sm font-extrabold mb-2">Fréquence des créneaux</p>
          <div className="flex flex-col gap-1.5">
            {FREQUENCIES.map((f) => {
              const active =
                f.value === -1 ? isCustomFreq : f.value === null ? freq === null : freq === f.value;
              return (
                <label key={String(f.value)} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="freq"
                    checked={active}
                    onChange={() =>
                      setHours({ frequencyMin: f.value === -1 ? customFreq : f.value })
                    }
                    className="accent-[var(--ds-gold)]"
                  />
                  <span className="text-sm font-semibold">{f.label}</span>
                  {f.value === -1 && active && (
                    <span className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={15}
                        step={15}
                        value={customFreq}
                        onChange={(e) => {
                          const v = Math.max(15, Number(e.target.value) || 15);
                          setCustomFreq(v);
                          setHours({ frequencyMin: v });
                        }}
                        className="w-20 rounded-lg border border-[var(--ds-divider)] px-2 py-1 text-sm"
                      />
                      <span className="text-xs text-[var(--ds-n500)]">min</span>
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          {freq === null && (
            <div className="mt-3 pt-3 border-t border-[var(--ds-divider)]">
              <div className="flex flex-wrap gap-2 mb-2.5">
                {(schedule.hours.manualSlots ?? []).map((s, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-sage-100)] px-3 py-1.5 text-[13px] font-bold text-[var(--ds-green)]"
                  >
                    {formatTime(s.startMin)} – {formatTime(s.endMin)}
                    <button
                      type="button"
                      onClick={() =>
                        setHours({ manualSlots: (schedule.hours.manualSlots ?? []).filter((_, j) => j !== i) })
                      }
                      className="text-[var(--ds-n500)] font-extrabold"
                      aria-label="Retirer ce créneau"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="time" value={manualStart} onChange={(e) => setManualStart(e.target.value)} className="rounded-xl border border-[var(--ds-divider)] px-3 py-2 text-sm bg-white" />
                <span className="text-[var(--ds-n500)]">→</span>
                <input type="time" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} className="rounded-xl border border-[var(--ds-divider)] px-3 py-2 text-sm bg-white" />
                <button type="button" onClick={addManualSlot} className="ds-btn-ghost px-4 py-2 text-sm">
                  Ajouter
                </button>
              </div>
            </div>
          )}

          {/* Aperçu des créneaux */}
          {slots.length > 0 && (
            <p className="text-[13px] text-[var(--ds-n600)] mt-3.5 pt-3 border-t border-[var(--ds-divider)]">
              {slots.length} créneau{slots.length > 1 ? 'x' : ''} par jour :{' '}
              {slots.map((s) => `${formatTime(s.startMin)}–${formatTime(s.endMin)}`).join(' · ')}
            </p>
          )}
        </section>

        {/* Rappels */}
        <section className="ds-card p-4 md:p-5">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-extrabold">Rappels de récitation</span>
            <input
              type="checkbox"
              checked={schedule.remindersEnabled}
              onChange={(e) =>
                update({ ...draft, schedule: { ...schedule, remindersEnabled: e.target.checked } })
              }
              className="w-5 h-5 accent-[var(--ds-gold)]"
            />
          </label>
          {schedule.remindersEnabled && (
            <label className="flex items-center gap-2 mt-3 text-sm">
              <span className="text-[var(--ds-n600)]">Rappel avant la fin du créneau :</span>
              <select
                value={draft.endReminderMin ?? 'off'}
                onChange={(e) =>
                  update({ ...draft, endReminderMin: e.target.value === 'off' ? null : Number(e.target.value) })
                }
                className="rounded-xl border border-[var(--ds-divider)] px-3 py-1.5 bg-white"
              >
                <option value="off">Désactivé</option>
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
              </select>
            </label>
          )}
        </section>
      </SetupFrame>
    </AppShell>
  );
}
