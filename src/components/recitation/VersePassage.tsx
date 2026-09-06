'use client';

// Carte « Votre passage » (brief §7) : début exact du premier verset de la
// première page du créneau, fin exacte du dernier verset de la dernière page.
//
// Les glyphes viennent de /qcf-data/page-XXX.json — la MÊME source que
// MushafPage, calibrée pour la police QCF_Pxxx de la page. (Ne jamais utiliser
// /mushaf-layout/ ici : son encodage qpcV2 ne correspond pas à ces polices et
// produit des glyphes aberrants.) Aucun texte n'est régénéré : ce sont les
// mots du mushaf, dans leur graphie d'origine. RTL respecté.

import { useEffect, useState } from 'react';
import { surahsOfPage } from '@/lib/recitation/labels';

interface WordData {
  verseKey: string;
  code: string;
  position: number;
  isAyahMarker: boolean;
}
interface LineData {
  line: number;
  type: 'content' | 'announcement' | 'basmala' | 'empty';
  words?: WordData[];
}
interface PageData {
  page: number;
  lines: LineData[];
}

const loadedFonts = new Set<string>();
function ensureFontLoaded(page: number): string {
  const family = `QCF_P${String(page).padStart(3, '0')}`;
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
  /** Glyphes des mots du verset (marqueur de fin de verset exclu). */
  glyphs: string[];
  verseKey: string;
  /** Le verset déborde-t-il de la page (commencé avant / fini après) ? */
  partial: boolean;
}

/**
 * Mots (glyphes QCF) du premier ou dernier verset présent sur la page.
 * `partial` signale un verset à cheval : pour le DÉBUT on montre alors les
 * premiers mots *présents sur cette page* (c'est bien là qu'on commence).
 */
async function loadExcerpt(page: number, which: 'first' | 'last'): Promise<Excerpt | null> {
  const padded = String(page).padStart(3, '0');
  const res = await fetch(`/qcf-data/page-${padded}.json`);
  if (!res.ok) return null;
  const data = (await res.json()) as PageData;

  const byVerse = new Map<string, WordData[]>();
  const order: string[] = [];
  for (const line of data.lines) {
    if (line.type !== 'content' || !line.words) continue;
    for (const w of line.words) {
      if (!byVerse.has(w.verseKey)) {
        byVerse.set(w.verseKey, []);
        order.push(w.verseKey);
      }
      byVerse.get(w.verseKey)!.push(w);
    }
  }
  if (!order.length) return null;

  const verseKey = which === 'first' ? order[0] : order[order.length - 1];
  const words = (byVerse.get(verseKey) ?? [])
    .filter((w) => !w.isAyahMarker)
    .sort((a, b) => a.position - b.position);
  if (!words.length) return null;

  // Verset à cheval : ses mots sur cette page ne commencent pas à la position 1
  // (début sur la page précédente), ou le marqueur de fin est absent (suite
  // sur la page suivante).
  const hasMarker = (byVerse.get(verseKey) ?? []).some((w) => w.isAyahMarker);
  const partial = words[0].position !== 1 || !hasMarker;

  return {
    fontFamily: ensureFontLoaded(page),
    glyphs: words.map((w) => w.code),
    verseKey,
    partial,
  };
}

function GlyphLine({ excerpt }: { excerpt: Excerpt }) {
  // TOUJOURS le DÉBUT du verset — c'est lui qui permet de l'identifier, aussi
  // bien pour savoir où commencer que pour reconnaître le dernier verset à
  // réciter. L'ellipse porte sa PROPRE police : les polices QCF ne contiennent
  // que les glyphes de leur page, « … » y sortirait en carré vide.
  const MAX = 9;
  const truncated = excerpt.glyphs.length > MAX;
  return (
    <p
      dir="rtl"
      className="text-[26px] md:text-[30px] leading-[2] text-[#1f2a26] select-none"
      style={{ fontFamily: `'${excerpt.fontFamily}', serif` }}
    >
      {excerpt.glyphs.slice(0, MAX).join(' ')}
      {truncated && (
        <span className="text-[var(--ds-n400)]" style={{ fontFamily: 'var(--ds-font)' }}>
          {' '}…
        </span>
      )}
    </p>
  );
}

function Marker({
  kind,
  page,
  surahName,
  partial,
}: {
  kind: 'start' | 'end';
  page: number;
  surahName?: string;
  partial: boolean;
}) {
  const isStart = kind === 'start';
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="text-[11px] font-bold tracking-[0.14em] text-[var(--ds-gold-700)]">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--ds-gold)] mr-2 align-middle" />
        {isStart ? 'DÉBUT' : 'FIN'} · PAGE {page}
        {surahName && (
          <span className="ml-2 normal-case tracking-normal text-[var(--ds-n600)] font-semibold">
            {surahName}
          </span>
        )}
      </p>
      <p className="text-xs text-[var(--ds-n500)] flex-none text-right">
        {isStart ? 'Commencez ici' : 'Terminez ici'}
        <span className="block text-[10px] text-[var(--ds-n400)]">
          {partial
            ? isStart
              ? 'verset commencé avant'
              : 'verset achevé après'
            : isStart
              ? 'début du premier verset'
              : 'début du dernier verset'}
        </span>
      </p>
    </div>
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

      <Marker kind="start" page={firstPage} surahName={startSurah?.nameSimple} partial={start?.partial ?? false} />
      <div className="border-l-2 border-dashed border-[var(--ds-sage-200)] ml-[4px] pl-4 my-1 min-h-[56px]">
        {start ? (
          <GlyphLine excerpt={start} />
        ) : (
          <div className="h-10 rounded-lg bg-[var(--ds-sage-100)] animate-pulse mt-2" />
        )}
      </div>

      <div className="mt-3">
        <Marker kind="end" page={lastPage} surahName={endSurah?.nameSimple} partial={end?.partial ?? false} />
      </div>
      <div className="ml-[4px] pl-4 min-h-[56px]">
        {end ? (
          <GlyphLine excerpt={end} />
        ) : (
          <div className="h-10 rounded-lg bg-[var(--ds-sage-100)] animate-pulse mt-2" />
        )}
      </div>
    </section>
  );
}
