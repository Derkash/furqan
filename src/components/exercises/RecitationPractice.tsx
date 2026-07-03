'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import MushafDoublePage from '@/components/MushafDoublePage';
import { fetchPageVerses } from '@/hooks/usePageVerses';
import { useAudio } from '@/hooks/useAudio';
import { useAudioRecorder } from '@/hooks/exercises/useAudioRecorder';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import type { PagePair, PageVerses, VersePosition } from '@/types';

/** Durée de l'extrait audio joué au début de chaque tour. */
const SNIPPET_SECONDS = 5;

type Phase = 'listening' | 'reciting' | 'result';

function getPagePair(page: number): PagePair {
  const rightPage = page % 2 === 1 ? page : page - 1;
  return {
    rightPage: Math.max(1, rightPage),
    leftPage: Math.min(604, rightPage + 1),
  };
}

/**
 * Exercice « Récitation » :
 * 1. Un verset ALÉATOIRE de la plage est tiré ; 5 s de son début sont jouées,
 *    double page floutée (même rendu que les autres exercices).
 * 2. Tap → enregistrement du micro pendant que vous récitez, tout est masqué.
 * 3. Tap → résultat : double page entièrement révélée, verset cible surligné,
 *    réécoute de votre enregistrement, bouton Suivant (nouveau verset aléatoire).
 */
