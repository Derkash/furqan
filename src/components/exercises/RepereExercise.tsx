'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

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

// Valeur pseudo-aléatoire stable dans [0,1[ pour une cellule (masquage par niveau).
function hashFrac(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000 / 100000;
}

export default function RepereExercise() {
  const [data, setData] = useState<Reperes | null>(null);
  const [surah, setSurah] = useState('4'); // An-Nisa par défaut
  const [level, setLevel] = useState(0); // 0 = tout visible … 8 = seulement les numéros de page
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

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

  const sd = data ? data[surah] : null;

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

  const startPress = (e: React.PointerEvent, key: string, hidden: boolean) => {
    if (!hidden) return;
    pressStart.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      revealCell(key);
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
    const hiddenByLevel = hashFrac(key) < level / 8;
    const show = !hiddenByLevel || revealed.has(key);
    return (
      <>
        <td
          className={`v${hiddenByLevel && !show ? ' hole' : ''}`}
          style={{ background: bg }}
          dir="rtl"
          onPointerDown={(e) => startPress(e, key, hiddenByLevel)}
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

  const HEAD = (
    <>
      <th className="v">Verset</th>
      <th className="sv">Sourate-Verset</th>
      <th className="pos">Pos.</th>
      <th className="pg">Page</th>
    </>
  );

  return (
    <div className="min-h-[100dvh] bg-[#fdfaf3] flex flex-col" dir="ltr">
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
      <div className="flex-none bg-[#2d5016] text-white px-3 py-2 flex items-center justify-between gap-2">
        <Link href="/exercises" className="text-sm hover:underline whitespace-nowrap">
          ← Retour
        </Link>
        <span className="text-sm font-bold">Repères — Début · Milieu · Fin</span>
        <select
          value={surah}
          onChange={(e) => setSurah(e.target.value)}
          className="text-[#2d5016] text-xs font-bold rounded-md px-2 py-1 max-w-[46vw]"
        >
          {data &&
            Object.keys(data)
              .sort((a, b) => Number(a) - Number(b))
              .map((id) => (
                <option key={id} value={id}>
                  {id}. {data[id].name}
                </option>
              ))}
        </select>
      </div>

      {/* Niveaux de difficulté */}
      <div className="flex-none bg-[#2d5016]/95 text-white px-2 py-2 flex items-center justify-center gap-1.5 flex-wrap">
        <span className="text-[11px] uppercase tracking-wide text-[#c9a959] mr-1">Difficulté</span>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((lvl) => (
          <button
            key={lvl}
            onClick={() => setLevel(lvl)}
            className={`min-w-[32px] h-8 px-2 rounded-md text-sm font-bold ${
              level === lvl ? 'bg-[#c9a959] text-[#2d5016] shadow-md' : 'bg-[#2d5016] text-[#c9a959] border border-[#4a7c23] hover:bg-[#3e6b1d]'
            }`}
          >
            {lvl}
          </button>
        ))}
      </div>

      {/* En-tête sourate + consigne */}
      {sd && (
        <div className="flex-none text-center py-1.5 bg-[#f4e9d0]">
          <span className="text-[#2d5016] font-bold" dir="rtl" style={{ fontFamily: AR_FONT, fontSize: 20 }}>
            سورة {sd.arname}
          </span>
          <span className="text-[#7a5d2c] text-sm"> · {sd.name}</span>
          <div className="text-[11px] text-[#7a5d2c]">
            {level === 0 ? 'Tout est affiché' : level === 8 ? 'Seuls les numéros de page' : `Niveau ${level}/8`} · appui long sur une case masquée = révéler 2 s
          </div>
        </div>
      )}

      {/* Tableau (défilable) */}
      <div className="flex-1 min-h-0 overflow-auto p-2" style={{ WebkitOverflowScrolling: 'touch' }}>
        {!sd ? (
          <p className="text-center text-[#4a7c23] py-8">Chargement…</p>
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
    </div>
  );
}
