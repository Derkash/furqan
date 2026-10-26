'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import RangePicker, { type RangePickerValue } from '@/components/exercises/RangePicker';
import { useQuranUnits } from '@/hooks/exercises/useQuranUnits';
import { loadHizbQuarters, rangeToGlobalBounds, type HizbQuarter } from '@/utils/quranBounds';
import { fromGlobalAyahNumber, SURAH_START_AYAH, TOTAL_AYAHS } from '@/utils/ayahMapping';
import { getVersePageMap, getVerseText } from '@/utils/vocab/morphology';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import { MODE_LABELS } from '@/utils/exercises/rangeToPages';
import {
  fmtClock,
  fmtDuration,
  gapsInBounds,
  isTafsirUser,
  itemsForBounds,
  itemsForVerse,
  loadTafsirItems,
  type TafsirItem,
} from '@/utils/tafsir/tafsirData';
import {
  hydrateTafsirFromRemote,
  setFileDone,
  setTafsirRate,
  subscribeTafsirState,
  type TafsirState,
} from '@/utils/tafsir/tafsirProgress';
import {
  getTafsirPlayer,
  goToTafsir,
  jumpTafsir,
  pauseTafsir,
  resumeTafsir,
  seekTafsir,
  setTafsirPlayerRate,
  setTafsirSurahNames,
  startTafsir,
  stopTafsir,
  subscribeTafsirPlayer,
  type TafsirPlayerState,
} from '@/utils/tafsir/tafsirPlayer';

/**
 * Tafsir audio : cours en français streamés depuis Supabase, découpés par
 * groupes de versets (Al-Baqarah, Al Imran) ou par sourate (Juz 'Amma).
 * Une plage pages / hizb / juz / sourates enchaîne tous les fichiers qui la
 * recoupent, entiers. Progression (écouté, position, dernière session)
 * mémorisée en local + sauvegardée sur le compte.
 */

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const PREFS_KEY = 'almuraja3a:tafsir-prefs';
const ARABIC_STYLE = { fontFamily: "'UthmanicHafs','Amiri',serif", lineHeight: 2 } as const;

const versesCount = (s: number) => (s >= 114 ? TOTAL_AYAHS + 1 : SURAH_START_AYAH[s + 1]) - SURAH_START_AYAH[s];
const fmtRate = (s: number) => `×${String(s).replace('.', ',')}`;

/** Début d'un verset (n premiers mots) pour l'en-tête « من الآية … ». */
function firstWords(text: string, n: number) {
  const w = text.split(/\s+/).filter(Boolean);
  return w.length > n ? `${w.slice(0, n).join(' ')} …` : text;
}

function useVerseText(key: string | null) {
  const [text, setText] = useState('');
  useEffect(() => {
    let cancelled = false;
    if (key) getVerseText(key).then((t) => !cancelled && setText(t));
    return () => {
      cancelled = true;
    };
  }, [key]);
  return key ? text : '';
}

type FileStatus = 'done' | 'started' | 'new';

function fileStatus(state: TafsirState, id: string): FileStatus {
  const f = state.files[id];
  if (f?.done) return 'done';
  if (f && f.pos > 5) return 'started';
  return 'new';
}

function StatusDot({ status }: { status: FileStatus }) {
  const cls =
    status === 'done'
      ? 'bg-[var(--ds-green)] border-[var(--ds-green)]'
      : status === 'started'
        ? 'bg-[var(--ds-gold)]/60 border-[var(--ds-gold)]'
        : 'bg-transparent border-[var(--ds-n400,#b8c2bd)]';
  return <span className={`inline-block w-2.5 h-2.5 rounded-full border-2 flex-none ${cls}`} aria-hidden />;
}

