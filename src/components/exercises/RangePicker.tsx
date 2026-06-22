'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toArabicNumbers } from '@/utils/arabicNumbers';

export type RangeMode = 'page' | 'hizb' | 'juz' | 'surah';

interface ChapterEntry {
  id: number;
  name_arabic: string;
  name_simple: string;
  pages: [number, number];
}

interface UnitEntry {
  hizb?: number;
  juz?: number;
  startPage: number;
  endPage: number;
}

interface PickerItem {
  value: number;
  label: string;
  subLabel?: string;
  arabicLabel?: string;
}

interface RangePickerProps {
  value: { mode: RangeMode; start: number; end: number };
  onChange: (next: { mode: RangeMode; start: number; end: number; startPage: number; endPage: number }) => void;
}

interface DataState {
  chapters: ChapterEntry[];
  hizbs: UnitEntry[];
  juzs: UnitEntry[];
}

const TAB_LABELS: Record<RangeMode, string> = {
  page: 'Page',
  hizb: 'Hizb',
  juz: 'Juz',
  surah: 'Sourate',
};

const TAB_ARABIC: Record<RangeMode, string> = {
  page: 'صفحة',
  hizb: 'حزب',
  juz: 'جزء',
  surah: 'سورة',
};

function buildItems(mode: RangeMode, data: DataState | null): PickerItem[] {
  if (!data) return [];
  if (mode === 'page') {
    return Array.from({ length: 604 }, (_, i) => ({
      value: i + 1,
      label: `Page ${i + 1}`,
      arabicLabel: toArabicNumbers(i + 1),
    }));
  }
  if (mode === 'hizb') {
    return data.hizbs.map((h) => ({
      value: h.hizb!,
      label: `Hizb ${h.hizb}`,
      subLabel: `p. ${h.startPage}–${h.endPage}`,
      arabicLabel: toArabicNumbers(h.hizb!),
    }));
  }
  if (mode === 'juz') {
    return data.juzs.map((j) => ({
      value: j.juz!,
      label: `Juz ${j.juz}`,
      subLabel: `p. ${j.startPage}–${j.endPage}`,
      arabicLabel: toArabicNumbers(j.juz!),
    }));
  }
  // surah
  return data.chapters.map((c) => ({
    value: c.id,
    label: c.name_simple,
    subLabel: `p. ${c.pages[0]}${c.pages[0] !== c.pages[1] ? `–${c.pages[1]}` : ''}`,
    arabicLabel: c.name_arabic,
  }));
}

function unitToPageRange(
  mode: RangeMode,
  start: number,
  end: number,
  data: DataState | null
): { startPage: number; endPage: number } {
  if (!data) return { startPage: 1, endPage: 1 };
  if (mode === 'page') return { startPage: start, endPage: end };
  if (mode === 'hizb') {
    const lo = data.hizbs.find((h) => h.hizb === Math.min(start, end))!;
    const hi = data.hizbs.find((h) => h.hizb === Math.max(start, end))!;
    return { startPage: lo.startPage, endPage: hi.endPage };
  }
  if (mode === 'juz') {
    const lo = data.juzs.find((j) => j.juz === Math.min(start, end))!;
    const hi = data.juzs.find((j) => j.juz === Math.max(start, end))!;
    return { startPage: lo.startPage, endPage: hi.endPage };
  }
  // surah
  const lo = data.chapters.find((c) => c.id === Math.min(start, end))!;
  const hi = data.chapters.find((c) => c.id === Math.max(start, end))!;
  return { startPage: lo.pages[0], endPage: hi.pages[1] };
}

interface PickerColumnProps {
  items: PickerItem[];
  value: number;
  onChange: (v: number) => void;
  label: string;
}

