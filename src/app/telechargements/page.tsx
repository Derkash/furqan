'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import {
  initAudioStore,
  isNativeApp,
  countDownloadedInRange,
  downloadRange,
  deleteRange,
  totalDownloaded,
  remoteAudioUrl,
  type AudioCollection,
  type DownloadHandle,
} from '@/utils/audioStore';
import { resolveFrenchEdition, frenchDownloadUrls } from '@/utils/frenchRecitation';
import { toGlobalAyahNumber, TOTAL_AYAHS } from '@/utils/ayahMapping';

interface Chapter {
  id: number;
  name_arabic: string;
  name_simple: string;
  verses_count: number;
}

interface Task {
  surah: number;
  collection: AudioCollection;
}

// Sourates longues révisées en priorité : Al-Baqarah, Āl ʿImrān, An-Nisāʾ.
const PRIORITY_SURAHS = [2, 3, 4];

// Poids moyen constaté d'un verset Husary 128 kbps (~200 Ko) : estimation affichée.
const AVG_MB_PER_AYAH = 0.2;

const COLLECTION_LABEL: Record<AudioCollection, string> = {
  husary: 'Husary',
  french: 'Français',
};

function estimateSize(count: number): string {
  const mb = count * AVG_MB_PER_AYAH;
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} Go` : `${Math.max(1, Math.round(mb))} Mo`;
}

export default function TelechargementsPage() {
  const [ready, setReady] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  // n° de version : incrémenté pour re-render quand l'index local change
  const [, setTick] = useState(0);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [frOffline, setFrOffline] = useState(false); // édition FR introuvable (hors ligne ?)
  const handleRef = useRef<DownloadHandle | null>(null);
  const queueRef = useRef<Task[]>([]);
  const stoppedRef = useRef(false);

  useEffect(() => {
    Promise.all([
      initAudioStore(),
      fetch('/qcf-data/chapters.json')
        .then((r) => r.json())
        .then((data) => setChapters(Array.isArray(data) ? data : data.chapters)),
    ]).then(() => setReady(true));
    return () => {
      stoppedRef.current = true;
      queueRef.current = [];
      handleRef.current?.cancel();
    };
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

  /** Enchaîne les tâches de la file (une à la fois, annulable). */
  const runQueue = async () => {
    stoppedRef.current = false;
    let frenchEdition: string | null | undefined;
    for (;;) {
      const task = queueRef.current.shift();
      if (!task || stoppedRef.current) break;
      const range = ranges.get(task.surah);
      if (!range) continue;

      let urlsFor: (n: number) => string[];
      if (task.collection === 'french') {
        if (frenchEdition === undefined) frenchEdition = await resolveFrenchEdition();
        if (!frenchEdition) {
          // Impossible de découvrir l'édition FR (première fois hors ligne)
          setFrOffline(true);
          continue;
        }
        const edition = frenchEdition;
        urlsFor = (n) => frenchDownloadUrls(edition, n);
      } else {
        urlsFor = (n) => [remoteAudioUrl(n)];
      }

      setActiveTask(task);
      setProgress({ done: 0, total: range[1] - range[0] + 1 });
      const handle = downloadRange(task.collection, range[0], range[1], urlsFor, (done, total) => {
        setProgress({ done, total });
        if (done % 10 === 0) setTick((t) => t + 1);
      });
      handleRef.current = handle;
      await handle.done;
      handleRef.current = null;
      setTick((t) => t + 1);
    }
    setActiveTask(null);
    setProgress(null);
  };

  const enqueue = (tasks: Task[]) => {
    const pending = new Set(queueRef.current.map((t) => `${t.surah}:${t.collection}`));
    for (const t of tasks) {
      const key = `${t.surah}:${t.collection}`;
      if (!pending.has(key)) {
        queueRef.current.push(t);
        pending.add(key);
      }
    }
    if (!activeTask) runQueue();
    else setTick((t) => t + 1);
  };

  const stopAll = () => {
    stoppedRef.current = true;
    queueRef.current = [];
    handleRef.current?.cancel();
  };

  const removeSurah = async (surah: number, collection: AudioCollection) => {
    const range = ranges.get(surah);
    if (!range || activeTask) return;
    await deleteRange(collection, range[0], range[1]);
    setTick((t) => t + 1);
  };

  if (ready && !isNativeApp()) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center" dir="ltr">
          <p className="font-extrabold text-lg text-[var(--ds-green)]">
            Le téléchargement hors ligne est réservé à l&apos;app iPad.
          </p>
          <p className="text-[var(--ds-n600)] text-sm max-w-md">
            Sur le web, l&apos;audio est streamé directement depuis le CDN — rien à télécharger.
          </p>
          <Link href="/exercises" className="ds-btn-ghost px-5 py-2 text-sm mt-2">
            Retour à l&apos;accueil
          </Link>
        </div>
      </AppShell>
    );
  }

  const grandTotal = totalDownloaded('husary') + totalDownloaded('french');
  const queuedKeys = new Set(queueRef.current.map((t) => `${t.surah}:${t.collection}`));
  const priorityTasks: Task[] = PRIORITY_SURAHS.flatMap((surah) => [
    { surah, collection: 'husary' as const },
    { surah, collection: 'french' as const },
  ]);
  const priorityDone =
    ready &&
    chapters.length > 0 &&
    priorityTasks.every((t) => {
      const c = chapters.find((ch) => ch.id === t.surah);
      const range = ranges.get(t.surah);
      return c && range && countDownloadedInRange(t.collection, range[0], range[1]) === c.verses_count;
    });

  return (
    <AppShell>
    <div className="pb-6" dir="ltr">
      <header className="mb-6 max-w-2xl">
        <h1 className="ds-title text-3xl md:text-4xl">Audio hors ligne</h1>
        <p className="text-[var(--ds-n600)] text-sm mt-2">
          Télécharge la récitation arabe (Al-Husary) et sa traduction française lue (Youssouf
          Leclerc) pour travailler sans connexion. Le tafsir écrit est déjà intégré à l&apos;app.
        </p>
        <p className="ds-kicker mt-2">
          {grandTotal} fichiers téléchargés · ≈ {estimateSize(grandTotal)} · {TOTAL_AYAHS} versets
          par récitation
        </p>
        {frOffline && (
          <p className="text-[#a33] text-xs mt-2">
            Édition française introuvable — connecte-toi à Internet une première fois pour le
            français, puis réessaie.
          </p>
        )}
        {!priorityDone && (
          <button
            onClick={() => enqueue(priorityTasks)}
            className="mt-4 w-full py-3 rounded-2xl bg-gradient-to-br from-[#2d5016] to-[#4a7c23] text-white font-bold text-sm shadow-lg active:scale-[0.99]"
          >
            ⭐ Pack prioritaire — Al-Baqarah · Āl ʿImrān · An-Nisāʾ (arabe + français)
          </button>
        )}
        {activeTask && (
          <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-white/80 border border-[#c9a959]/40">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#2d5016]">
                Sourate {activeTask.surah} — {COLLECTION_LABEL[activeTask.collection]}
                {progress && ` · ${progress.done}/${progress.total}`}
                {queueRef.current.length > 0 && ` · ${queueRef.current.length} en attente`}
              </p>
              {progress && (
                <div className="mt-1.5 h-1.5 rounded-full bg-[#c9a959]/20 overflow-hidden">
                  <div
                    className="h-full bg-[#4a7c23] transition-all"
                    style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
                  />
                </div>
              )}
            </div>
            <button
              onClick={stopAll}
              className="flex-none px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#a33] text-white"
            >
              Tout arrêter
            </button>
          </div>
        )}
      </header>

      <main>
        <div className="max-w-2xl space-y-2">
          {!ready && <p className="text-center text-[var(--ds-n500)] text-sm">Chargement…</p>}
          {chapters.map((c) => {
            const range = ranges.get(c.id)!;
            const isPriority = PRIORITY_SURAHS.includes(c.id);
            return (
              <div
                key={c.id}
                className={`flex items-center gap-3 p-3 rounded-xl bg-white/70 border ${isPriority ? 'border-[#c9a959]' : 'border-[#c9a959]/30'}`}
              >
                <span className="flex-none w-8 text-center text-[#c9a959] font-bold text-sm">{c.id}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-[#2d5016]">{c.name_simple}</span>
                    <span className="text-[#2d5016]/80 text-lg" dir="rtl" style={{ fontFamily: "'Amiri','Scheherazade New',serif" }}>
                      {c.name_arabic}
                    </span>
                    {isPriority && <span className="text-xs">⭐</span>}
                  </div>
                  <p className="text-xs text-[#4a7c23]/70">
                    {c.verses_count} versets · ≈ {estimateSize(c.verses_count)} par récitation
                  </p>
                </div>
                {(['husary', 'french'] as const).map((collection) => {
                  const have = countDownloadedInRange(collection, range[0], range[1]);
                  const complete = have === c.verses_count;
                  const isActive =
                    activeTask?.surah === c.id && activeTask.collection === collection;
                  const isQueued = queuedKeys.has(`${c.id}:${collection}`);
                  return (
                    <button
                      key={collection}
                      onClick={() =>
                        complete
                          ? removeSurah(c.id, collection)
                          : enqueue([{ surah: c.id, collection }])
                      }
                      disabled={isActive || isQueued}
                      title={complete ? 'Téléchargé — appuyer pour supprimer' : 'Télécharger'}
                      className={`flex-none px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        isActive
                          ? 'bg-[#4a7c23] text-white border-[#4a7c23]'
                          : isQueued
                            ? 'bg-[#c9a959]/20 text-[#4a7c23] border-[#c9a959]/40'
                            : complete
                              ? 'bg-[#2d5016] text-white border-[#2d5016]'
                              : have > 0
                                ? 'bg-white text-[#4a7c23] border-[#4a7c23]'
                                : 'bg-white text-[#2d5016]/70 border-[#c9a959]/40'
                      }`}
                    >
                      {COLLECTION_LABEL[collection]}{' '}
                      {isActive ? '…' : isQueued ? '⏳' : complete ? '✓' : have > 0 ? `${have}/${c.verses_count}` : '⬇'}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </main>
    </div>
    </AppShell>
  );
}