export default function TafsirPage() {
  const { data: units } = useQuranUnits();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [items, setItems] = useState<TafsirItem[]>([]);
  const [player, setPlayer] = useState<TafsirPlayerState>(getTafsirPlayer());
  // État vide au premier rendu (identique au rendu serveur) ; le localStorage
  // arrive par l'abonnement, après montage.
  const [progress, setProgress] = useState<TafsirState>({ files: {}, session: null, rate: 1, at: 0 });
  const [range, setRange] = useState<RangePickerValue>({ mode: 'hizb', start: null, end: null });
  const [quarters, setQuarters] = useState<HizbQuarter[] | null>(null);
  const [versePage, setVersePage] = useState<Record<string, number> | null>(null);
  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const [showQueue, setShowQueue] = useState(false);
  const [searchSurah, setSearchSurah] = useState(2);
  const [searchVerse, setSearchVerse] = useState<number | null>(null);
  const [openSurah, setOpenSurah] = useState<number | null>(null);

  useEffect(() => subscribeTafsirPlayer(setPlayer), []);
  useEffect(() => subscribeTafsirState(setProgress), []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const ok = isTafsirUser();
    setAllowed(ok);
    if (!ok) return;
    loadTafsirItems().then(setItems);
    loadHizbQuarters().then(setQuarters);
    getVersePageMap().then(setVersePage);
    hydrateTafsirFromRemote();
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.range) setRange(p.range);
      }
    } catch {
      /* préférences illisibles */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({ range }));
    } catch {
      /* stockage indisponible */
    }
  }, [range]);

  useEffect(() => {
    if (!units) return;
    const names: Record<number, string> = {};
    for (const c of units.chapters) names[c.id] = c.name_simple;
    setTafsirSurahNames(names);
  }, [units]);

  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const surahsWithTafsir = useMemo(() => [...new Set(items.filter((i) => !i.kind).map((i) => i.surah))], [items]);
  const chapter = (s: number) => units?.chapters.find((c) => c.id === s);
  const chapterName = (s: number) => chapter(s)?.name_simple ?? `Sourate ${s}`;
  const rate = progress.rate || 1;

  const changeRate = (r: number) => {
    setTafsirRate(r);
    if (player.active) setTafsirPlayerRate(r);
  };

  // ---------- Plage choisie ----------
  const bounds = useMemo(
    () => rangeToGlobalBounds(range.mode, range.start, range.end, quarters, versePage),
    [range, quarters, versePage]
  );
  const selection = useMemo(
    () => (bounds ? itemsForBounds(items, bounds.startGlobal, bounds.endGlobal) : []),
    [items, bounds]
  );
  const gaps = useMemo(
    () => (bounds && items.length ? gapsInBounds(items, bounds.startGlobal, bounds.endGlobal, fromGlobalAyahNumber) : []),
    [items, bounds]
  );
  const rangeLabel = () => {
    const { mode, start, end } = range;
    if (start == null || end == null) return '';
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    if (mode === 'surah' && lo === hi) return chapterName(lo);
    return lo === hi ? `${MODE_LABELS[mode]} ${lo}` : `${MODE_LABELS[mode]} ${lo} → ${hi}`;
  };

  const remainingOf = (list: TafsirItem[]) =>
    list.reduce((s, it) => {
      const f = progress.files[it.id];
      if (f?.done) return s;
      return s + Math.max(0, it.dur - (f?.pos ?? 0));
    }, 0);

  const selTotal = selection.reduce((s, it) => s + it.dur, 0);
  const selDone = selection.filter((it) => progress.files[it.id]?.done).length;
  const selRemaining = remainingOf(selection);

  // ---------- Recherche d'un verset ----------
  const searchMax = versesCount(searchSurah);
  const searchHits = searchVerse ? itemsForVerse(items, searchSurah, searchVerse) : [];

  // ---------- Lecture en cours ----------
  const cur = player.active ? player.queue[player.idx] : undefined;
  const fromKey = cur && !cur.kind && !cur.whole ? `${cur.surah}:${cur.from}` : null;
  const toKey = cur && !cur.kind && !cur.whole && cur.to !== cur.from ? `${cur.surah}:${cur.to}` : null;
  const fromText = useVerseText(fromKey);
  const toText = useVerseText(toKey);
  const queueRemaining = player.active
    ? Math.max(0, (cur?.dur ?? 0) - player.time) + player.queue.slice(player.idx + 1).reduce((s, it) => s + it.dur, 0)
    : 0;

  const session = progress.session;
  const sessionItems = session ? session.ids.map((id) => byId.get(id)).filter((x): x is TafsirItem => !!x) : [];
  const sessionCur = session ? byId.get(session.ids[session.idx]) : undefined;

  const resumeSession = () => {
    if (!session || sessionItems.length === 0) return;
    startTafsir(sessionItems, session.label, { idx: session.idx, pos: session.pos, rate });
  };

  const verseRangeLabel = (it: TafsirItem) => {
    if (it.kind === 'intro') return "Introduction au Juz 'Amma";
    if (it.whole) return 'Sourate entière';
    return it.from === it.to ? `Verset ${it.from}` : `Versets ${it.from} → ${it.to}`;
  };

  const statusText = (it: TafsirItem) => {
    const st = fileStatus(progress, it.id);
    if (st === 'done') return 'Écouté';
    if (st === 'started') return `Reprise à ${fmtClock(progress.files[it.id].pos)}`;
    return 'Non écouté';
  };

  if (allowed === false) {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto ds-card p-6 text-center text-[var(--ds-n600)]">
          Cet espace est réservé.
        </div>
      </AppShell>
    );
  }

  const fileRow = (it: TafsirItem, onPlay: () => void, active = false) => {
    const st = fileStatus(progress, it.id);
    return (
      <li
        key={it.id}
        className={`flex items-center gap-3 py-2 px-2 rounded-xl ${active ? 'bg-[var(--ds-sage-100)]' : ''}`}
      >
        <StatusDot status={st} />
        <button onClick={onPlay} className="flex-1 min-w-0 text-left">
          <span className="block text-sm font-semibold text-[var(--ds-text)] truncate">
            {it.kind || it.whole ? chapterName(it.surah) : `${chapterName(it.surah)} · ${it.from === it.to ? it.from : `${it.from}–${it.to}`}`}
            {it.kind === 'intro' && ' · introduction'}
          </span>
          <span className="block text-[11px] text-[var(--ds-n500)] tabular-nums">
            {fmtDuration(it.dur)} · {statusText(it)}
          </span>
        </button>
        <button
          onClick={() => setFileDone(it.id, st !== 'done')}
          className="text-[10px] font-bold uppercase tracking-wider text-[var(--ds-sage)] px-2 py-1 rounded-lg border border-[var(--ds-divider)] flex-none"
        >
          {st === 'done' ? 'Non écouté' : 'Marquer écouté'}
        </button>
      </li>
    );
  };

  return (
    <AppShell>
      <div className="pb-8 max-w-xl mx-auto" dir="ltr">
        <header className="mb-5">
          <h1 className="ds-title text-2xl md:text-3xl">Tafsir audio</h1>
          <p className="text-[var(--ds-n600)] mt-1 text-sm">
            Choisis une plage (pages, hizb, juz, sourates) : les explications s’enchaînent, fichiers entiers. La lecture
            continue écran verrouillé, et reprend là où tu t’étais arrêté.
          </p>
        </header>

        {/* ---------- Lecture en cours ---------- */}
        {player.active && cur && (
          <section className="ds-card p-4 mb-5">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <p className="ds-kicker">
                {player.label} · fichier {player.idx + 1}/{player.queue.length}
              </p>
              <span className="text-[11px] text-[var(--ds-n500)] tabular-nums flex-none">
                {player.loading ? 'chargement…' : player.playing ? 'en lecture' : 'en pause'}
              </span>
            </div>
            <p className="font-bold text-lg text-[var(--ds-green)] flex items-baseline justify-between gap-3">
              <span>{chapterName(cur.surah)}</span>
              <span dir="rtl" style={{ fontFamily: "'Amiri',serif" }} className="text-[var(--ds-gold)]">
                {chapter(cur.surah)?.name_arabic}
              </span>
            </p>
            <p className="text-sm text-[var(--ds-n700)] mb-2">{verseRangeLabel(cur)}</p>

            {fromKey && (
              <div dir="rtl" className="text-[var(--ds-text)] mb-3 text-right" style={ARABIC_STYLE}>
                <p>
                  <span className="text-[var(--ds-gold)] font-bold text-sm" style={{ fontFamily: "'Amiri',serif" }}>
                    {toKey ? 'من الآية' : 'الآية'} {toArabicNumbers(cur.from)}
                  </span>{' '}
                  <span className="text-[1.2em]">﴿{toKey ? firstWords(fromText, 9) : fromText}﴾</span>
                </p>
                {toKey && (
                  <p>
                    <span className="text-[var(--ds-gold)] font-bold text-sm" style={{ fontFamily: "'Amiri',serif" }}>إلى الآية {toArabicNumbers(cur.to)}</span>{' '}
                    <span className="text-[1.2em]">﴿{firstWords(toText, 9)}﴾</span>
                  </p>
                )}
              </div>
            )}

            <div className="mb-2">
              <input
                type="range"
                min={0}
                max={cur.dur}
                step={1}
                value={seekPreview ?? player.time}
                aria-label="Position dans le fichier"
                onChange={(e) => setSeekPreview(Number(e.target.value))}
                onPointerUp={() => {
                  if (seekPreview != null) seekTafsir(seekPreview);
                  setSeekPreview(null);
                }}
                onTouchEnd={() => {
                  if (seekPreview != null) seekTafsir(seekPreview);
                  setSeekPreview(null);
                }}
                onKeyUp={() => {
                  if (seekPreview != null) seekTafsir(seekPreview);
                  setSeekPreview(null);
                }}
                className="w-full h-5 accent-[var(--ds-green)] cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-[var(--ds-n500)] tabular-nums">
                <span>{fmtClock(seekPreview ?? player.time)}</span>
                <span>{fmtClock(cur.dur)}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2.5 mb-3">
              <button
                onClick={() => goToTafsir(player.idx - 1)}
                disabled={player.idx === 0}
                aria-label="Fichier précédent"
                className="w-10 h-10 rounded-full border-2 border-[var(--ds-gold)]/40 text-[var(--ds-green)] font-bold disabled:opacity-30"
              >
                ⏮
              </button>
              <button
                onClick={() => jumpTafsir(-15)}
                aria-label="Reculer de 15 secondes"
                className="w-11 h-11 rounded-full border-2 border-[var(--ds-gold)]/40 text-[var(--ds-green)] text-xs font-bold tabular-nums"
              >
                −15
              </button>
              <button
                onClick={() => (player.playing ? pauseTafsir() : resumeTafsir())}
                aria-label={player.playing ? 'Pause' : 'Lecture'}
                className="w-16 h-16 rounded-full bg-[var(--ds-green)] text-white text-2xl font-bold active:scale-95 transition-all"
              >
                {player.playing ? '❚❚' : '▶'}
              </button>
              <button
                onClick={() => jumpTafsir(30)}
                aria-label="Avancer de 30 secondes"
                className="w-11 h-11 rounded-full border-2 border-[var(--ds-gold)]/40 text-[var(--ds-green)] text-xs font-bold tabular-nums"
              >
                +30
              </button>
              <button
                onClick={() => goToTafsir(player.idx + 1)}
                disabled={player.idx >= player.queue.length - 1}
                aria-label="Fichier suivant"
                className="w-10 h-10 rounded-full border-2 border-[var(--ds-gold)]/40 text-[var(--ds-green)] font-bold disabled:opacity-30"
              >
                ⏭
              </button>
            </div>

            <p className="text-xs text-center text-[var(--ds-n600)] tabular-nums mb-2">
              Reste sur la plage : <strong>{fmtDuration(queueRemaining)}</strong>
              {player.rate !== 1 && <> · soit {fmtDuration(queueRemaining / player.rate)} à {fmtRate(player.rate)}</>}
            </p>
            {player.error && <p className="text-xs text-red-600 text-center mb-2">{player.error}</p>}

            {player.queue.length > 1 && (
              <div className="border-t border-[var(--ds-divider)] pt-2 mt-2">
                <button
                  onClick={() => setShowQueue((v) => !v)}
                  className="text-xs font-bold text-[var(--ds-sage)] w-full text-left"
                >
                  {showQueue ? '▾' : '▸'} Fichiers de la plage ({player.queue.length})
                </button>
                {showQueue && (
                  <ul className="mt-1 max-h-72 overflow-y-auto">
                    {player.queue.map((it, i) => (
                      fileRow(it, () => goToTafsir(i), i === player.idx)
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="text-center mt-2">
              <button onClick={stopTafsir} className="text-xs font-bold text-[#7a3030] underline">
                Arrêter
              </button>
            </div>
          </section>
        )}

        {/* ---------- Reprendre (après fermeture de l'app) ---------- */}
        {!player.active && session && sessionCur && (
          <section className="ds-card p-4 mb-5">
            <p className="ds-kicker mb-1">Reprendre</p>
            <p className="text-sm text-[var(--ds-text)] mb-3">
              <strong>{session.label}</strong> — {chapterName(sessionCur.surah)}, {verseRangeLabel(sessionCur).toLowerCase()},
              à {fmtClock(session.pos)} (fichier {session.idx + 1}/{session.ids.length})
            </p>
            <button
              onClick={resumeSession}
              className="w-full py-3 bg-gradient-to-r from-[var(--ds-green)] to-[var(--ds-sage)] text-white font-bold rounded-xl active:scale-[0.98] transition-all"
            >
              ▶ Reprendre là où j’en étais
            </button>
          </section>
        )}

        {/* ---------- Vitesse ---------- */}
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

        {/* ---------- Plage ---------- */}
        <section className="ds-card p-4 mb-5">
          <p className="ds-kicker mb-2">Écouter une plage</p>
          <RangePicker value={range} onChange={setRange} chapters={units?.chapters ?? []} />
          {bounds && (
            <div className="mt-3 text-sm text-[var(--ds-n700)]">
              {selection.length === 0 ? (
                <p className="text-[var(--ds-n600)]">Pas de tafsir audio sur cette plage.</p>
              ) : (
                <>
                  <p>
                    <strong>{selection.length}</strong> fichier{selection.length > 1 ? 's' : ''} ·{' '}
                    <strong>{fmtDuration(selTotal)}</strong> d’écoute
                    {rate !== 1 && <> (soit {fmtDuration(selTotal / rate)} à {fmtRate(rate)})</>}
                  </p>
                  <p className="text-xs text-[var(--ds-n600)] mt-0.5">
                    Déjà écouté : {selDone}/{selection.length} · reste {fmtDuration(selRemaining)}
                    {rate !== 1 && selRemaining > 0 && <> ({fmtDuration(selRemaining / rate)} à {fmtRate(rate)})</>}
                  </p>
                </>
              )}
              {gaps.length > 0 && selection.length > 0 && (
                <p className="text-xs text-[#8a5a14] mt-1.5">
                  Sans tafsir audio :{' '}
                  {gaps
                    .slice(0, 4)
                    .map((g) =>
                      g.from === 1 && g.to === versesCount(g.surah)
                        ? chapterName(g.surah)
                        : `${chapterName(g.surah)} ${g.from}${g.to !== g.from ? `–${g.to}` : ''}`
                    )
                    .join(', ')}
                  {gaps.length > 4 && ` et ${gaps.length - 4} autre${gaps.length > 5 ? 's' : ''}`}.
                </p>
              )}
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => startTafsir(selection, rangeLabel(), { rate })}
              disabled={selection.length === 0}
              className="flex-1 py-3 bg-gradient-to-r from-[var(--ds-green)] to-[var(--ds-sage)] text-white font-bold rounded-xl disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              ▶ Écouter
            </button>
            {selDone > 0 && selDone < selection.length && (
              <button
                onClick={() => {
                  const firstNew = selection.findIndex((it) => !progress.files[it.id]?.done);
                  startTafsir(selection, rangeLabel(), { idx: firstNew, rate });
                }}
                className="flex-1 py-3 border-2 border-[var(--ds-gold)]/40 text-[var(--ds-sage)] font-bold rounded-xl text-sm"
              >
                Premier non écouté
              </button>
            )}
          </div>
        </section>

        {/* ---------- Recherche d'un verset ---------- */}
        <section className="ds-card p-4 mb-5">
          <p className="ds-kicker mb-2">Chercher un verset</p>
          <div className="flex gap-2">
            <select
              value={searchSurah}
              onChange={(e) => {
                setSearchSurah(Number(e.target.value));
                setSearchVerse(null);
              }}
              className="flex-1 min-w-0 px-3 py-2.5 border-2 border-[var(--ds-gold)]/40 rounded-xl bg-white text-[var(--ds-green)] font-semibold"
            >
              {surahsWithTafsir.map((s) => (
                <option key={s} value={s}>
                  {s}. {chapterName(s)}
                </option>
              ))}
            </select>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={searchMax}
              placeholder={`1–${searchMax}`}
              aria-label="Numéro du verset"
              value={searchVerse ?? ''}
              onChange={(e) => {
                const n = Number(e.target.value);
                setSearchVerse(e.target.value === '' || !Number.isFinite(n) ? null : Math.min(Math.max(1, n), searchMax));
              }}
              className="w-32 px-3 py-2.5 text-center border-2 border-[var(--ds-gold)]/40 rounded-xl bg-white text-[var(--ds-green)] font-semibold"
            />
          </div>
          {searchVerse != null && (
            <div className="mt-3">
              {searchHits.length === 0 ? (
                <p className="text-sm text-[var(--ds-n600)]">
                  Pas de tafsir audio pour {chapterName(searchSurah)} {searchVerse}.
                </p>
              ) : (
                <ul>
                  {searchHits.map((it) => (
                    fileRow(it, () => startTafsir([it], `${chapterName(searchSurah)} ${searchVerse}`, { rate }))
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* ---------- Mes écoutes ---------- */}
        <section className="ds-card p-4 mb-5">
          <p className="ds-kicker mb-2">Mes écoutes</p>
          {[
            { key: 2, title: 'Al-Baqarah', list: items.filter((i) => i.surah === 2) },
            { key: 3, title: 'Al Imran', list: items.filter((i) => i.surah === 3) },
            { key: 30, title: "Juz 'Amma + Al-Fatiha", list: items.filter((i) => i.surah === 1 || i.surah >= 78) },
          ].map(({ key, title, list }) => {
            const done = list.filter((it) => progress.files[it.id]?.done).length;
            const total = list.reduce((s, it) => s + it.dur, 0);
            const open = openSurah === key;
            return (
              <div key={key} className="border-b last:border-b-0 border-[var(--ds-divider)] py-2">
                <button onClick={() => setOpenSurah(open ? null : key)} className="w-full text-left">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-bold text-[var(--ds-green)]">
                      {open ? '▾' : '▸'} {title}
                    </span>
                    <span className="text-xs text-[var(--ds-n600)] tabular-nums">
                      {done}/{list.length} écoutés · reste {fmtDuration(remainingOf(list))} sur {fmtDuration(total)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[var(--ds-gold)]/20 rounded-full overflow-hidden mt-1.5">
                    <div
                      className="h-full bg-[var(--ds-sage)]"
                      style={{ width: `${list.length ? ((total - remainingOf(list)) / total) * 100 : 0}%` }}
                    />
                  </div>
                </button>
                {open && (
                  <ul className="mt-2 max-h-96 overflow-y-auto">
                    {list.map((it, i) => (
                      fileRow(it, () => startTafsir(list, title, { idx: i, rate }), cur?.id === it.id)
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
