'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import RangePicker, { type RangePickerValue } from '@/components/exercises/RangePicker';
import { useQuranUnits } from '@/hooks/exercises/useQuranUnits';
import { loadHizbQuarters, rangeToGlobalBounds, type HizbQuarter } from '@/utils/quranBounds';
import { fromGlobalAyahNumber, toGlobalAyahNumber } from '@/utils/ayahMapping';
import { getVersePageMap, getVerseText } from '@/utils/vocab/morphology';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import {
  getPlayerState,
  loadLast,
  pausePlayer,
  resumePlayer,
  seekPlayer,
  setPlayerLoop,
  setPlayerRate,
  setPlayerRepeats,
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
const REPEATS = [1, 2, 3, 5];
const PREFS_KEY = 'almuraja3a:ecoute-prefs';

function fmtRate(s: number) {
  return `×${String(s).replace('.', ',')}`;
}

const LAST_GLOBAL = 6236;
function versesCount(surah: number) {
  return (surah >= 114 ? LAST_GLOBAL + 1 : toGlobalAyahNumber(surah + 1, 1)) - toGlobalAyahNumber(surah, 1);
}

/* Pictogrammes dessinés ici (pas de bibliothèque d'icônes). */
const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function PrevIcon() {
  return (
    <svg {...ICON} className="w-7 h-7">
      <path d="M6 5v14" />
      <path d="M19 6l-10 6 10 6z" fill="currentColor" />
    </svg>
  );
}
function NextIcon() {
  return (
    <svg {...ICON} className="w-7 h-7">
      <path d="M18 5v14" />
      <path d="M5 6l10 6-10 6z" fill="currentColor" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg {...ICON} className="w-12 h-12 translate-x-[3px]">
      <path d="M7 4.5l13 7.5-13 7.5z" fill="currentColor" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg {...ICON} className="w-12 h-12">
      <path d="M8 5v14M16 5v14" strokeWidth={4} />
    </svg>
  );
}
function LoopIcon() {
  return (
    <svg {...ICON} className="w-4 h-4">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 12V10a4 4 0 014-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 12v2a4 4 0 01-4 4H3" />
    </svg>
  );
}

function PageIcon() {
  return (
    <svg {...ICON} className="w-4 h-4">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  );
}

function RoundButton({
  onClick,
  label,
  pressed,
  children,
}: {
  onClick: () => void;
  label: string;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={`w-14 h-14 rounded-full border-2 flex items-center justify-center active:scale-95 transition-all ${
        pressed
          ? 'bg-[var(--ds-green)] border-[var(--ds-green)] text-white'
          : 'border-[var(--ds-gold)]/40 text-[var(--ds-green)]'
      }`}
    >
      {children}
    </button>
  );
}

export default function EcoutePage() {
  const { data: units } = useQuranUnits();
  const [player, setPlayer] = useState<PlayerState>(getPlayerState());
  const [range, setRange] = useState<RangePickerValue>({ mode: 'surah', start: null, end: null });
  const [rate, setRate] = useState(1);
  const [repeats, setRepeats] = useState(1);
  const [repeatsInput, setRepeatsInput] = useState('');
  const [quarters, setQuarters] = useState<HizbQuarter[] | null>(null);
  const [versePage, setVersePage] = useState<Record<string, number> | null>(null);
  const [verseText, setVerseText] = useState('');
  const [last, setLast] = useState<ReturnType<typeof loadLast>>(null);
  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  // « Aller au verset » : sourate choisie + numéro saisi, bornés à la plage de la session.
  const [gotoSurah, setGotoSurah] = useState<number | null>(null);
  const [gotoVerse, setGotoVerse] = useState('');
  const [gotoMsg, setGotoMsg] = useState<string | null>(null);

  useEffect(() => subscribePlayer(setPlayer), []);

  // Nouvelle session : on repart de la sourate en cours, saisie vidée.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setGotoSurah(null);
    setGotoVerse('');
    setGotoMsg(null);
  }, [player.start, player.end]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Le texte dépasse-t-il 2 lignes ? (pour n'afficher « Voir plus » qu'à bon escient)
  useEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [verseText, expanded]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.range) setRange(p.range);
        if (p.rate) setRate(p.rate);
        if (p.repeats) setRepeats(p.repeats);
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
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({ range, rate, repeats }));
    } catch {
      /* stockage indisponible */
    }
  }, [range, rate, repeats]);

  // Le moteur est un singleton : le nombre de lectures par verset le suit en permanence.
  useEffect(() => {
    setPlayerRepeats(repeats);
  }, [repeats]);

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

  const cur = player.current != null ? fromGlobalAyahNumber(player.current) : null;

  // Pour chaque page du mushaf : premier et dernier verset (n° global).
  const pageBounds = useMemo(() => {
    const m = new Map<number, { lo: number; hi: number }>();
    if (!versePage) return m;
    for (const [key, page] of Object.entries(versePage)) {
      const [su, ve] = key.split(':').map(Number);
      if (!su || !ve) continue;
      const g = toGlobalAyahNumber(su, ve);
      const b = m.get(page);
      if (!b) m.set(page, { lo: g, hi: g });
      else {
        if (g < b.lo) b.lo = g;
        if (g > b.hi) b.hi = g;
      }
    }
    return m;
  }, [versePage]);
  const curPage = cur && versePage ? versePage[`${cur.surah}:${cur.verse}`] : undefined;
  const curPageBounds = curPage != null ? pageBounds.get(curPage) : undefined;

  // Boucle page : si l'on change de page (saut, verset suivant…), la boucle suit la page en cours.
  useEffect(() => {
    if (player.loop !== 'page' || !curPageBounds) return;
    const lo = Math.max(player.start, curPageBounds.lo);
    const hi = Math.min(player.end, curPageBounds.hi);
    if (lo !== player.loopLo || hi !== player.loopHi) setPlayerLoop('page', lo, hi);
  }, [player.loop, player.loopLo, player.loopHi, player.start, player.end, curPageBounds]);

  const toggleLoop = (mode: 'verse' | 'page') => {
    if (player.loop === mode) {
      setPlayerLoop('off');
      return;
    }
    if (mode === 'page') {
      if (!curPageBounds) return;
      setPlayerLoop('page', Math.max(player.start, curPageBounds.lo), Math.min(player.end, curPageBounds.hi));
    } else {
      setPlayerLoop('verse');
    }
  };

  // Bornes au verset près de la plage choisie.
  const bounds = useMemo(
    () => rangeToGlobalBounds(range.mode, range.start, range.end, quarters, versePage),
    [range, quarters, versePage]
  );

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


  // Sourates couvertes par la session et bornes de versets pour la sourate choisie.
  const sessStart = fromGlobalAyahNumber(player.start);
  const sessEnd = fromGlobalAyahNumber(player.end);
  const sessSurahs: number[] = [];
  for (let sIdx = sessStart.surah; sIdx <= sessEnd.surah; sIdx++) sessSurahs.push(sIdx);
  const gotoS = gotoSurah ?? cur?.surah ?? sessStart.surah;
  const gotoMin = gotoS === sessStart.surah ? sessStart.verse : 1;
  const gotoMax = gotoS === sessEnd.surah ? sessEnd.verse : versesCount(gotoS);

  const goToVerse = () => {
    const v = parseInt(gotoVerse, 10);
    if (!Number.isFinite(v) || v < gotoMin || v > gotoMax) {
      setGotoMsg(`Entre un numéro entre ${toArabicNumbers(gotoMin)} et ${toArabicNumbers(gotoMax)} pour ${chapterName(gotoS)}.`);
      return;
    }
    setGotoMsg(null);
    setGotoVerse('');
    seekPlayer(toGlobalAyahNumber(gotoS, v));
  };
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
                {player.repeats > 1 && player.loop !== 'verse' ? ` ${player.repeatIndex + 1}/${player.repeats}` : ''}
                {player.loop === 'verse' ? ' · boucle verset' : player.loop === 'page' && curPage != null ? ` · boucle page ${curPage}` : ''}
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
            {/* Aller directement à un verset de la plage */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                goToVerse();
              }}
              className="flex items-center gap-2 mb-4"
            >
              {sessSurahs.length > 1 ? (
                <select
                  value={gotoS}
                  onChange={(e) => {
                    setGotoSurah(Number(e.target.value));
                    setGotoMsg(null);
                  }}
                  aria-label="Sourate"
                  className="flex-1 min-w-0 h-11 px-2 rounded-xl border-2 border-[var(--ds-gold)]/40 bg-white text-sm font-bold text-[var(--ds-green)]"
                >
                  {sessSurahs.map((sNum) => (
                    <option key={sNum} value={sNum}>
                      {sNum}. {chapterName(sNum)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="flex-1 min-w-0 text-sm font-bold text-[var(--ds-green)] truncate">{chapterName(gotoS)}</span>
              )}
              <input
                type="number"
                inputMode="numeric"
                min={gotoMin}
                max={gotoMax}
                value={gotoVerse}
                onChange={(e) => {
                  setGotoVerse(e.target.value);
                  setGotoMsg(null);
                }}
                placeholder={`verset ${gotoMin}–${gotoMax}`}
                aria-label="Numéro de verset"
                className="w-32 h-11 px-3 rounded-xl border-2 border-[var(--ds-gold)]/40 bg-white text-sm font-bold tabular-nums text-[var(--ds-text)] placeholder:font-normal placeholder:text-[var(--ds-n500)]"
              />
              <button
                type="submit"
                disabled={!gotoVerse}
                className="h-11 px-4 rounded-xl bg-[var(--ds-sage)] text-white text-sm font-bold disabled:opacity-40 active:scale-95 transition-all"
              >
                Aller
              </button>
            </form>
            {gotoMsg && <p className="text-xs text-[#7a3030] -mt-2 mb-3">{gotoMsg}</p>}
            {/* Contrôles : au-dessus du texte, donc jamais déplacés par la longueur du verset */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <RoundButton onClick={() => skip(-1)} label="Verset précédent">
                <PrevIcon />
              </RoundButton>
              <button
                onClick={() => (player.playing ? pausePlayer() : resumePlayer())}
                aria-label={player.playing ? 'Pause' : 'Lecture'}
                className="w-[88px] h-[88px] rounded-full bg-[var(--ds-green)] text-white flex items-center justify-center shadow-lg shadow-[var(--ds-green)]/25 active:scale-95 transition-all"
              >
                {player.playing ? <PauseIcon /> : <PlayIcon />}
              </button>
              <RoundButton onClick={() => skip(1)} label="Verset suivant">
                <NextIcon />
              </RoundButton>
            </div>
            {/* Répétition : verset en cours ou page du mushaf en cours */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="ds-kicker">Répéter</span>
              <button
                onClick={() => toggleLoop('verse')}
                aria-pressed={player.loop === 'verse'}
                className={`h-10 px-4 rounded-full border-2 flex items-center gap-1.5 text-sm font-bold active:scale-95 transition-all ${
                  player.loop === 'verse'
                    ? 'bg-[var(--ds-green)] border-[var(--ds-green)] text-white'
                    : 'border-[var(--ds-gold)]/40 text-[var(--ds-green)]'
                }`}
              >
                <LoopIcon />
                Verset
              </button>
              <button
                onClick={() => toggleLoop('page')}
                disabled={!curPageBounds}
                aria-pressed={player.loop === 'page'}
                className={`h-10 px-4 rounded-full border-2 flex items-center gap-1.5 text-sm font-bold active:scale-95 transition-all disabled:opacity-40 ${
                  player.loop === 'page'
                    ? 'bg-[var(--ds-green)] border-[var(--ds-green)] text-white'
                    : 'border-[var(--ds-gold)]/40 text-[var(--ds-green)]'
                }`}
              >
                <LoopIcon />
                <PageIcon />
                Page{curPage != null ? ` ${curPage}` : ''}
              </button>
            </div>
            {verseText && (
              <div className="mb-3">
                <p
                  ref={textRef}
                  dir="rtl"
                  className="text-[var(--ds-text)] text-center"
                  style={{
                    fontFamily: "'UthmanicHafs','Amiri',serif",
                    fontSize: '1.35em',
                    lineHeight: 2,
                    ...(expanded
                      ? {}
                      : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
                  }}
                >
                  {verseText}
                </p>
                {(clamped || expanded) && (
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className="block mx-auto mt-1 text-xs font-bold text-[var(--ds-sage)] underline"
                  >
                    {expanded ? 'Voir moins' : 'Voir plus'}
                  </button>
                )}
              </div>
            )}
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
          <p className="ds-kicker mt-4 mb-2">Lectures par verset</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {REPEATS.map((n) => (
              <button
                key={n}
                onClick={() => {
                  setRepeats(n);
                  setRepeatsInput('');
                }}
                className={`px-3 py-1.5 rounded-full text-sm font-bold tabular-nums transition-colors ${
                  repeats === n ? 'bg-[var(--ds-green)] text-white' : 'bg-[var(--ds-sage-100)] text-[var(--ds-green)]'
                }`}
              >
                ×{n}
              </button>
            ))}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={repeatsInput || (REPEATS.includes(repeats) ? '' : String(repeats))}
              onChange={(e) => {
                setRepeatsInput(e.target.value);
                const v = parseInt(e.target.value, 10);
                if (v >= 1 && v <= 99) setRepeats(v);
              }}
              placeholder="autre"
              aria-label="Nombre de lectures par verset"
              className={`w-20 h-9 px-3 rounded-full border-2 text-sm font-bold tabular-nums text-center placeholder:font-normal ${
                !REPEATS.includes(repeats)
                  ? 'bg-[var(--ds-green)] border-[var(--ds-green)] text-white placeholder:text-white/70'
                  : 'border-[var(--ds-gold)]/40 text-[var(--ds-green)] placeholder:text-[var(--ds-n500)]'
              }`}
            />
          </div>
          <p className="text-xs text-[var(--ds-n600)] mt-2">
            Chaque verset de la plage est lu {repeats > 1 ? `${repeats} fois` : 'une fois'} avant de passer au suivant.
          </p>
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
