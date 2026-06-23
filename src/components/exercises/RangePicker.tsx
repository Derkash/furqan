'use client';

import { toArabicNumbers } from '@/utils/arabicNumbers';
import {
  MODE_ARABIC,
  MODE_LABELS,
  MODE_MAX,
  type ChapterEntry,
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
  /** Liste des 114 sourates (numéro + nom) pour le mode "Sourate" en liste déroulante. */
  chapters?: ChapterEntry[];
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

interface SurahFieldProps {
  label: string;
  value: number | null;
  chapters: ChapterEntry[];
  onChange: (v: number | null) => void;
}

function SurahField({ label, value, chapters, onChange }: SurahFieldProps) {
  const loading = chapters.length === 0;
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-[10px] font-bold uppercase tracking-widest text-[#c9a959] text-center mb-1.5">
        {label}
      </label>
      <select
        disabled={loading}
        value={value === null ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? null : Number(raw));
        }}
        className="w-full px-3 py-2.5 text-sm font-semibold text-[#2d5016] border-2 border-[#c9a959]/40 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#4a7c23] focus:border-[#2d5016] transition disabled:opacity-60"
      >
        <option value="">{loading ? 'Chargement…' : '— Sourate —'}</option>
        {chapters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.id} · {c.name_simple} — {c.name_arabic}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function RangePicker({ value, onChange, chapters = [] }: RangePickerProps) {
  const max = MODE_MAX[value.mode];
  const isSurah = value.mode === 'surah';

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

      {/* Champs Début / Fin : liste déroulante pour Sourate, saisie libre sinon */}
      <div className="flex gap-3 items-end">
        {isSurah ? (
          <SurahField
            label="Début"
            value={value.start}
            chapters={chapters}
            onChange={(v) => onChange({ ...value, start: v })}
          />
        ) : (
          <NumberField
            label="Début"
            value={value.start}
            max={max}
            onChange={(v) => onChange({ ...value, start: v })}
          />
        )}
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
        {isSurah ? (
          <SurahField
            label="Fin"
            value={value.end}
            chapters={chapters}
            onChange={(v) => onChange({ ...value, end: v })}
          />
        ) : (
          <NumberField
            label="Fin"
            value={value.end}
            max={max}
            onChange={(v) => onChange({ ...value, end: v })}
          />
        )}
      </div>
    </div>
  );
}
