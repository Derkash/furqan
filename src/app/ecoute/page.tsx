'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import RangePicker, { type RangePickerValue } from '@/components/exercises/RangePicker';
import { useQuranUnits } from '@/hooks/exercises/useQuranUnits';
import { loadHizbQuarters, unitToGlobalBounds, type HizbQuarter } from '@/utils/quranBounds';
import { fromGlobalAyahNumber, toGlobalAyahNumber } from '@/utils/ayahMapping';
import { getVersePageMap, getVerseText } from '@/utils/vocab/morphology';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import {
  getPlayerState,
  loadLast,
  pausePlayer,
  resumePlayer,
  seekPlayer,
  setPlayerRate,
  setSurahNames,
  skip,
  startPlayer,
  stopPlayer,
  subscribePlayer,
  type PlayerState,
} from '@/utils/continuousPlayer';

/**
 * Écoute continue : récitation sans interruption d'une plage, à la vitesse
 * choisie, qui continue écran verrouillé / app réduite. Totalement séparée de
 * la Lecture (pas de suivi de page). Moteur : utils/continuousPlayer.
 */

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const PREFS_KEY = 'almuraja3a:ecoute-prefs';

function fmtRate(s: number) {
  return `×${String(s).replace('.', ',')}`;
}

export default function EcoutePage() {
  const { data: units } = useQuranUnits();
  const [player, setPlayer] = useState<PlayerState>(getPlayerState());
  const [range, setRange] = useState<RangePickerValue>({ mode: 'surah', start: null, end: null });
  const [rate, setRate] = useState(1);
  const [quarters, setQuarters] = useState<HizbQuarter[] | null>(null);
  const [versePage, setVersePage] = useState<Record<string, number> | null>(null);
  const [verseText, setVerseText] = useState('');
  const [last, setLast] = useState<ReturnType<typeof loadLast>>(null);
  const [seekPreview, setSeekPreview] = useState<number | null>(null);

  useEffect(() => subscribePlayer(setPlayer), []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.range) setRange(p.range);
        if (p.rate) setRate(p.rate);
      }
    } catch {
      /* préférences illisibles */
    }
    setLast(loadLast());
    loadHizbQuarters().then(setQuarters);
    getVersePageMap().then(setVersePage);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({ range, rate }));
    } catch {
      /* stockage indisponible */
    }
  }, [range, rate]);

  // Noms de sourates pour l'écran verrouillé.
  useEffect(() => {
    if (!units) return;
    const names: Record<number, string> = {};
    for (const c of units.chapters) names[c.id] = c.name_simple;
    setSurahNames(names);
  }, [units]);

  // Texte arabe du verset en cours (affichage seul, ne pilote rien).
  const currentGlobal = player.current;
  useEffect(() => {
    if (currentGlobal == null) return;
    const { surah, verse } = fromGlobalAyahNumber(currentGlobal);
    let cancelled = false;
    getVerseText(`${surah}:${verse}`).then((t) => !cancelled && setVerseText(t));
    return () => {
      cancelled = true;
    };
  }, [currentGlobal]);

  // Bornes au verset près de la plage choisie.
  const bounds = useMemo(() => {
    const { mode, start, end } = range;
    if (start == null || end == null) return null;
    if (mode === 'page') {
      if (!versePage) return null;
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      let a = Infinity;
      let b = -Infinity;
      for (const [vk, p] of Object.entries(versePage)) {
        if (p < lo || p > hi) continue;
        const [s, v] = vk.split(':').map(Number);
        const g = toGlobalAyahNumber(s, v);
        if (g < a) a = g;
        if (g > b) b = g;
      }
      return Number.isFinite(a) ? { startGlobal: a, endGlobal: b } : null;
    }
    return unitToGlobalBounds(mode, start, end, quarters);
  }, [range, quarters, versePage]);

  const chapterName = (surah: number) =>
    units?.chapters.find((c) => c.id === surah)?.name_simple ?? `Sourate ${surah}`;
  const label = (g: number) => {
    const { surah, verse } = fromGlobalAyahNumber(g);
    return `${chapterName(surah)} ${surah}:${verse}`;
  };

  const launch = () => {
    if (!bounds) return;
    startPlayer(bounds.startGlobal, bounds.endGlobal, rate);
  };

  const commitSeek = () => {
    if (seekPreview == null) return;
    const target = seekPreview;
    setSeekPreview(null);
    if (target !== player.current) seekPlayer(target);
  };

  const changeRate = (r: number) => {
    setRate(r);
    if (player.active) setPlayerRate(r);
  };

  const cur = player.current != null ? fromGlobalAyahNumber(player.current) : null;
  const progress =
    player.current != null && player.end > player.start
      ? (player.current - player.start) / (player.end - player.start)
      : 0;

  return (
    <AppShell>
      <div className="pb-8 max-w-xl mx-auto" dir="ltr">
        <header className="mb-5">
          <h1 className="ds-title text-2xl md:text-3xl">Écoute continue</h1>
          <p className="text-[var(--ds-n600)] mt-1 text-sm">
            La récitation d’Al-Husary enchaîne sans interruption sur toute la plage, à ta vitesse. Elle
            continue écran verrouillé ou app réduite, et se pilote depuis l’écran verrouillé.
          </p>
        </header>

        {/* Session en cours */}
        {player.active && cur && (
          <section className="ds-card p-4 mb-5">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <p className="font-bold text-[var(--ds-green)]">
                {chapterName(cur.surah)} · verset {toArabicNumbers(cur.verse)}
              </p>
              <span className="text-[11px] text-[var(--ds-n500)] tabular-nums">
                {player.loading ? 'chargement…' : player.playing ? 'en lecture' : 'en pause'}
              </span>
            </div>
            <p className="text-[11px] text-[var(--ds-n500)] mb-3">
              {label(player.start)} → {label(player.end)}
            </p>
            {/* Curseur : glisser pour avancer / reculer dans la plage */}
            {player.end > player.start ? (
              <div className="mb-3">
                <input
                  type="range"
                  min={player.start}
                  max={player.end}
                  step={1}
                  value={seekPreview ?? player.current ?? player.start}
                  aria-label="Position dans la plage"
                  onChange={(e) => setSeekPreview(Number(e.target.value))}
                  onPointerUp={commitSeek}
                  onTouchEnd={commitSeek}
                  onKeyUp={commitSeek}
                  onBlur={() => setSeekPreview(null)}
                  className="w-full h-5 accent-[var(--ds-green)] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[var(--ds-n500)] tabular-nums">
                  <span>{label(player.start)}</span>
                  {seekPreview != null && <span className="font-bold text-[var(--ds-green)]">→ {label(seekPreview)}</span>}
                  <span>{label(player.end)}</span>
                </div>
              </div>
            ) : (
              <div className="h-1.5 bg-[var(--ds-gold)]/20 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-[var(--ds-sage)] transition-all" style={{ width: `${progress * 100}%` }} />
              </div>
            )}
            {verseText && (
              <p
                dir="rtl"
                className="text-[var(--ds-text)] text-center mb-4"
                style={{ fontFamily: "'UthmanicHafs','Amiri',serif", fontSize: '1.35em', lineHeight: 2 }}
              >
                {verseText}
              </p>
            )}
            <div className="flex items-center justify-center gap-3 mb-3">
              <button
                onClick={() => skip(-1)}
                aria-label="Verset précédent"
                className="w-11 h-11 rounded-full border-2 border-[var(--ds-gold)]/40 text-[var(--ds-green)] font-bold"
              >
                ⏮
              </button>
              <button
                onClick={() => (player.playing ? pausePlayer() : resumePlayer())}
                aria-label={player.playing ? 'Pause' : 'Lecture'}
                className="w-16 h-16 rounded-full bg-[var(--ds-green)] text-white text-2xl font-bold active:scale-95 transition-all"
              >
                {player.playing ? '❚❚' : '▶'}
              </button>
              <button
                onClick={() => skip(1)}
                aria-label="Verset suivant"
                className="w-11 h-11 rounded-full border-2 border-[var(--ds-gold)]/40 text-[var(--ds-green)] font-bold"
              >
                ⏭
              </button>
            </div>
            {player.error && <p className="text-xs text-red-600 text-center mb-2">{player.error}</p>}
            <div className="text-center">
              <button onClick={stopPlayer} className="text-xs font-bold text-[#7a3030] underline">
                Arrêter la session
              </button>
            </div>
          </section>
        )}

        {/* Vitesse (s'applique aussi à la session en cours) */}
        <section className="ds-card p-4 mb-5">
          <p className="ds-kicker mb-2">Vitesse</p>
          <div className="flex flex-wrap gap-1.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => changeRate(s)}
                className={`px-3 py-1.5 rounded-full text-sm font-bold tabular-nums transition-colors ${
                  rate === s ? 'bg-[var(--ds-green)] text-white' : 'bg-[var(--ds-sage-100)] text-[var(--ds-green)]'
                }`}
              >
                {fmtRate(s)}
              </button>
            ))}
          </div>
        </section>

        {/* Nouvelle session */}
        <section className="ds-card p-4 mb-5">
          <p className="ds-kicker mb-2">Que veux-tu écouter ?</p>
          <RangePicker value={range} onChange={setRange} chapters={units?.chapters ?? []} />
          <p className="text-xs text-[var(--ds-n600)] mt-2 min-h-[1.2em]">
            {bounds ? `${label(bounds.startGlobal)} → ${label(bounds.endGlobal)} · ${toArabicNumbers(bounds.endGlobal - bounds.startGlobal + 1)} versets` : 'Choisis un début et une fin.'}
          </p>
          <button
            onClick={launch}
            disabled={!bounds}
            className="w-full mt-3 py-3 bg-gradient-to-r from-[var(--ds-green)] to-[var(--ds-sage)] text-white font-bold rounded-xl disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            ▶ Lancer l’écoute
          </button>
          {!player.active && last && (
            <button
              onClick={() => {
                setRate(last.rate);
                startPlayer(last.start, last.end, last.rate, last.n);
              }}
              className="w-full mt-2 py-2.5 border-2 border-[var(--ds-gold)]/40 text-[var(--ds-sage)] font-bold rounded-xl text-sm"
            >
              Reprendre à {label(last.n)}
            </button>
          )}
        </section>
      </div>
    </AppShell>
  );
}
