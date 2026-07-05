'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import LoginCard from '@/components/exercises/LoginCard';
import {
  aggregateMistakesByWord,
  getCurrentUser,
  loadStats,
  logout,
  type MistakeType,
  type UserStats,
} from '@/utils/exercises/userStats';
import { toArabicNumbers } from '@/utils/arabicNumbers';

const TYPE_LABELS: Record<MistakeType, string> = {
  oubli: 'Oubli',
  inversion: 'Inversion',
  harakat: 'Harakat',
  mot: 'Mot erroné',
};

// ---------- Rendu du mot fautif avec la vraie police QCF de sa page ----------

interface QcfWord {
  verseKey: string;
  code: string;
  position: number;
}
interface QcfPageData {
  page: number;
  font: string;
  lines: { type: string; words?: QcfWord[] }[];
}

const pageDataCache = new Map<number, Promise<QcfPageData>>();
function loadQcfPage(page: number): Promise<QcfPageData> {
  if (!pageDataCache.has(page)) {
    const padded = String(page).padStart(3, '0');
    pageDataCache.set(
      page,
      fetch(`/qcf-data/page-${padded}.json`).then((r) => r.json())
    );
  }
  return pageDataCache.get(page)!;
}

const loadedFonts = new Set<string>();
function ensureFontLoaded(fontFamily: string) {
  if (typeof document === 'undefined' || loadedFonts.has(fontFamily)) return;
  loadedFonts.add(fontFamily);
  const styleEl = document.createElement('style');
  styleEl.textContent = `@font-face { font-family: '${fontFamily}'; src: url('/fonts/qcf-v2/${fontFamily}.woff2') format('woff2'); font-display: block; }`;
  document.head.appendChild(styleEl);
}

function MistakeWordGlyph({
  verseKey,
  position,
  page,
}: {
  verseKey: string;
  position: number;
  page: number;
}) {
  const [code, setCode] = useState<string | null>(null);
  const fontFamily = `QCF_P${String(page).padStart(3, '0')}`;

  useEffect(() => {
    let cancelled = false;
    loadQcfPage(page)
      .then((data) => {
        if (cancelled) return;
        for (const line of data.lines) {
          for (const w of line.words ?? []) {
            if (w.verseKey === verseKey && w.position === position) {
              ensureFontLoaded(data.font);
              setCode(w.code);
              return;
            }
          }
        }
        setCode('؟');
      })
      .catch(() => {
        if (!cancelled) setCode('؟');
      });
    return () => {
      cancelled = true;
    };
  }, [verseKey, position, page]);

  return (
    <span
      dir="rtl"
      className="text-[#1a1a1a]"
      style={{ fontFamily: `'${fontFamily}', serif`, fontSize: 30, lineHeight: 1.5 }}
    >
      {code ?? '…'}
    </span>
  );
}

// ---------- Graphique à barres (une série, valeurs directes + survol) ----------

interface BarDatum {
  label: string;
  value: number | null; // null = pas de données ce jour-là
  hint?: string;
}

