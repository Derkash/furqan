'use client';

import { useState } from 'react';
import type { ChapterEntry, RangeMode } from '@/utils/exercises/rangeToPages';
import { MODE_MAX } from '@/utils/exercises/rangeToPages';
import type { PlayConfig, SelMode } from '@/utils/exercises/lecturePlaylist';

interface Props {
  initial: PlayConfig;
  chapters: ChapterEntry[];
  onLaunch: (cfg: PlayConfig) => void;
  onClose: () => void;
}

const MODES: { id: SelMode; label: string }[] = [
  { id: 'verse', label: 'Verset' },
  { id: 'page', label: 'Page' },
  { id: 'hizb', label: 'Hizb' },
  { id: 'juz', label: 'Juz' },
  { id: 'surah', label: 'Sourate' },
];

const VERSE_REPEATS = [1, 2, 3, 5, 7, 10];
const SEL_REPEATS = [1, 2, 3, 5, 0]; // 0 = ∞

function NumField({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number | null;
  max: number;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1">{label}</label>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        placeholder={`1–${max}`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full px-3 py-2 text-center font-semibold text-[#2d5016] border-2 border-[#c9a959]/40 rounded-xl bg-white focus:outline-none focus:border-[#2d5016]"
      />
    </div>
  );
}

function SurahSelect({
  label,
  value,
  chapters,
  onChange,
}: {
  label: string;
  value: number;
  chapters: ChapterEntry[];
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-2 py-2 text-sm font-semibold text-[#2d5016] border-2 border-[#c9a959]/40 rounded-xl bg-white focus:outline-none focus:border-[#2d5016]"
      >
        {chapters.length === 0 && <option value={value}>Sourate {value}</option>}
        {chapters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.id} · {c.name_simple}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function PlaybackConfig({ initial, chapters, onLaunch, onClose }: Props) {
  const [cfg, setCfg] = useState<PlayConfig>(initial);
  const set = (patch: Partial<PlayConfig>) => setCfg((c) => ({ ...c, ...patch }));

  const isVerse = cfg.selMode === 'verse';
  const unitMax = isVerse ? 114 : MODE_MAX[cfg.selMode as RangeMode];

  const valid = isVerse
    ? cfg.surahStart >= 1 && cfg.verseStart >= 1 && cfg.surahEnd >= 1 && cfg.verseEnd >= 1
    : cfg.unitStart != null && cfg.unitEnd != null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="bg-[#fdfaf3] rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto border-2 border-[#c9a959]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="sticky top-0 bg-[#2d5016] text-white px-4 py-3 flex items-center justify-between">
          <span className="font-bold">Configurer la lecture</span>
          <button onClick={onClose} aria-label="Fermer" className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Type de plage */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1.5">Plage à réciter</p>
            <div className="flex gap-1 p-1 bg-[#2d5016]/5 rounded-xl">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => set({ selMode: m.id })}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    cfg.selMode === m.id ? 'bg-[#2d5016] text-[#fdfaf3] shadow' : 'text-[#4a7c23] hover:bg-white/50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bornes */}
          {isVerse ? (
            <div className="space-y-2">
              <div className="flex gap-2 items-end">
                <SurahSelect label="Sourate début" value={cfg.surahStart} chapters={chapters} onChange={(v) => set({ surahStart: v, surahEnd: Math.max(v, cfg.surahEnd) })} />
                <NumField label="Verset" value={cfg.verseStart} max={286} onChange={(v) => set({ verseStart: v ?? 1 })} />
              </div>
              <div className="flex gap-2 items-end">
                <SurahSelect label="Sourate fin" value={cfg.surahEnd} chapters={chapters} onChange={(v) => set({ surahEnd: v })} />
                <NumField label="Verset" value={cfg.verseEnd} max={286} onChange={(v) => set({ verseEnd: v ?? 1 })} />
              </div>
              <p className="text-[11px] text-gray-500">De {cfg.surahStart}:{cfg.verseStart} à {cfg.surahEnd}:{cfg.verseEnd}.</p>
            </div>
          ) : cfg.selMode === 'surah' ? (
            <div className="flex gap-2 items-end">
              <SurahSelect label="Début" value={cfg.unitStart ?? 1} chapters={chapters} onChange={(v) => set({ unitStart: v })} />
              <SurahSelect label="Fin" value={cfg.unitEnd ?? 1} chapters={chapters} onChange={(v) => set({ unitEnd: v })} />
            </div>
          ) : (
            <div className="flex gap-3 items-end">
              <NumField label="Début" value={cfg.unitStart} max={unitMax} onChange={(v) => set({ unitStart: v })} />
              <NumField label="Fin" value={cfg.unitEnd} max={unitMax} onChange={(v) => set({ unitEnd: v })} />
            </div>
          )}

          {/* Répéter chaque verset */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1.5">Répéter chaque verset</p>
            <div className="flex gap-1.5 flex-wrap">
              {VERSE_REPEATS.map((n) => (
                <button
                  key={n}
                  onClick={() => set({ verseRepeat: n })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
                    cfg.verseRepeat === n ? 'bg-[#4a7c23] text-white' : 'bg-white border border-[#c9a959]/30 text-[#2d5016]'
                  }`}
                >
                  ×{n}
                </button>
              ))}
            </div>
          </div>

          {/* Répéter toute la sélection */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1.5">Répéter toute la sélection</p>
            <div className="flex gap-1.5 flex-wrap">
              {SEL_REPEATS.map((n) => (
                <button
                  key={n}
                  onClick={() => set({ selectionRepeat: n })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
                    cfg.selectionRepeat === n ? 'bg-[#4a7c23] text-white' : 'bg-white border border-[#c9a959]/30 text-[#2d5016]'
                  }`}
                >
                  {n === 0 ? '∞ boucle' : `×${n}`}
                </button>
              ))}
            </div>
          </div>

          {/* Français entre chaque verset (désactivé en lecture par thème) */}
          <button
            onClick={() => set({ french: !cfg.french })}
            disabled={cfg.byTheme}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all disabled:opacity-40 ${
              cfg.french && !cfg.byTheme ? 'bg-[#4a7c23]/10 border-[#4a7c23]' : 'bg-white border-[#c9a959]/30'
            }`}
          >
            <span className="text-sm font-bold text-[#2d5016]">🎧 Réciter le français après chaque verset</span>
            <span className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-all ${cfg.french && !cfg.byTheme ? 'bg-[#4a7c23] justify-end' : 'bg-gray-300 justify-start'}`}>
              <span className="w-5 h-5 rounded-full bg-white shadow" />
            </span>
          </button>

          {/* Lecture par thème + tafsir Ibn Kathir lu */}
          <button
            onClick={() => set({ byTheme: !cfg.byTheme })}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
              cfg.byTheme ? 'bg-[#4a7c23]/10 border-[#4a7c23]' : 'bg-white border-[#c9a959]/30'
            }`}
          >
            <span className="text-sm font-bold text-[#2d5016] text-left">
              📖 Lecture par thème
              <span className="block text-[11px] font-normal text-gray-500">versets du thème, puis tafsir Ibn Kathir lu à voix haute</span>
            </span>
            <span className={`shrink-0 w-10 h-6 rounded-full flex items-center px-0.5 transition-all ${cfg.byTheme ? 'bg-[#4a7c23] justify-end' : 'bg-gray-300 justify-start'}`}>
              <span className="w-5 h-5 rounded-full bg-white shadow" />
            </span>
          </button>

          {/* Lancer */}
          <button
            onClick={() => onLaunch(cfg)}
            disabled={!valid}
            className="w-full py-3 bg-gradient-to-r from-[#2d5016] to-[#4a7c23] text-white font-bold rounded-xl disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            ▶ Lancer la lecture
          </button>
        </div>
      </div>
    </div>
  );
}
