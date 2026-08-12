'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  initAudioStore,
  isNativeApp,
  countDownloadedInRange,
  downloadRange,
  deleteRange,
  totalDownloaded,
  type DownloadHandle,
} from '@/utils/audioStore';
import { toGlobalAyahNumber, TOTAL_AYAHS } from '@/utils/ayahMapping';

interface Chapter {
  id: number;
  name_arabic: string;
  name_simple: string;
  verses_count: number;
}

// Poids moyen constaté d'un verset Husary 128 kbps (~200 Ko) : estimation affichée.
const AVG_MB_PER_AYAH = 0.2;

function estimateSize(count: number): string {
  const mb = count * AVG_MB_PER_AYAH;
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} Go` : `${Math.max(1, Math.round(mb))} Mo`;
}

export default function TelechargementsPage() {
  const [ready, setReady] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  // n° de version : incrémenté pour re-render quand l'index local change
  const [, setTick] = useState(0);
  const [activeSurah, setActiveSurah] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const handleRef = useRef<DownloadHandle | null>(null);

  useEffect(() => {
    Promise.all([
      initAudioStore(),
      fetch('/qcf-data/chapters.json')
        .then((r) => r.json())
        .then((data) => setChapters(Array.isArray(data) ? data : data.chapters)),
    ]).then(() => setReady(true));
    return () => handleRef.current?.cancel();
  }, []);

  const ranges = useMemo(
    () =>
      new Map(
        chapters.map((c) => [
          c.id,
          [toGlobalAyahNumber(c.id, 1), toGlobalAyahNumber(c.id, c.verses_count)] as const,
        ])
      ),
    [chapters]
  );

  const startDownload = async (surah: number) => {
    const range = ranges.get(surah);
    if (!range || activeSurah !== null) return;
    setActiveSurah(surah);
    setProgress({ done: 0, total: range[1] - range[0] + 1 });
    const handle = downloadRange(range[0], range[1], (done, total) => {
      setProgress({ done, total });
      if (done % 10 === 0) setTick((t) => t + 1);
    });
    handleRef.current = handle;
    await handle.done;
    handleRef.current = null;
    setActiveSurah(null);
    setProgress(null);
    setTick((t) => t + 1);
  };

  const removeSurah = async (surah: number) => {
    const range = ranges.get(surah);
    if (!range || activeSurah !== null) return;
    await deleteRange(range[0], range[1]);
    setTick((t) => t + 1);
  };

  if (ready && !isNativeApp()) {
    return (
      <div className="min-h-screen bg-[#fdfaf3] flex flex-col items-center justify-center gap-4 px-6 text-center" dir="ltr">
        <p className="text-[#2d5016] font-semibold text-lg">
          Le téléchargement hors ligne est réservé à l&apos;app iPad.
        </p>
        <p className="text-[#4a7c23]/80 text-sm max-w-md">
          Sur le web, l&apos;audio est streamé directement depuis le CDN — rien à télécharger.
        </p>
        <Link href="/exercises" className="text-[#c9a959] font-semibold underline">
          Retour aux exercices
        </Link>
      </div>
    );
  }

  const downloadedCount = totalDownloaded();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fdfaf3] to-[#f4e9d0] pb-12" dir="ltr">
      <header className="pt-8 pb-6 px-5 text-center">
        <h1 className="text-[#2d5016] font-bold text-3xl">Audio hors ligne</h1>
        <p className="text-[#4a7c23]/80 text-sm mt-2">
          Récitation Al-Husary — télécharge les sourates que tu révises pour travailler sans connexion
        </p>
        <p className="text-[#c9a959] text-xs mt-2 font-semibold">
          {downloadedCount}/{TOTAL_AYAHS} versets téléchargés · ≈ {estimateSize(downloadedCount)}
        </p>
        <Link href="/exercises" className="inline-block mt-3 text-sm text-[#4a7c23] underline">
          ← Retour aux exercices
        </Link>
      </header>

      <main className="px-4">
        <div className="max-w-2xl mx-auto space-y-2">
          {!ready && <p className="text-center text-[#4a7c23]/60 text-sm">Chargement…</p>}
          {chapters.map((c) => {
            const range = ranges.get(c.id)!;
            const have = countDownloadedInRange(range[0], range[1]);
            const complete = have === c.verses_count;
            const isActive = activeSurah === c.id;
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/70 border border-[#c9a959]/30"
              >
                <span className="flex-none w-8 text-center text-[#c9a959] font-bold text-sm">{c.id}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-[#2d5016]">{c.name_simple}</span>
                    <span className="text-[#2d5016]/80 text-lg" dir="rtl" style={{ fontFamily: "'Amiri','Scheherazade New',serif" }}>
                      {c.name_arabic}
                    </span>
                  </div>
                  <p className="text-xs text-[#4a7c23]/70">
                    {isActive && progress
                      ? `Téléchargement… ${progress.done}/${progress.total}`
                      : complete
                        ? `${c.verses_count} versets · ≈ ${estimateSize(c.verses_count)} · hors ligne ✓`
                        : have > 0
                          ? `${have}/${c.verses_count} versets · reprise possible`
                          : `${c.verses_count} versets · ≈ ${estimateSize(c.verses_count)}`}
                  </p>
                </div>
                {isActive ? (
                  <button
                    onClick={() => handleRef.current?.cancel()}
                    className="flex-none px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#a33] text-white"
                  >
                    Stop
                  </button>
                ) : complete ? (
                  <button
                    onClick={() => removeSurah(c.id)}
                    disabled={activeSurah !== null}
                    className="flex-none px-3 py-1.5 rounded-lg text-sm font-semibold border border-[#a33]/40 text-[#a33] disabled:opacity-40"
                  >
                    Supprimer
                  </button>
                ) : (
                  <button
                    onClick={() => startDownload(c.id)}
                    disabled={activeSurah !== null}
                    className="flex-none px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#2d5016] text-white disabled:opacity-40"
                  >
                    {have > 0 ? 'Reprendre' : 'Télécharger'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
