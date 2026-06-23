'use client';

import { toArabicNumbers } from '@/utils/arabicNumbers';
import {
  MODE_ARABIC,
  MODE_LABELS,
  MODE_MAX,
  type RangeMode,
} from '@/utils/exercises/rangeToPages';

export type { RangeMode };

export interface RangePickerValue {
  mode: RangeMode;
  start: number | null;
  end: number | null;
}

interface RangePickerProps {
  value: RangePickerValue;
  onChange: (next: RangePickerValue) => void;
}

interface NumberFieldProps {
  label: string;
  value: number | null;
  max: number;
  onChange: (v: number | null) => void;
}

function NumberField({ label, value, max, onChange }: NumberFieldProps) {
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-[10px] font-bold uppercase tracking-widest text-[#c9a959] text-center mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          placeholder={`1–${max}`}
          value={value === null ? '' : value}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              onChange(null);
              return;
            }
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : null);
          }}
          className="w-full px-4 py-2.5 text-center text-base font-semibold text-[#2d5016] border-2 border-[#c9a959]/40 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#4a7c23] focus:border-[#2d5016] transition"
        />
        {value !== null && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#c9a959] pointer-events-none"
            dir="rtl"
            style={{ fontFamily: "'Amiri', 'Scheherazade New', serif" }}
          >
            {toArabicNumbers(value)}
          </span>
        )}
      </div>
    </div>
  );
}

export default function RangePicker({ value, onChange }: RangePickerProps) {
  const max = MODE_MAX[value.mode];

  const updateMode = (mode: RangeMode) => {
    // Aucune valeur pré-saisie : on repart sur des champs vides pour le nouveau mode.
    onChange({ mode, start: null, end: null });
  };

  return (
    <div dir="ltr">
      {/* Onglets de mode */}
      <div className="flex gap-1 p-1 bg-[#2d5016]/5 rounded-xl mb-4">
        {(Object.keys(MODE_LABELS) as RangeMode[]).map((m) => {
          const active = value.mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => updateMode(m)}
              className={`
                flex-1 py-2 px-2 rounded-lg text-xs font-bold transition-all
                ${active ? 'bg-[#2d5016] text-[#fdfaf3] shadow-md' : 'text-[#4a7c23] hover:bg-white/50'}
              `}
            >
              <div>{MODE_LABELS[m]}</div>
              <div
                className={`text-[10px] mt-0.5 ${active ? 'text-[#c9a959]' : 'text-[#7a8b3e]/70'}`}
                dir="rtl"
                style={{ fontFamily: "'Amiri', 'Scheherazade New', serif" }}
              >
                {MODE_ARABIC[m]}
              </div>
            </button>
          );
        })}
      </div>

      {/* Champs Début / Fin (saisie libre) */}
      <div className="flex gap-3 items-end">
        <NumberField
          label="Début"
          value={value.start}
          max={max}
          onChange={(v) => onChange({ ...value, start: v })}
        />
        <div className="flex items-center text-[#c9a959] pb-2.5">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </div>
        <NumberField
          label="Fin"
          value={value.end}
          max={max}
          onChange={(v) => onChange({ ...value, end: v })}
        />
      </div>
    </div>
  );
}
