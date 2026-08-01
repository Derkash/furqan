'use client';

import { useState } from 'react';
import type { ChapterEntry, RangeMode, QuranUnits } from '@/utils/exercises/rangeToPages';
import { MODE_MAX } from '@/utils/exercises/rangeToPages';
import type { PlayConfig, SelMode } from '@/utils/exercises/lecturePlaylist';

interface Props {
  initial: PlayConfig;
  chapters: ChapterEntry[];
  units: QuranUnits | null;
  currentSurah: number;
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

type EndBoundary = 'none' | 'juz' | 'hizb' | 'surah';

// Brouillon local : bornes vidables (null) tant que rien n'est saisi.
interface Draft {
  selMode: SelMode;
  surahStart: number;
  verseStart: number | null;
  surahEnd: number;
  verseEnd: number | null;
  unitStart: number | null;
  unitEnd: number | null;
  verseRepeat: number;
  selectionRepeat: number;
  french: boolean;
  byTheme: boolean;
  endBoundary: EndBoundary; // Page : « jusqu'à la fin du juz / hizb / sourate »
}

/** Dernière page du juz / hizb / sourate contenant `startPage`. */
function boundaryEndPage(
  startPage: number | null,
  b: EndBoundary,
  units: QuranUnits | null,
  chapters: ChapterEntry[]
): number | null {
  if (startPage == null || b === 'none') return null;
  if (b === 'surah') {
    const c = chapters.find((x) => startPage >= x.pages[0] && startPage <= x.pages[1]);
    return c ? c.pages[1] : null;
  }
  const arr = b === 'juz' ? units?.juzs : units?.hizbs;
  const u = arr?.find((x) => startPage >= x.startPage && startPage <= x.endPage);
  return u ? u.endPage : null;
}

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

export default function PlaybackConfig({ initial, chapters, units, currentSurah, onLaunch, onClose }: Props) {
  const [d, setD] = useState<Draft>(() => ({
    selMode: initial.selMode,
    // Sourate : proposée = sourate actuellement ouverte. Autres modes : champs vides.
    surahStart: currentSurah,
    verseStart: null,
    surahEnd: currentSurah,
    verseEnd: null,
    unitStart: initial.selMode === 'surah' ? currentSurah : null,
    unitEnd: initial.selMode === 'surah' ? currentSurah : null,
    verseRepeat: initial.verseRepeat,
    selectionRepeat: initial.selectionRepeat,
    french: initial.french,
    byTheme: initial.byTheme,
    endBoundary: 'none',
  }));
  const set = (patch: Partial<Draft>) => setD((c) => ({ ...c, ...patch }));

  const changeMode = (m: SelMode) =>
    setD((c) => ({
      ...c,
      selMode: m,
      endBoundary: 'none',
      surahStart: currentSurah,
      surahEnd: currentSurah,
      verseStart: null,
      verseEnd: null,
      unitStart: m === 'surah' ? currentSurah : null,
      unitEnd: m === 'surah' ? currentSurah : null,
    }));

  const isVerse = d.selMode === 'verse';
  const isSurah = d.selMode === 'surah';
  const isPage = d.selMode === 'page';
  const unitMax = isVerse ? 114 : MODE_MAX[d.selMode as RangeMode];

  const computedEnd = isPage && d.endBoundary !== 'none' ? boundaryEndPage(d.unitStart, d.endBoundary, units, chapters) : null;
  const boundaryOn = isPage && d.endBoundary !== 'none';

  const valid = isVerse
    ? d.surahStart >= 1 && d.surahEnd >= 1
    : boundaryOn
      ? d.unitStart != null && computedEnd != null
      : d.unitStart != null && d.unitEnd != null;

  const launch = () => {
    onLaunch({
      selMode: d.selMode,
      surahStart: d.surahStart,
      verseStart: d.verseStart ?? 1,
      surahEnd: d.surahEnd,
      verseEnd: d.verseEnd ?? 1,
      unitStart: d.unitStart,
      unitEnd: boundaryOn ? computedEnd : d.unitEnd,
      verseRepeat: d.verseRepeat,
      selectionRepeat: d.selectionRepeat,
      french: d.french,
      byTheme: d.byTheme,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3" dir="ltr" onClick={onClose}>
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
                  onClick={() => changeMode(m.id)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    d.selMode === m.id ? 'bg-[#2d5016] text-[#fdfaf3] shadow' : 'text-[#4a7c23] hover:bg-white/50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bornes (début à gauche, fin à droite) */}
          {isVerse ? (
            <div className="space-y-2">
              <div className="flex gap-2 items-end">
                <SurahSelect label="Sourate début" value={d.surahStart} chapters={chapters} onChange={(v) => set({ surahStart: v, surahEnd: Math.max(v, d.surahEnd) })} />
                <NumField label="Verset début" value={d.verseStart} max={286} onChange={(v) => set({ verseStart: v })} />
              </div>
              <div className="flex gap-2 items-end">
                <SurahSelect label="Sourate fin" value={d.surahEnd} chapters={chapters} onChange={(v) => set({ surahEnd: v })} />
                <NumField label="Verset fin" value={d.verseEnd} max={286} onChange={(v) => set({ verseEnd: v })} />
              </div>
            </div>
          ) : isSurah ? (
            <div className="flex gap-2 items-end">
              <SurahSelect label="Début" value={d.unitStart ?? currentSurah} chapters={chapters} onChange={(v) => set({ unitStart: v })} />
              <SurahSelect label="Fin" value={d.unitEnd ?? currentSurah} chapters={chapters} onChange={(v) => set({ unitEnd: v })} />
            </div>
          ) : (
            <div className="flex gap-3 items-end">
              <NumField label="Début" value={d.unitStart} max={unitMax} onChange={(v) => set({ unitStart: v })} />
              {!boundaryOn && <NumField label="Fin" value={d.unitEnd} max={unitMax} onChange={(v) => set({ unitEnd: v })} />}
            </div>
          )}

          {/* Page : aller jusqu'à la fin du juz / hizb / sourate (masque le champ Fin) */}
          {isPage && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1.5">Ou jusqu&apos;à la fin de…</p>
              <div className="flex gap-1.5">
                {([
                  ['juz', 'Fin du juz'],
                  ['hizb', 'Fin du hizb'],
                  ['surah', 'Fin de la sourate'],
                ] as [EndBoundary, string][]).map(([b, label]) => (
                  <button
                    key={b}
                    onClick={() => set({ endBoundary: d.endBoundary === b ? 'none' : b })}
                    className={`flex-1 py-1.5 px-1 rounded-lg text-[11px] font-bold transition-all ${
                      d.endBoundary === b ? 'bg-[#2d5016] text-[#fdfaf3]' : 'bg-white border border-[#c9a959]/30 text-[#2d5016]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {boundaryOn && (
                <p className="text-[11px] text-gray-500 mt-1">
                  {computedEnd ? `De la page ${d.unitStart ?? '—'} à la page ${computedEnd} (incluse).` : 'Saisis d’abord la page de début.'}
                </p>
              )}
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
                    d.verseRepeat === n ? 'bg-[#4a7c23] text-white' : 'bg-white border border-[#c9a959]/30 text-[#2d5016]'
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
                    d.selectionRepeat === n ? 'bg-[#4a7c23] text-white' : 'bg-white border border-[#c9a959]/30 text-[#2d5016]'
                  }`}
                >
                  {n === 0 ? '∞ boucle' : `×${n}`}
                </button>
              ))}
            </div>
          </div>

          {/* Français entre chaque verset (désactivé en lecture par thème) */}
          <button
            onClick={() => set({ french: !d.french })}
            disabled={d.byTheme}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all disabled:opacity-40 ${
              d.french && !d.byTheme ? 'bg-[#4a7c23]/10 border-[#4a7c23]' : 'bg-white border-[#c9a959]/30'
            }`}
          >
            <span className="text-sm font-bold text-[#2d5016]">🎧 Réciter le français après chaque verset</span>
            <span className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-all ${d.french && !d.byTheme ? 'bg-[#4a7c23] justify-end' : 'bg-gray-300 justify-start'}`}>
              <span className="w-5 h-5 rounded-full bg-white shadow" />
            </span>
          </button>

          {/* Lecture par thème + tafsir Ibn Kathir lu */}
          <button
            onClick={() => set({ byTheme: !d.byTheme })}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
              d.byTheme ? 'bg-[#4a7c23]/10 border-[#4a7c23]' : 'bg-white border-[#c9a959]/30'
            }`}
          >
            <span className="text-sm font-bold text-[#2d5016] text-left">
              📖 Lecture par thème
              <span className="block text-[11px] font-normal text-gray-500">versets du thème, puis tafsir Ibn Kathir lu à voix haute</span>
            </span>
            <span className={`shrink-0 w-10 h-6 rounded-full flex items-center px-0.5 transition-all ${d.byTheme ? 'bg-[#4a7c23] justify-end' : 'bg-gray-300 justify-start'}`}>
              <span className="w-5 h-5 rounded-full bg-white shadow" />
            </span>
          </button>

          {/* Lancer */}
          <button
            onClick={launch}
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
