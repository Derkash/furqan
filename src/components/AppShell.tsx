'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { computeHomeStats } from '@/utils/homeStats';

/**
 * Coque de l'app (design Application2).
 * - AppShell : pages « hub » (accueil, révision, progression…) — sidebar +
 *   contenu avec marges.
 * - PracticeShell : écrans d'exercice — la même barre de pilotage à gauche,
 *   contenu plein écran (la double page Mushaf garde toute la place).
 */

type IconName =
  | 'home'
  | 'revision'
  | 'lecture'
  | 'vocab'
  | 'reperes'
  | 'adhkar'
  | 'progression'
  | 'downloads';

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
        </svg>
      );
    case 'revision':
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
        </svg>
      );
    case 'lecture':
      return (
        <svg {...common}>
          <path d="M12 7v14" />
          <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
        </svg>
      );
    case 'vocab':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="13" width="8" height="8" rx="2" />
          <path d="M13 7h4M7 13v4" />
        </svg>
      );
    case 'reperes':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case 'adhkar':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
        </svg>
      );
    case 'progression':
      return (
        <svg {...common}>
          <path d="M3 3v16a2 2 0 0 0 2 2h16" />
          <rect x="7" y="10" width="3" height="7" rx="1" />
          <rect x="12" y="6" width="3" height="11" rx="1" />
          <rect x="17" y="13" width="3" height="4" rx="1" />
        </svg>
      );
    case 'downloads':
      return (
        <svg {...common}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      );
  }
}

// Le logo Muraja3a (en haut) sert d'Accueil — pas d'entrée « Accueil » dédiée.
const NAV: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: '/revision', label: 'Révision', icon: 'revision', match: (p) => p.startsWith('/revision') || /^\/exercises\/(?!lecture)[a-z-]+\//.test(p) },
  { href: '/exercises/lecture/practice', label: 'Lecture', icon: 'lecture', match: (p) => p.startsWith('/exercises/lecture') },
  { href: '/vocab', label: 'Vocabulaire', icon: 'vocab', match: (p) => p.startsWith('/vocab') },
  { href: '/reperes', label: 'Repères', icon: 'reperes', match: (p) => p.startsWith('/reperes') },
  { href: '/adhkar', label: 'Adhkâr', icon: 'adhkar', match: (p) => p.startsWith('/adhkar') },
  { href: '/dashboard', label: 'Progression', icon: 'progression', match: (p) => p.startsWith('/dashboard') },
  { href: '/telechargements', label: 'Audio', icon: 'downloads', match: (p) => p.startsWith('/telechargements') },
];

function NavItem({
  item,
  active,
  compact,
}: {
  item: (typeof NAV)[number];
  active: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={`flex flex-col items-center gap-1 rounded-2xl transition-colors ${
        compact ? 'px-3 py-1.5 flex-none' : 'px-2 py-2.5 w-[72px]'
      } ${active ? 'bg-[var(--ds-sage-100)] text-[var(--ds-green)]' : 'text-[var(--ds-n500)] hover:text-[var(--ds-green)]'}`}
    >
      <Icon name={item.icon} />
      <span className="text-[9px] font-bold uppercase tracking-widest whitespace-nowrap">{item.label}</span>
    </Link>
  );
}

/** Barre de pilotage verticale (≥ md) — partagée hub / exercices. */
export function Sidebar() {
  const pathname = usePathname() ?? '';
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    setStreak(computeHomeStats().streakDays);
  }, [pathname]);

  return (
    <aside
      className="hidden md:flex flex-none w-[96px] flex-col items-center border-r border-[var(--ds-divider)] bg-white py-5 h-dvh overflow-y-auto z-40"
      style={{ fontFamily: 'var(--ds-font)' }}
    >
      <Link href="/exercises" className="flex flex-col items-center gap-0.5 mb-5">
        <span
          className="text-[26px] leading-none text-[var(--ds-gold)]"
          dir="rtl"
          style={{ fontFamily: "'Amiri','Scheherazade New',serif" }}
        >
          ع
        </span>
        <span className="text-[8px] font-extrabold tracking-[0.22em] text-[var(--ds-n600)]">MURAJA3A</span>
      </Link>
      <nav className="flex flex-col items-center gap-1.5 flex-1">
        {NAV.map((item) => (
          <NavItem key={item.href} item={item} active={item.match(pathname)} />
        ))}
      </nav>
      {streak > 0 && (
        <div className="ds-card flex flex-col items-center px-3 py-2 mt-4">
          <span className="text-[var(--ds-gold)] text-base leading-none">🔥</span>
          <span className="text-[10px] font-extrabold text-[var(--ds-n700)] mt-0.5">{streak} j</span>
        </div>
      )}
    </aside>
  );
}

/** Barre horizontale (petit écran) — hub uniquement. */
function MobileNav() {
  const pathname = usePathname() ?? '';
  return (
    <nav className="md:hidden sticky top-0 z-30 flex items-center gap-1 overflow-x-auto bg-white/95 backdrop-blur border-b border-[var(--ds-divider)] px-2 py-1.5 app-topbar-safe">
      {NAV.map((item) => (
        <NavItem key={item.href} item={item} active={item.match(pathname)} compact />
      ))}
    </nav>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="ds-page" dir="ltr">
      <div className="flex min-h-dvh">
        <div className="sticky top-0 h-dvh hidden md:block">
          <Sidebar />
        </div>
        <div className="flex-1 min-w-0">
          <MobileNav />
          <main className="px-5 md:px-9 py-6 md:py-8 max-w-[1100px]">{children}</main>
        </div>
      </div>
    </div>
  );
}

/**
 * Coque des écrans d'EXERCICE : barre de pilotage à gauche, contenu plein
 * écran (h-dvh). Le contenu gère lui-même ses barres et son fond.
 */
export function PracticeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden ds-page" dir="ltr">
      <div className="flex-none hidden md:block">
        <Sidebar />
      </div>
      <div className="flex-1 min-w-0 h-dvh relative overflow-hidden">{children}</div>
    </div>
  );
}
