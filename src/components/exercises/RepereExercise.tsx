'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toGlobalAyahNumber, getAudioUrl } from '@/utils/ayahMapping';

interface Cell {
  v: number;
  t: string;
}
interface Row {
  page: number;
  sp: number; // numéro de page dans la sourate
  d: Cell | null;
  m: Cell | null;
  f: Cell | null;
}
interface SurahData {
  name: string;
  arname: string;
  start: number;
  end: number;
  total: number;
  rows: Row[];
}
type Reperes = Record<string, SurahData>;

const AR_FONT = "'Amiri','Scheherazade New','Traditional Arabic',serif";
const COLORS: Record<'d' | 'm' | 'f', string> = { d: '#dbead5', m: '#fdf0cf', f: '#d9e6f5' };
const LABELS: Record<'d' | 'm' | 'f', string> = { d: 'Début', m: 'Milieu', f: 'Fin' };
const POSKEYS: ('d' | 'm' | 'f')[] = ['d', 'm', 'f'];

// Ratio doré (suite de Weyl à faible discordance) : masque les cellules de façon
// régulièrement répartie sur toute la sourate, sans grappes (jamais tout d'un côté).
const PHI = 0.6180339887498949;

export default function RepereExercise() {
  const [data, setData] = useState<Reperes | null>(null);
  const [surah, setSurah] = useState<string | null>(null); // null = écran de choix de sourate
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState(0); // 0 = tout visible … 8 = seulement les numéros de page
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState(false);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const revealTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    fetch('/reperes.json')
      .then((r) => r.json())
      .then((d: Reperes) => setData(d))
      .catch(() => {});
  }, []);

  // Change de sourate → on efface les révélations temporaires.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setRevealed(new Set());
    revealTimers.current.forEach((t) => clearTimeout(t));
    revealTimers.current.clear();
  }, [surah, level]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const timers = revealTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  const sd = data && surah ? data[surah] : null;

  // Index global de chaque cellule (dans l'ordre page puis Début/Milieu/Fin).
  // Sert à répartir régulièrement les trous : weyl(idx) = frac((idx+0.5)·φ),
  // masqué si weyl < niveau/8. Deux cellules voisines (même page) ont des valeurs
  // très éloignées → rarement masquées ensemble ; les trous sont étalés sur la sourate.
  const cellIndex = useMemo(() => {
    const m = new Map<string, number>();
    if (!sd) return m;
    let i = 0;
    for (const row of sd.rows) {
      for (const pos of POSKEYS) {
        if (row[pos]) m.set(`${surah}:${row.page}:${pos}`, i++);
      }
    }
    return m;
  }, [sd, surah]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Joue le verset en vitesse x2 (appui long).
  function playVerse(verseNum: number) {
    if (!surah) return;
    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const a = new Audio(getAudioUrl(toGlobalAyahNumber(Number(surah), verseNum)));
      a.playbackRate = 2;
      // conserve la hauteur de voix malgré l'accélération
      (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
      a.onended = () => setPlaying(false);
      a.onpause = () => setPlaying(false);
      audioRef.current = a;
      a.play().then(() => setPlaying(true)).catch(() => {});
    } catch {
      /* ignore */
    }
  }
  function stopAudio() {
    if (audioRef.current) audioRef.current.pause();
    setPlaying(false);
  }

  // Révèle une case masquée pendant 2 s (appui long).
  function revealCell(key: string) {
    setRevealed((prev) => {
      const n = new Set(prev);
      n.add(key);
      return n;
    });
    const prev = revealTimers.current.get(key);
    if (prev) clearTimeout(prev);
    revealTimers.current.set(
      key,
      setTimeout(() => {
        setRevealed((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
        revealTimers.current.delete(key);
      }, 2000)
    );
  }

  const startPress = (e: React.PointerEvent, key: string, hidden: boolean, verseNum: number) => {
    pressStart.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      // Si la case était masquée on l'affiche ; dans tous les cas on lance l'audio x2.
      if (hidden) revealCell(key);
      playVerse(verseNum);
    }, 400);
  };
  const movePress = (e: React.PointerEvent) => {
    const s = pressStart.current;
    if (!s || !pressTimer.current) return;
    if (Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const endPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  // Rend les 3 cellules (Verset, S:V, Pos) d'une position pour une page.
  const posCells = (row: Row | null, pos: 'd' | 'm' | 'f') => {
    const cell = row ? row[pos] : null;
    const bg = COLORS[pos];
    if (!row || !cell) {
      return (
        <>
          <td className="v" style={{ background: bg }} />
          <td className="sv" style={{ background: bg }} />
          <td className="pos" style={{ background: bg }}>
            {row ? LABELS[pos] : ''}
          </td>
        </>
      );
    }
    const key = `${surah}:${row.page}:${pos}`;
    const idx = cellIndex.get(key) ?? 0;
    const weyl = ((idx + 0.5) * PHI) % 1;
    const hiddenByLevel = weyl < level / 8;
    const show = !hiddenByLevel || revealed.has(key);
    return (
      <>
        <td
          className={`v${hiddenByLevel && !show ? ' hole' : ''}`}
          style={{ background: bg }}
          dir="rtl"
          onPointerDown={(e) => startPress(e, key, hiddenByLevel, cell.v)}
          onPointerMove={movePress}
          onPointerUp={endPress}
          onPointerLeave={endPress}
          onPointerCancel={endPress}
        >
          {show ? cell.t : ''}
        </td>
        <td className="sv" style={{ background: bg }}>
          {show ? `${surah}:${cell.v}` : ''}
        </td>
        <td className="pos" style={{ background: bg }}>
          {LABELS[pos]}
        </td>
      </>
    );
  };

  const pageCell = (row: Row | null) =>
    row ? (
      <td className="pg" rowSpan={3}>
        {row.sp}
        <span className="sub">/{sd?.total}</span>
      </td>
    ) : (
      <td className="pg" rowSpan={3} />
    );

  // Construit les paires (page paire à gauche, impaire à droite).
  const byPage: Record<number, Row> = {};
  sd?.rows.forEach((r) => (byPage[r.page] = r));
  const spreads: [Row | null, Row | null][] = [];
  if (sd) {
    for (let op = sd.start; op <= sd.end; op++) {
      if (op % 2 !== 1) continue;
      const ep = op + 1 <= sd.end ? op + 1 : null;
      spreads.push([ep ? byPage[ep] : null, byPage[op] ?? null]);
    }
  }

  // ---- Écran de choix de la sourate ----
  if (!surah) {
    const ids = data ? Object.keys(data).sort((a, b) => Number(a) - Number(b)) : [];
    const q = query.trim().toLowerCase();
    const filtered = ids.filter(
      (id) => !q || `${id} ${data![id].name}`.toLowerCase().includes(q) || data![id].arname.includes(query.trim())
    );
    return (
      <div className="h-full overflow-y-auto bg-[var(--ds-bg)] flex flex-col" dir="ltr">
        <div dir="ltr" className="app-topbar flex-none bg-[var(--ds-green)] text-white px-3 py-2 flex items-center justify-between gap-2">
          <Link
            href="/revision"
            aria-label="Retour"
            className="flex-none w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </Link>
          <span className="text-sm font-bold">Repères — choisis une sourate</span>
          <span className="w-12" />
        </div>
        <div className="flex-none px-3 py-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une sourate…"
            className="w-full max-w-md mx-auto block px-3 py-2 rounded-xl border-2 border-[var(--ds-gold)]/40 focus:outline-none focus:border-[var(--ds-green)] text-[var(--ds-green)]"
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-8" style={{ WebkitOverflowScrolling: 'touch' }}>
          {!data ? (
            <p className="text-center text-[var(--ds-sage)] py-8">Chargement…</p>
          ) : (
            <div className="max-w-2xl mx-auto grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filtered.map((id) => (
                <button
                  key={id}
                  onClick={() => {
                    setSurah(id);
                    setLevel(0);
                    setQuery('');
                  }}
                  className="text-left p-3 rounded-xl bg-white border border-[var(--ds-gold)]/30 hover:border-[var(--ds-gold)] active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-[var(--ds-sage)]">{id}</span>
                    <span className="text-lg text-[var(--ds-green)]" dir="rtl" style={{ fontFamily: AR_FONT }}>
                      {data[id].arname}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-[var(--ds-green)] truncate">{data[id].name}</div>
                  <div className="text-[10px] text-gray-400">
                    {data[id].total} page{data[id].total > 1 ? 's' : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const HEAD = (
    <>
      <th className="v">Verset</th>
      <th className="sv">Sourate-Verset</th>
      <th className="pos">Pos.</th>
      <th className="pg">Page</th>
    </>
  );

  return (
    <div className="h-full overflow-y-auto bg-[var(--ds-bg)] flex flex-col" dir="ltr">
      <style>{`
        .rep-table { border-collapse: collapse; }
        .rep-table th { background:#2f5496; color:#fff; font-size:12px; padding:5px 6px; border:1px solid #2f5496; }
        .rep-table td { font-size:11px; padding:3px 6px; border:1px solid #b9c4d6; vertical-align:middle; height:30px; }
        .rep-table td.v { font-family:${AR_FONT}; font-size:16px; text-align:right; white-space:nowrap; overflow:hidden; max-width:260px; min-width:180px; cursor:pointer; }
        .rep-table td.sv { font-size:10px; text-align:center; color:#333; white-space:nowrap; min-width:52px; }
        .rep-table td.pos { font-size:10px; text-align:center; font-weight:bold; min-width:44px; }
        .rep-table td.pg { font-size:20px; font-weight:bold; text-align:center; color:#2f5496; background:#eef2f8; min-width:40px; }
        .rep-table td.pg .sub { display:block; font-size:9px; color:#7a8ba6; font-weight:normal; margin-top:-2px; }
        .rep-table td.sep, .rep-table th.sep { width:6px; padding:0; background:#2f5496; border:none; }
        .rep-table tr.blockstart td { border-top:3px solid #2f5496; }
        .rep-table tr.blockstart td.sep { border:none; }
        .rep-table td.v.hole { background-image:linear-gradient(rgba(255,255,255,.6),rgba(255,255,255,.6)); border-bottom:1px dashed #9aa7bd; }
      `}</style>

      {/* Barre */}
      <div dir="ltr" className="app-topbar flex-none bg-[var(--ds-green)] text-white px-3 py-2 flex items-center justify-between gap-2">
        <button onClick={() => setSurah(null)} className="text-sm hover:underline whitespace-nowrap">
          ← Sourates
        </button>
        <span className="text-sm font-bold truncate">
          {surah}. {sd?.name} — Repères
        </span>
        <span className="w-16" />
      </div>

      {/* Niveaux de difficulté */}
      <div className="flex-none bg-[var(--ds-green)]/95 text-white px-2 py-2 flex items-center justify-center gap-1.5 flex-wrap">
        <span className="text-[11px] uppercase tracking-wide text-[var(--ds-gold)] mr-1">Difficulté</span>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((lvl) => (
          <button
            key={lvl}
            onClick={() => setLevel(lvl)}
            className={`min-w-[32px] h-8 px-2 rounded-md text-sm font-bold ${
              level === lvl ? 'bg-[var(--ds-gold)] text-[var(--ds-green)] shadow-md' : 'bg-[var(--ds-green)] text-[var(--ds-gold)] border border-[var(--ds-sage)] hover:bg-[#3e6b1d]'
            }`}
          >
            {lvl}
          </button>
        ))}
      </div>

      {/* En-tête sourate + consigne */}
      {sd && (
        <div className="flex-none text-center py-1.5 bg-[var(--ds-sage-100)]">
          <span className="text-[var(--ds-green)] font-bold" dir="rtl" style={{ fontFamily: AR_FONT, fontSize: 20 }}>
            سورة {sd.arname}
          </span>
          <span className="text-[#7a5d2c] text-sm"> · {sd.name}</span>
          <div className="text-[11px] text-[#7a5d2c]">
            {level === 0 ? 'Tout est affiché' : level === 8 ? 'Seuls les numéros de page' : `Niveau ${level}/8`} · appui long = révéler 2 s + écouter le verset (x2)
          </div>
        </div>
      )}

      {/* Tableau (défilable) */}
      <div className="flex-1 min-h-0 overflow-auto p-2" style={{ WebkitOverflowScrolling: 'touch' }}>
        {!sd ? (
          <p className="text-center text-[var(--ds-sage)] py-8">Chargement…</p>
        ) : (
          <table className="rep-table mx-auto" style={{ touchAction: 'pan-y', userSelect: 'none' }}>
            <thead>
              <tr>
                {HEAD}
                <th className="sep" />
                {HEAD}
              </tr>
            </thead>
            <tbody>
              {spreads.map(([gauche, droite], si) =>
                POSKEYS.map((pos, i) => (
                  <tr key={`${si}-${pos}`} className={i === 0 ? 'blockstart' : ''}>
                    {posCells(gauche, pos)}
                    {i === 0 ? pageCell(gauche) : null}
                    <td className="sep" />
                    {posCells(droite, pos)}
                    {i === 0 ? pageCell(droite) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Bouton Stop — visible uniquement pendant la lecture audio */}
      {playing && (
        <button
          onClick={stopAudio}
          className="fixed z-50 bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-3 rounded-full bg-red-600 text-white font-bold shadow-lg active:scale-95 transition-transform"
        >
          <span className="w-3.5 h-3.5 bg-white rounded-[2px]" />
          Stop
        </button>
      )}
    </div>
  );
}
