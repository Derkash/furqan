'use client';

// Liste de pages à sélection multiple — pastille, repère « 03/page 5 »,
// aperçu du début du verset — partagée par « J'ai récité en avance » et
// réutilisable partout où l'on coche des pages en masse.
//
// L'appui long (« tout jusqu'ici ») est implémenté aux ÉVÉNEMENTS TACTILES :
// l'événement contextmenu, utilisé auparavant, ne se déclenche pas de façon
// fiable dans une WebView iOS — le geste annoncé ne marchait pas sur iPhone.

import { pageRefLabel, surahPageRef } from '@/lib/recitation/labels';

const LONG_PRESS_MS = 450;

/** Props d'un élément cliquable avec tap ET appui long, fiables sur iOS. */
export function pressProps(onTap: () => void, onLongPress: () => void) {
  // Fermé sur des refs via une factory : chaque appel = un élément.
  let timer: number | null = null;
  let fired = false;
  const start = () => {
    fired = false;
    timer = window.setTimeout(() => {
      fired = true;
      onLongPress();
    }, LONG_PRESS_MS);
  };
  const cancel = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return {
    onTouchStart: start,
    onTouchMove: cancel, // un défilement n'est pas un appui long
    onTouchEnd: (e: React.TouchEvent) => {
      cancel();
      if (fired) e.preventDefault(); // avale le clic synthétique d'iOS
    },
    onMouseDown: start,
    onMouseUp: cancel,
    onMouseLeave: cancel,
    onClick: (e: React.MouseEvent) => {
      if (fired) {
        e.preventDefault();
        fired = false;
        return;
      }
      onTap();
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (!fired) {
        fired = true;
        onLongPress();
      }
    },
  };
}

export default function PageMultiList({
  pages,
  selected,
  onChange,
  surah,
  heads,
}: {
  pages: number[];
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
  /** Sourate du contexte (séance d'apprentissage) pour les repères. */
  surah?: number;
  /** Débuts de versets par page (usePageVerseHeads). */
  heads: Record<number, string>;
}) {
  const toggle = (page: number) => {
    const next = new Set(selected);
    if (next.has(page)) next.delete(page);
    else next.add(page);
    onChange(next);
  };
  const through = (page: number) => onChange(new Set(pages.filter((p) => p <= page)));

  return (
    <div>
      <div className="flex flex-col divide-y divide-[var(--ds-divider)]">
        {pages.map((p) => {
          const isOn = selected.has(p);
          const ref = surahPageRef(p, surah);
          // pressProps recréé à chaque rendu : sans conséquence — aucun
          // re-render ne survient pendant un appui long (rien ne change
          // avant son déclenchement), les closures restent donc stables.
          return (
            <button
              key={p}
              type="button"
              {...pressProps(() => toggle(p), () => through(p))}
              className="py-2.5 flex items-center gap-3 text-left w-full select-none"
            >
              <span
                className={`flex-none w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold border-2 transition-colors ${
                  isOn
                    ? 'bg-[var(--ds-gold)] border-[var(--ds-gold)] text-white'
                    : 'border-[var(--ds-divider)] text-[var(--ds-n500)]'
                }`}
              >
                {isOn ? '✓' : (ref?.index ?? p)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="text-[15px] font-bold block">{pageRefLabel(p, surah)}</span>
                {heads[p] && (
                  <span
                    dir="rtl"
                    className={`text-[17px] leading-relaxed truncate block ${isOn ? 'text-[var(--ds-n400)]' : 'text-[#1f2a26]'}`}
                    style={{ fontFamily: "'Amiri','Scheherazade New',serif" }}
                  >
                    {heads[p]}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {pages.length > 1 && (
        <div className="flex gap-2 mt-2 pt-2 border-t border-[var(--ds-divider)]">
          <button type="button" onClick={() => onChange(new Set(pages))} className="ds-btn-ghost px-3.5 py-1.5 text-[12px]">
            Tout
          </button>
          <button type="button" onClick={() => onChange(new Set())} className="ds-btn-ghost px-3.5 py-1.5 text-[12px]">
            Rien
          </button>
        </div>
      )}
    </div>
  );
}