function BarChart({
  data,
  color,
  unit = '',
  fixedMax,
}: {
  data: BarDatum[];
  color: string;
  unit?: string;
  fixedMax?: number;
}) {
  const max = fixedMax ?? Math.max(1, ...data.map((d) => d.value ?? 0));
  return (
    <div className="flex items-end gap-1">
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 flex flex-col items-center justify-end"
          title={d.value === null ? `${d.label} : —` : `${d.label} : ${d.value}${unit}${d.hint ?? ''}`}
        >
          <span className="text-[9px] text-gray-500 h-3.5">
            {d.value !== null && d.value > 0 ? `${d.value}${unit}` : ''}
          </span>
          <div className="w-full max-w-[20px] h-[88px] flex items-end justify-center">
            {d.value === null ? (
              <div className="w-full max-w-[20px] h-[2px] rounded bg-gray-200" />
            ) : (
              <div
                className="w-full rounded-t-[4px]"
                style={{
                  height: Math.max(d.value > 0 ? 3 : 1, Math.round((d.value / max) * 88)),
                  backgroundColor: d.value > 0 ? color : '#e5e7eb',
                }}
              />
            )}
          </div>
          <span className="text-[8px] text-gray-400 mt-1">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#c9a959]/20 shadow-sm p-4 text-center">
      <div className="text-2xl font-bold" style={{ color: accent ?? '#2d5016' }}>
        {value}
      </div>
      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#c9a959]/20 shadow-sm p-4">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#c9a959] mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

// ---------- Page ----------

export default function DashboardPage() {
  const [user, setUser] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const u = getCurrentUser();
    setUser(u);
    setChecked(true);
    if (u) setStats(loadStats(u));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const aggregated = useMemo(
    () => (user && stats ? aggregateMistakesByWord(user) : []),
    [user, stats]
  );

  const byType = useMemo(() => {
    const counts: Record<MistakeType, number> = { oubli: 0, inversion: 0, harakat: 0, mot: 0 };
    for (const m of stats?.wordMistakes ?? []) counts[m.type]++;
    return counts;
  }, [stats]);

  // Séries journalières sur 14 jours : fautes déclarées + taux de réussite.
  const daily = useMemo(() => {
    const days: { key: string; label: string }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, label: String(d.getDate()).padStart(2, '0') });
    }
    const mistakes = new Map<string, number>();
    for (const m of stats?.wordMistakes ?? []) {
      const k = m.at.slice(0, 10);
      mistakes.set(k, (mistakes.get(k) ?? 0) + 1);
    }
    const answers = new Map<string, { found: number; total: number }>();
    for (const r of stats?.verseResults ?? []) {
      const k = r.at.slice(0, 10);
      const cur = answers.get(k) ?? { found: 0, total: 0 };
      cur.total++;
      if (r.found) cur.found++;
      answers.set(k, cur);
    }
    return {
      mistakes: days.map((d) => ({
        label: d.label,
        value: mistakes.get(d.key) ?? 0,
      })) as BarDatum[],
      success: days.map((d) => {
        const a = answers.get(d.key);
        return {
          label: d.label,
          value: a ? Math.round((a.found / a.total) * 100) : null,
          hint: a ? ` (${a.found}/${a.total})` : '',
        };
      }) as BarDatum[],
    };
  }, [stats]);

  // Versets ratés au quiz (trouvé/raté par verset).
  const verseMastery = useMemo(() => {
    const map = new Map<string, { page: number; found: number; failed: number }>();
    for (const r of stats?.verseResults ?? []) {
      const cur = map.get(r.verseKey) ?? { page: r.page, found: 0, failed: 0 };
      if (r.found) cur.found++;
      else cur.failed++;
      map.set(r.verseKey, cur);
    }
    return Array.from(map, ([verseKey, v]) => ({ verseKey, ...v }))
      .filter((v) => v.failed > 0)
      .sort((a, b) => b.failed - a.failed || a.found - b.found)
      .slice(0, 12);
  }, [stats]);

  if (!checked) return <div className="min-h-screen bg-[#fdfaf3]" />;
  if (!user) {
    return (
      <LoginCard
        onLoggedIn={(u) => {
          setUser(u);
          setStats(loadStats(u));
        }}
      />
    );
  }

  const totalMistakes = stats?.wordMistakes.length ?? 0;
  const totalAnswers = stats?.verseResults.length ?? 0;
  const totalFound = stats?.verseResults.filter((r) => r.found).length ?? 0;
  const successRate = totalAnswers > 0 ? Math.round((totalFound / totalAnswers) * 100) : null;
  const maxType = Math.max(1, ...Object.values(byType));

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fdfaf3] via-[#fdfaf3] to-[#f4e9d0] pb-12" dir="ltr">
      {/* Header */}
      <header className="pt-8 pb-6 px-5">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <Link href="/exercises" className="text-[#4a7c23] text-sm hover:underline">
              ← Exercices
            </Link>
            <button
              onClick={() => {
                logout();
                setUser(null);
                setStats(null);
              }}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Se déconnecter
            </button>
          </div>
          <h1 className="text-center text-[#2d5016] font-bold text-3xl">Tableau de bord</h1>
          <p className="text-center text-[#7a8b3e] text-sm mt-1">
            Maîtrise et fautes — <span className="font-semibold">{user}</span>
          </p>
        </div>
      </header>

      <main className="px-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Tuiles de synthèse */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Fautes déclarées" value={toArabicNumbers(totalMistakes)} accent="#b91c1c" />
            <StatTile label="Mots à revoir" value={toArabicNumbers(aggregated.length)} accent="#b45309" />
            <StatTile label="Questions répondues" value={toArabicNumbers(totalAnswers)} />
            <StatTile
              label="Taux de réussite"
              value={successRate === null ? '—' : `${successRate}%`}
              accent={successRate === null ? '#9ca3af' : successRate >= 80 ? '#15803d' : successRate >= 60 ? '#b45309' : '#b91c1c'}
            />
          </div>

          {/* Évolution */}
          <SectionCard title="Fautes déclarées — 14 derniers jours">
            <BarChart data={daily.mistakes} color="#b91c1c" />
          </SectionCard>

          <SectionCard title="Taux de réussite — 14 derniers jours">
            <BarChart data={daily.success} color="#4a7c23" unit="%" fixedMax={100} />
          </SectionCard>

          {/* Répartition par type de faute */}
          <SectionCard title="Répartition par type de faute">
            {totalMistakes === 0 ? (
              <p className="text-sm text-gray-400">Aucune faute déclarée pour l&apos;instant.</p>
            ) : (
              <div className="space-y-2">
                {(Object.keys(TYPE_LABELS) as MistakeType[]).map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <span className="w-24 text-xs font-semibold text-[#1a1a1a]">{TYPE_LABELS[t]}</span>
                    <div className="flex-1 h-4 bg-[#fdfaf3] rounded-full overflow-hidden border border-[#c9a959]/20">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round((byType[t] / maxType) * 100)}%`,
                          backgroundColor: '#b45309',
                          minWidth: byType[t] > 0 ? 8 : 0,
                        }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs font-bold text-[#2d5016]">
                      {toArabicNumbers(byType[t])}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Mots à retravailler */}
          <SectionCard title="Mots à retravailler (les plus fréquents)">
            {aggregated.length === 0 ? (
              <p className="text-sm text-gray-400">
                Déclarez vos fautes dans l&apos;exercice Récitation pour les retrouver ici.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {aggregated.slice(0, 18).map((m) => (
                  <div
                    key={`${m.verseKey}#${m.position}`}
                    className="bg-[#fdfaf3] border border-[#c9a959]/25 rounded-xl px-3 py-2 flex flex-col items-center text-center"
                  >
                    <MistakeWordGlyph verseKey={m.verseKey} position={m.position} page={m.page} />
                    <div className="text-[10px] text-gray-500 mt-1" dir="ltr">
                      {m.verseKey} • p.{m.page}
                    </div>
                    <div className="flex flex-wrap gap-1 justify-center mt-1">
                      <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-1.5">
                        ×{toArabicNumbers(m.count)}
                      </span>
                      {(Object.keys(m.types) as MistakeType[]).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] text-[#7a5d2c] bg-[#c9a959]/15 border border-[#c9a959]/30 rounded-full px-1.5"
                        >
                          {TYPE_LABELS[t]}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Versets à revoir (quiz) */}
          <SectionCard title="Versets à revoir (quiz ratés)">
            {verseMastery.length === 0 ? (
              <p className="text-sm text-gray-400">Aucun verset raté au quiz pour l&apos;instant.</p>
            ) : (
              <div className="space-y-1.5">
                {verseMastery.map((v) => {
                  const total = v.found + v.failed;
                  const rate = Math.round((v.found / total) * 100);
                  return (
                    <div key={v.verseKey} className="flex items-center gap-2">
                      <span className="w-16 text-xs font-bold text-[#2d5016]" dir="ltr">
                        {v.verseKey}
                      </span>
                      <span className="w-10 text-[10px] text-gray-400">p.{v.page}</span>
                      <div
                        className="flex-1 h-4 bg-red-100 rounded-full overflow-hidden border border-[#c9a959]/20"
                        title={`${v.found} trouvé(s) / ${v.failed} raté(s)`}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${rate}%`, backgroundColor: '#4a7c23' }}
                        />
                      </div>
                      <span className="w-16 text-right text-[10px] text-gray-500">
                        ✓{toArabicNumbers(v.found)} ✗{toArabicNumbers(v.failed)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </main>
    </div>
  );
}