export default function RecitationPractice() {
  const searchParams = useSearchParams();
  const startPage = Number(searchParams.get('start')) || 1;
  const endPage = Number(searchParams.get('end')) || startPage;

  const [round, setRound] = useState(0);
  const [target, setTarget] = useState<VersePosition | null>(null);
  const [pagePair, setPagePair] = useState<PagePair | null>(null);
  const [leftPageVerses, setLeftPageVerses] = useState<PageVerses | null>(null);
  const [rightPageVerses, setRightPageVerses] = useState<PageVerses | null>(null);
  const [phase, setPhase] = useState<Phase>('listening');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const audio = useAudio();
  const recorder = useAudioRecorder();

  const lastVerseKeyRef = useRef<string | null>(null);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------- Tirage d'un nouveau tour (page aléatoire → verset aléatoire) ----------
  const newRound = useCallback(async () => {
    setLoadError(null);
    try {
      const page = startPage + Math.floor(Math.random() * (endPage - startPage + 1));
      const pageVerses = await fetchPageVerses(page);
      if (pageVerses.verses.length === 0) throw new Error('page vide');

      let verse = pageVerses.verses[Math.floor(Math.random() * pageVerses.verses.length)];
      // Éviter de retomber immédiatement sur le même verset.
      if (verse.verseKey === lastVerseKeyRef.current && pageVerses.verses.length > 1) {
        const others = pageVerses.verses.filter((v) => v.verseKey !== verse.verseKey);
        verse = others[Math.floor(Math.random() * others.length)];
      }
      lastVerseKeyRef.current = verse.verseKey;

      const pair = getPagePair(verse.page);
      const [left, right] = await Promise.all([
        fetchPageVerses(pair.leftPage),
        fetchPageVerses(pair.rightPage),
      ]);

      setTarget(verse);
      setPagePair(pair);
      setLeftPageVerses(left);
      setRightPageVerses(right);
      setRound((r) => r + 1);
      setPhase('listening');
    } catch {
      setLoadError('Impossible de charger la page. Vérifiez votre connexion.');
    }
  }, [startPage, endPage]);

  // Premier tour au montage.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    newRound();
  }, [newRound]);

  // ---------- Extrait audio de 5 s du verset cible ----------
  const snippetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playSnippet = useCallback(() => {
    if (!target) return;
    if (snippetTimer.current) clearTimeout(snippetTimer.current);
    audio.play(target);
    snippetTimer.current = setTimeout(() => audio.stop(), SNIPPET_SECONDS * 1000);
  }, [target, audio]);
  const playSnippetRef = useRef(playSnippet);
  useEffect(() => {
    playSnippetRef.current = playSnippet;
  }, [playSnippet]);

  // Lecture auto de l'extrait à chaque entrée en phase d'écoute.
  useEffect(() => {
    if (phase === 'listening' && target) playSnippetRef.current();
  }, [phase, target]);

  useEffect(() => {
    return () => {
      if (snippetTimer.current) clearTimeout(snippetTimer.current);
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    };
  }, []);

  // ---------- Transitions ----------
  const startReciting = async () => {
    if (snippetTimer.current) clearTimeout(snippetTimer.current);
    audio.stop();
    const ok = await recorder.start();
    if (!ok) return;
    setElapsed(0);
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    elapsedTimer.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    setPhase('reciting');
  };

  const finishReciting = () => {
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    recorder.stop();
    setPhase('result');
  };

  const nextRound = () => {
    audio.stop();
    recorder.clear();
    newRound();
  };

  const handleTap = () => {
    if (phase === 'listening') startReciting();
    else if (phase === 'reciting') finishReciting();
    // result : actions via les boutons (pas de tap pour éviter un passage accidentel)
  };

  // ---------- Rendu ----------

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#fdfaf3] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">{loadError}</p>
          <Link href="/exercises/recitation/setup" className="text-[#2d5016] underline">
            Retour à la configuration
          </Link>
        </div>
      </div>
    );
  }

  if (!target || !pagePair) {
    return (
      <div className="min-h-screen bg-[#fdfaf3] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#2d5016] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#4a7c23]">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#fdfaf3] flex flex-col overflow-locked">
      {/* Header avec progression (même format que les autres exercices) */}
      <div className="flex-none bg-[#2d5016] text-white px-4 py-2 flex items-center justify-between">
        <Link href="/exercises/recitation/setup" className="text-sm hover:underline">
          ← Retour
        </Link>
        <span className="text-sm font-medium">
          Pages {toArabicNumbers(pagePair.rightPage)}–{toArabicNumbers(pagePair.leftPage)} • Tour{' '}
          {toArabicNumbers(round)}
          {phase === 'result' && (
            <>
              {' • '}
              <span dir="ltr">Verset {target.verseKey}</span>
            </>
          )}
        </span>
        <span className="text-xs opacity-75">Récitation</span>
      </div>

      {/* Bandeau de consigne (même format que les autres exercices) */}
      <div className="flex-none bg-[#2d5016]/90 text-white px-4 py-1 flex items-center justify-center gap-2">
        {phase === 'listening' && (
          <>
            {audio.isPlaying && (
              <span className="flex gap-0.5">
                <span className="w-0.5 h-3 bg-[#c9a959] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-0.5 h-3 bg-[#c9a959] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-0.5 h-3 bg-[#c9a959] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            )}
            <span className="text-base font-medium">Écoutez l&apos;extrait</span>
            <span className="text-[#c9a959] text-sm">Tapez l&apos;écran pour réciter</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                playSnippet();
              }}
              aria-label="Réécouter l'extrait"
              className="ml-1 w-7 h-7 rounded-full flex items-center justify-center bg-[#c9a959]/20 text-[#c9a959] hover:bg-[#c9a959]/35 active:scale-95 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3z" />
                <path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </>
        )}
        {phase === 'reciting' && (
          <>
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-base font-medium">
              Enregistrement… {toArabicNumbers(Math.floor(elapsed / 60))}:
              {String(elapsed % 60).padStart(2, '0')}
            </span>
            <span className="text-[#c9a959] text-sm">Tapez l&apos;écran pour terminer</span>
          </>
        )}
        {phase === 'result' && (
          <>
            <span className="text-base font-medium">Verset surligné</span>
            <span className="text-[#c9a959] text-sm">Réécoutez votre récitation, puis Suivant</span>
          </>
        )}
      </div>

      {recorder.error && (
        <div className="flex-none bg-red-600 text-white text-xs px-4 py-1.5 text-center">
          {recorder.error}
        </div>
      )}

      {/* Zone Mushaf — identique aux autres exercices, pleine hauteur */}
      <div className="flex-1 min-h-0 relative">
        <MushafDoublePage
          leftPageVerses={leftPageVerses}
          rightPageVerses={rightPageVerses}
          pagePair={pagePair}
          orientation="landscape"
          revealedVerses={new Set([target.verseKey])}
          visibleVerses={new Set([target.verseKey])}
          highlightedVerseKey={phase === 'result' ? target.verseKey : undefined}
          isBlurred={phase === 'listening'}
          maskAll={phase === 'reciting'}
          loading={false}
          onTap={handleTap}
        />

        {/* Panneau de résultat flottant (n'empiète pas sur la mise en page) */}
        {phase === 'result' && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[min(92vw,420px)]">
            <div
              className="bg-[#fdfaf3]/95 backdrop-blur border-2 border-[#c9a959] rounded-2xl shadow-[0_8px_28px_rgba(45,80,22,0.28)] px-4 py-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1.5">
                Votre récitation
              </div>
              {recorder.audioUrl ? (
                <audio controls src={recorder.audioUrl} className="w-full h-9" />
              ) : (
                <p className="text-xs text-gray-400 py-2">Préparation de l&apos;audio…</p>
              )}
              <div className="flex items-center justify-between gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={() => audio.play(target)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-[#c9a959]/40 text-[#2d5016] text-sm font-semibold active:scale-95 transition-all"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3z" />
                    <path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Verset (Husary)
                </button>
                <button
                  type="button"
                  onClick={nextRound}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2d5016] hover:bg-[#4a7c23] text-white text-sm font-bold shadow-md active:scale-95 transition-all"
                >
                  Suivant
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