function PickerColumn({ items, value, onChange, label }: PickerColumnProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Centrer la valeur sélectionnée au montage et quand value change
  useEffect(() => {
    const el = itemRefs.current.get(value);
    if (el && containerRef.current) {
      el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    }
  }, [value]);

  return (
    <div className="flex-1 min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959] text-center mb-1.5">
        {label}
      </div>
      <div
        ref={containerRef}
        className="relative h-44 overflow-y-auto rounded-2xl border-2 border-[#c9a959]/30 bg-gradient-to-b from-white via-[#fdfaf3] to-white"
        style={{
          scrollSnapType: 'y mandatory',
          maskImage:
            'linear-gradient(to bottom, transparent 0, black 30%, black 70%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0, black 30%, black 70%, transparent 100%)',
        }}
      >
        {/* Padding pour permettre au premier/dernier d'atteindre le centre */}
        <div style={{ height: '68px' }} />
        {items.map((it) => {
          const selected = it.value === value;
          return (
            <button
              key={it.value}
              type="button"
              ref={(el) => {
                if (el) itemRefs.current.set(it.value, el);
                else itemRefs.current.delete(it.value);
              }}
              onClick={() => onChange(it.value)}
              className={`
                block w-full text-center py-2 transition-all
                ${selected ? 'scale-100' : 'scale-95 opacity-50 hover:opacity-80'}
              `}
              style={{ scrollSnapAlign: 'center' }}
            >
              <div
                className={`text-base font-semibold leading-tight ${
                  selected ? 'text-[#2d5016]' : 'text-[#4a7c23]/70'
                }`}
              >
                {it.label}
              </div>
              {it.arabicLabel && (
                <div
                  className={`text-xs mt-0.5 ${selected ? 'text-[#c9a959]' : 'text-[#c9a959]/60'}`}
                  dir="rtl"
                  style={{ fontFamily: "'Amiri', 'Scheherazade New', serif" }}
                >
                  {it.arabicLabel}
                </div>
              )}
              {it.subLabel && (
                <div className={`text-[10px] mt-0.5 ${selected ? 'text-[#7a8b3e]' : 'text-gray-400'}`}>
                  {it.subLabel}
                </div>
              )}
            </button>
          );
        })}
        <div style={{ height: '68px' }} />

        {/* Bandes de surlignage de la valeur centrée */}
        <div className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 h-12 rounded-xl border-y border-[#c9a959]/40 bg-[#c9a959]/5" />
      </div>
    </div>
  );
}

export default function RangePicker({ value, onChange }: RangePickerProps) {
  const [data, setData] = useState<DataState | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/qcf-data/chapters.json').then((r) => r.json()),
      fetch('/qcf-data/hizbs.json').then((r) => r.json()),
      fetch('/qcf-data/juzs.json').then((r) => r.json()),
    ])
      .then(([chapters, hizbs, juzs]) => setData({ chapters, hizbs, juzs }))
      .catch(() => {});
  }, []);

  const items = useMemo(() => buildItems(value.mode, data), [value.mode, data]);

  const updateMode = (mode: RangeMode) => {
    // Reset à des valeurs sensées pour le nouveau mode
    let newStart = 1;
    let newEnd = 1;
    if (mode === 'page') {
      newStart = 3;
      newEnd = 10;
    } else if (mode === 'hizb') {
      newStart = 1;
      newEnd = 2;
    } else if (mode === 'juz') {
      newStart = 1;
      newEnd = 1;
    } else if (mode === 'surah') {
      newStart = 2;
      newEnd = 2;
    }
    const { startPage, endPage } = unitToPageRange(mode, newStart, newEnd, data);
    onChange({ mode, start: newStart, end: newEnd, startPage, endPage });
  };

  const updateStart = (v: number) => {
    const next = { mode: value.mode, start: v, end: value.end };
    const { startPage, endPage } = unitToPageRange(next.mode, next.start, next.end, data);
    onChange({ ...next, startPage, endPage });
  };

  const updateEnd = (v: number) => {
    const next = { mode: value.mode, start: value.start, end: v };
    const { startPage, endPage } = unitToPageRange(next.mode, next.start, next.end, data);
    onChange({ ...next, startPage, endPage });
  };

  return (
    <div dir="ltr">
      {/* Tabs mode */}
      <div className="flex gap-1 p-1 bg-[#2d5016]/5 rounded-xl mb-4">
        {(Object.keys(TAB_LABELS) as RangeMode[]).map((m) => {
          const active = value.mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => updateMode(m)}
              className={`
                flex-1 py-2 px-2 rounded-lg text-xs font-bold transition-all
                ${
                  active
                    ? 'bg-[#2d5016] text-[#fdfaf3] shadow-md'
                    : 'text-[#4a7c23] hover:bg-white/50'
                }
              `}
            >
              <div>{TAB_LABELS[m]}</div>
              <div
                className={`text-[10px] mt-0.5 ${active ? 'text-[#c9a959]' : 'text-[#7a8b3e]/70'}`}
                dir="rtl"
                style={{ fontFamily: "'Amiri', 'Scheherazade New', serif" }}
              >
                {TAB_ARABIC[m]}
              </div>
            </button>
          );
        })}
      </div>

      {/* Pickers Start / End */}
      <div className="flex gap-3 items-stretch">
        <PickerColumn items={items} value={value.start} onChange={updateStart} label="Début" />
        <div className="flex items-center text-[#c9a959]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </div>
        <PickerColumn items={items} value={value.end} onChange={updateEnd} label="Fin" />
      </div>
    </div>
  );
}
