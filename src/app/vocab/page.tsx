'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Orientation, PageVerses, PagePair } from '@/types';
import { fetchPageVerses } from '@/hooks/usePageVerses';
import { useQuranUnits } from '@/hooks/exercises/useQuranUnits';
import { unitToPageRange } from '@/utils/exercises/rangeToPages';
import RangePicker, { type RangePickerValue } from '@/components/exercises/RangePicker';
import MushafDoublePage from '@/components/MushafDoublePage';
import WordCard from '@/components/vocab/WordCard';
import OccurrencesExplorer from '@/components/vocab/OccurrencesExplorer';
import ReviewTab from '@/components/vocab/ReviewTab';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import {
  getVocab,
  removeVocab,
  seedVocabIfNeeded,
  importSeed,
  type VocabEntry,
} from '@/utils/vocab/vocabStore';

function pairOf(page: number): PagePair {
  const right = page % 2 === 1 ? page : page - 1;
  return { rightPage: Math.max(1, right), leftPage: Math.min(604, Math.max(1, right) + 1) };
}

type Mode = 'review' | 'capture' | 'list';

export default function VocabPage() {
  const [mode, setMode] = useState<Mode>('review');

  const tabs: { id: Mode; label: string }[] = [
    { id: 'review', label: '🔁 Réviser' },
    { id: 'capture', label: '➕ Enregistrer' },
    { id: 'list', label: '📚 Lexique' },
  ];

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#fdfaf3] flex flex-col">
      {/* Barre */}
      <div className="flex-none bg-[#2d5016] text-white px-3 py-2 flex items-center justify-between gap-2">
        <Link href="/exercises" className="text-sm hover:underline whitespace-nowrap">
          ← Exercices
        </Link>
        <div className="flex gap-1 bg-[#1f3a0f] rounded-full p-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                mode === t.id ? 'bg-[#c9a959] text-[#2d5016]' : 'text-[#c9a959]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-xs opacity-75 hidden sm:inline">Vocabulaire</span>
      </div>

      {mode === 'review' && <ReviewTab onEmpty={() => setMode('capture')} />}
      {mode === 'capture' && <ReadMode />}
      {mode === 'list' && <ListMode />}
    </div>
  );
}

// ============================================================
// LECTURE + CAPTURE
// ============================================================

