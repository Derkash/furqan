'use client';

// Carte « Votre passage » (brief §7) : début exact du premier verset de la
// première page du créneau, fin exacte du dernier verset de la dernière page.
// Le texte est rendu avec les GLYPHES QCF de la page (les mêmes mots du mushaf
// que partout dans l'app) — jamais du texte régénéré. RTL respecté.

import { useEffect, useState } from 'react';
import { surahsOfPage } from '@/lib/recitation/labels';

interface LayoutWord {
  location: string; // "s:v:w"
  qpcV2: string;
}
interface LayoutLine {
  type: string;
  words?: LayoutWord[];
}
interface LayoutPage {
  page: number;
  lines: LayoutLine[];
}

const loadedFonts = new Set<string>();
function ensureFontLoaded(page: number): string {
  const padded = String(page).padStart(3, '0');
  const family = `QCF_P${padded}`;
  if (typeof document !== 'undefined' && !loadedFonts.has(family)) {
    loadedFonts.add(family);
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-qcf-font', family);
    styleEl.textContent = `@font-face { font-family: '${family}'; src: url('/fonts/qcf-v2/${family}.woff2') format('woff2'); font-display: block; }`;
    document.head.appendChild(styleEl);
  }
  return family;
}

interface Excerpt {
  fontFamily: string;
  glyphs: string[]; // glyphes des mots, ordre du verset
  verseKey: string;
}

/** Mots (glyphes QCF) du premier ou dernier verset d'une page. */
async function loadExcerpt(page: number, which: 'first' | 'last'): Promise<Excerpt | null> {
  const padded = String(page).padStart(3, '0');
  const res = await fetch(`/mushaf-layout/page-${padded}.json`);
  if (!res.ok) return null;
  const data = (await res.json()) as LayoutPage;
  const byVerse = new Map<string, string[]>();
  const order: string[] = [];
  for (const line of data.lines) {
    if (line.type !== 'text' || !line.words) continue;
    for (const w of line.words) {
      const [s, v] = w.location.split(':');
      const key = `${s}:${v}`;
      if (!byVerse.has(key)) {
        byVerse.set(key, []);
        order.push(key);
      }
      byVerse.get(key)!.push(w.qpcV2);
    }
  }
  if (!order.length) return null;
  const verseKey = which === 'first' ? order[0] : order[order.length - 1];
  return { fontFamily: ensureFontLoaded(page), glyphs: byVerse.get(verseKey) ?? [], verseKey };
}

function GlyphLine({ excerpt, clampFrom }: { excerpt: Excerpt; clampFrom: 'start' | 'end' }) {
  // On montre le DÉBUT du premier verset et la FIN du dernier (max ~9 mots),
  // avec une ellipse côté tronqué — sens de lecture droite → gauche.
  const MAX = 9;
  const truncated = excerpt.glyphs.length > MAX;
  const shown =
    clampFrom === 'start' ? excerpt.glyphs.slice(0, MAX) : excerpt.glyphs.slice(-MAX);
  return (
    <p
      dir="rtl"
      className="text-[26px] md:text-[30px] leading-[1.9] text-[#1f2a26] select-none"
      style={{ fontFamily: `'${excerpt.fontFamily}', serif` }}
    >
      {clampFrom === 'end' && truncated && <span className="text-[var(--ds-n400)]">… </span>}
      {shown.join(' ')}
      {clampFrom === 'start' && truncated && <span className="text-[var(--ds-n400)]"> …</span>}
    </p>
  );
}

export default function VersePassage({ firstPage, lastPage }: { firstPage: number; lastPage: number }) {
  const [start, setStart] = useState<Excerpt | null>(null);
  const [end, setEnd] = useState<Excerpt | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    setStart(null);
    setEnd(null);
    loadExcerpt(firstPage, 'first').then((e) => {
      if (!cancelled) setStart(e);
    });
    loadExcerpt(lastPage, 'last').then((e) => {
      if (!cancelled) setEnd(e);
    });
    return () => {
      cancelled = true;
    };
  }, [firstPage, lastPage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const startSurah = surahsOfPage(firstPage)[0];
  const endList = surahsOfPage(lastPage);
  const endSurah = endList[endList.length - 1];

  return (
    <section className="ds-card p-5 md:p-6">
      <h2 className="text-lg font-extrabold text-[var(--ds-text)] mb-4">Votre passage</h2>

      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--ds-gold-700)]">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--ds-gold)] mr-2 align-middle" />
          DÉBUT · PAGE {firstPage}
          {startSurah && <span className="ml-2 normal-case tracking-normal text-[var(--ds-n600)] font-semibold">{startSurah.nameSimple}</span>}
        </p>
        <p className="text-xs text-[var(--ds-n500)] flex-none">Commencez ici</p>
      </div>
      <div className="border-l-2 border-dashed border-[var(--ds-sage-200)] ml-[4px] pl-4 my-1 min-h-[52px]">
        {start ? (
          <GlyphLine excerpt={start} clampFrom="start" />
        ) : (
          <div className="h-10 rounded-lg bg-[var(--ds-sage-100)] animate-pulse mt-2" />
        )}
      </div>

      <div className="flex items-start justify-between gap-3 mt-3">
        <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--ds-gold-700)]">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--ds-gold)] mr-2 align-middle" />
          FIN · PAGE {lastPage}
          {endSurah && <span className="ml-2 normal-case tracking-normal text-[var(--ds-n600)] font-semibold">{endSurah.nameSimple}</span>}
        </p>
        <p className="text-xs text-[var(--ds-n500)] flex-none">Terminez ici</p>
      </div>
      <div className="ml-[4px] pl-4 min-h-[52px]">
        {end ? (
          <GlyphLine excerpt={end} clampFrom="end" />
        ) : (
          <div className="h-10 rounded-lg bg-[var(--ds-sage-100)] animate-pulse mt-2" />
        )}
      </div>
    </section>
  );
}