function ReadMode() {
  const { data: units } = useQuranUnits();
  const [range, setRange] = useState<RangePickerValue>({ mode: 'page', start: null, end: null });
  const [started, setStarted] = useState(false);
  const [page, setPage] = useState(2);
  const [left, setLeft] = useState<PageVerses | null>(null);
  const [right, setRight] = useState<PageVerses | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<{ verseKey: string; position: number; side: 'left' | 'right' } | null>(null);

  const { startPage, endPage } = useMemo(
    () => unitToPageRange(range.mode, range.start, range.end, units),
    [range, units]
  );
  const pair = pairOf(page);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchPageVerses(pair.leftPage), fetchPageVerses(pair.rightPage)])
      .then(([l, r]) => {
        if (cancelled) return;
        setLeft(l);
        setRight(r);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [started, pair.leftPage, pair.rightPage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const begin = () => {
    if (startPage == null || endPage == null) return;
    setPage(Math.min(startPage, endPage) % 2 === 0 ? Math.min(startPage, endPage) + 1 : Math.min(startPage, endPage));
    setStarted(true);
  };

  const lo = startPage != null ? Math.min(startPage, endPage!) : 1;
  const hi = endPage != null ? Math.max(startPage!, endPage) : 604;
  const canPrev = pair.rightPage > (lo % 2 === 1 ? lo : lo - 1);
  const canNext = pair.rightPage < (hi % 2 === 1 ? hi : hi - 1);

  const flip = (dir: 'prev' | 'next') => {
    setSelected(null);
    setPage((p) => {
      const cur = p % 2 === 1 ? p : p - 1;
      let t = cur + (dir === 'next' ? 2 : -2);
      const loP = lo % 2 === 1 ? lo : lo - 1;
      const hiP = hi % 2 === 1 ? hi : hi - 1;
      t = Math.max(loP, Math.min(hiP, t));
      return t;
    });
  };

  const onMushafClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest('[data-verse]');
    const verseKey = el?.getAttribute('data-verse');
    if (!verseKey || el?.classList.contains('ayah-marker')) {
      setSelected(null);
      return;
    }
    const position = Number(el?.getAttribute('data-pos'));
    const p = Number(el?.getAttribute('data-page'));
    if (!Number.isFinite(position)) return;
    // Le mot est sur la page `p` ; la carte s'ouvre sur la moitié opposée.
    setSelected({ verseKey, position, side: p % 2 === 1 ? 'left' : 'right' });
  };

  if (!started) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-5 border border-[#c9a959]/20 mt-4">
          <h2 className="text-lg font-bold text-[#2d5016] mb-1">Choisir une plage à lire</h2>
          <p className="text-sm text-gray-500 mb-4">
            Touche n&apos;importe quel mot sur la page pour l&apos;analyser (racine, forme de base,
            grammaire) et l&apos;ajouter à ton vocabulaire.
          </p>
          <RangePicker value={range} onChange={setRange} chapters={units?.chapters ?? []} />
          <button
            onClick={begin}
            disabled={startPage == null}
            className="w-full mt-4 py-3 bg-gradient-to-r from-[#2d5016] to-[#4a7c23] text-white font-bold rounded-xl disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            Commencer la lecture
          </button>
        </div>
      </div>
    );
  }

  const orientation: Orientation = 'landscape';
  return (
    <div className="flex-1 min-h-0 relative" onClick={onMushafClick}>
      <MushafDoublePage
        leftPageVerses={left}
        rightPageVerses={right}
        pagePair={pair}
        orientation={orientation}
        revealedVerses={new Set()}
        visibleVerses={new Set()}
        isBlurred={false}
        maskAll={false}
        loading={loading}
        onTap={() => {}}
      />

      {selected && (
        <WordCard
          verseKey={selected.verseKey}
          position={selected.position}
          side={selected.side}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Feuilletage (RTL : avancer = gauche) */}
      <button
        type="button"
        aria-label="Pages précédentes"
        disabled={!canPrev}
        onClick={(e) => {
          e.stopPropagation();
          flip('prev');
        }}
        className={`absolute right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg border border-[#c9a959]/40 ${
          canPrev ? 'bg-[#2d5016]/90 text-[#fdfaf3] hover:bg-[#2d5016]' : 'bg-[#2d5016]/30 text-[#fdfaf3]/40 cursor-not-allowed'
        }`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Pages suivantes"
        disabled={!canNext}
        onClick={(e) => {
          e.stopPropagation();
          flip('next');
        }}
        className={`absolute left-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg border border-[#c9a959]/40 ${
          canNext ? 'bg-[#2d5016]/90 text-[#fdfaf3] hover:bg-[#2d5016]' : 'bg-[#2d5016]/30 text-[#fdfaf3]/40 cursor-not-allowed'
        }`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 6-6 6 6 6" />
        </svg>
      </button>

      {/* Badge page */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-[#2d5016]/85 text-[#fdfaf3] text-xs font-bold rounded-full px-3 py-1 pointer-events-none">
        Pages {toArabicNumbers(pair.rightPage)}–{toArabicNumbers(pair.leftPage)}
      </div>
    </div>
  );
}

// ============================================================
// MON LEXIQUE
// ============================================================

function ListMode() {
  const [items, setItems] = useState<VocabEntry[]>([]);
  const [query, setQuery] = useState('');
  const [explore, setExplore] = useState<{ root: string; gloss?: string; lemma?: string } | null>(null);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  const refresh = () => setItems(getVocab());

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    seedVocabIfNeeded().then(() => refresh());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (e) =>
        e.gloss.toLowerCase().includes(q) ||
        e.arabic.includes(query.trim()) ||
        (e.root && e.root.includes(query.trim()))
    );
  }, [items, query]);

  const doImport = async () => {
    const n = await importSeed();
    refresh();
    setSeedMsg(n > 0 ? `${n} mot(s) importé(s)` : 'Lexique déjà à jour');
    setTimeout(() => setSeedMsg(null), 2500);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-4">
        {/* Barre outils */}
        <div className="flex items-center gap-2 mb-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher (français, arabe, racine)…"
            className="flex-1 px-3 py-2 rounded-lg border-2 border-[#c9a959]/30 focus:border-[#c9a959] outline-none text-sm"
          />
          <button
            onClick={doImport}
            className="text-xs font-bold text-[#4a7c23] border-2 border-[#c9a959]/40 rounded-lg px-3 py-2 hover:border-[#c9a959] whitespace-nowrap"
          >
            Importer lexique
          </button>
        </div>
        {seedMsg && <p className="text-xs text-[#4a7c23] mb-2">{seedMsg}</p>}

        <p className="text-xs text-gray-400 mb-2">
          {toArabicNumbers(items.length)} mot{items.length > 1 ? 's' : ''} — {toArabicNumbers(items.filter((e) => e.root).length)} avec racine
        </p>

        {filtered.length === 0 && (
          <p className="text-center text-gray-500 py-10 text-sm">
            Aucun mot. Va dans « Lire &amp; capturer » pour en ajouter.
          </p>
        )}

        <div className="space-y-2">
          {filtered.map((e) => (
            <div key={e.id} className="bg-white rounded-xl p-3 border border-[#c9a959]/20 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span dir="rtl" className="text-[#2d5016]" style={{ fontFamily: "'Amiri',serif", fontSize: '1.7em' }}>
                    {e.arabic}
                  </span>
                  <span className="text-sm text-gray-600">{e.gloss}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {e.root && (
                    <span className="text-[11px] text-[#7a5d2c] bg-[#c9a959]/15 rounded-full px-2 py-0.5" dir="rtl" style={{ fontFamily: "'Amiri',serif" }}>
                      {e.root.split('').join(' ')}
                    </span>
                  )}
                  {/* Boîte Leitner */}
                  <span className="flex gap-0.5">
                    {[0, 1, 2, 3, 4].map((b) => (
                      <span key={b} className={`w-1.5 h-1.5 rounded-full ${b < e.box ? 'bg-[#4a7c23]' : 'bg-[#4a7c23]/15'}`} />
                    ))}
                  </span>
                  {e.source === 'seed' && <span className="text-[10px] text-gray-400">lexique</span>}
                </div>
              </div>
              {e.root && (
                <button
                  onClick={() => setExplore({ root: e.root!, gloss: e.gloss, lemma: e.lemma })}
                  title="Voir toutes les formes dans le Coran"
                  className="flex-none text-xs font-bold text-[#2d5016] bg-[#2d5016]/10 rounded-lg px-2.5 py-1.5 hover:bg-[#2d5016]/20"
                >
                  occurrences
                </button>
              )}
              <button
                onClick={() => {
                  removeVocab(e.id);
                  refresh();
                }}
                aria-label="Supprimer"
                className="flex-none w-8 h-8 rounded-full text-red-500 hover:bg-red-50 flex items-center justify-center"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {explore && (
        <OccurrencesExplorer root={explore.root} gloss={explore.gloss} lemma={explore.lemma} onClose={() => setExplore(null)} />
      )}
    </div>
  );
}
