'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import MushafDoublePage from '@/components/MushafDoublePage';
import LoginCard from '@/components/exercises/LoginCard';
import { fetchPageVerses } from '@/hooks/usePageVerses';
import { useAudio } from '@/hooks/useAudio';
import { useAudioRecorder } from '@/hooks/exercises/useAudioRecorder';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import {
  getCurrentUser,
  getPriorityVerses,
  logout,
  pickPriorityVerse,
  recordVerseResult,
  recordWordMistakes,
  type MistakeType,
  type WordMistake,
} from '@/utils/exercises/userStats';
import type { PagePair, PageVerses, VersePosition } from '@/types';

/** Durée de l'extrait audio joué au début de chaque tour. */
const SNIPPET_SECONDS = 9;

/** Nombre de doubles pages accessibles avant/après en phase résultat (±5 pages). */
const RESULT_FLIP_RANGE = 5;

type Phase = 'listening' | 'reciting' | 'result';

const MISTAKE_TYPES: { value: MistakeType; label: string }[] = [
  { value: 'oubli', label: 'Oubli' },
  { value: 'inversion', label: 'Inversion' },
  { value: 'harakat', label: 'Harakat' },
  { value: 'mot', label: 'Mot erroné' },
];

function getPagePair(page: number): PagePair {
  const rightPage = page % 2 === 1 ? page : page - 1;
  return {
    rightPage: Math.max(1, rightPage),
    leftPage: Math.min(604, rightPage + 1),
  };
}

/**
 * Exercice « Récitation » :
 * 1. Un verset ALÉATOIRE de la plage est tiré (orienté ~50 % vers vos fautes
 *    mémorisées) ; 9 s de son début sont jouées, double page floutée.
 * 2. Gros bouton rouge → enregistrement du micro, pages toujours floutées.
 * 3. Stop → double page révélée, verset surligné. Vous pouvez : réécouter votre
 *    récitation, sélectionner les mots ratés (oubli / inversion / harakat / mot),
 *    feuilleter ±5 pages, puis répondre Trouvé / Raté (mémorisé pour les quiz).
 * Nécessite une connexion (mémoire des fautes).
 */
export default function RecitationPractice() {
  const searchParams = useSearchParams();
  const startPage = Number(searchParams.get('start')) || 1;
  const endPage = Number(searchParams.get('end')) || startPage;
  const maxRounds = Math.max(1, Number(searchParams.get('n')) || 10);

  // ---------- Connexion (cookie) ----------
  const [user, setUser] = useState<string | null>(null);
  const [userChecked, setUserChecked] = useState(false);
  useEffect(() => {
    setUser(getCurrentUser());
    setUserChecked(true);
  }, []);

  const [round, setRound] = useState(0);
  const [foundCount, setFoundCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [target, setTarget] = useState<VersePosition | null>(null);
  const [pagePair, setPagePair] = useState<PagePair | null>(null);
  const [leftPageVerses, setLeftPageVerses] = useState<PageVerses | null>(null);
  const [rightPageVerses, setRightPageVerses] = useState<PageVerses | null>(null);
  const [phase, setPhase] = useState<Phase>('listening');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Phase résultat : double page affichée (feuilletable ±5 pages autour de la cible)
  const [resultPair, setResultPair] = useState<PagePair | null>(null);
  // Sélection de mots en faute : "verseKey#position" → en attente de type
  const [selectedWords, setSelectedWords] = useState<Map<string, { verseKey: string; position: number; page: number }>>(new Map());
  // Mots déjà déclarés ce tour (restent marqués en rouge)
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set());

  const audio = useAudio();
  const recorder = useAudioRecorder();

  // Vitesse de réécoute de l'enregistrement (×2 par défaut).
  const [playbackRate, setPlaybackRate] = useState(2);
  const playerRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (playerRef.current) playerRef.current.playbackRate = playbackRate;
  }, [playbackRate, recorder.audioUrl]);

  const lastVerseKeyRef = useRef<string | null>(null);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Panneau résultat déplaçable (pour ne pas cacher un verset en bas de page).
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);

  const onPanelDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPanelDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOffset.current || !panelRef.current) return;
    const w = panelRef.current.offsetWidth;
    const h = panelRef.current.offsetHeight;
    const margin = 8;
    const left = Math.max(
      margin,
      Math.min(e.clientX - dragOffset.current.dx, window.innerWidth - w - margin)
    );
    const top = Math.max(
      margin,
      Math.min(e.clientY - dragOffset.current.dy, window.innerHeight - h - margin)
    );
    setPanelPos({ left, top });
  };

  const onPanelDragEnd = () => {
    dragOffset.current = null;
  };

  // ---------- Tirage d'un nouveau tour (biaisé ~50 % vers les fautes) ----------
  const newRound = useCallback(async () => {
    setLoadError(null);
    try {
      let verse: VersePosition | null = null;

      // ~50 % du temps : tirage pondéré parmi les versets en erreur de la plage.
      const priorities = getPriorityVerses(getCurrentUser(), startPage, endPage);
      if (priorities.size > 0 && Math.random() < 0.5) {
        const pick = pickPriorityVerse(priorities);
        if (pick && pick.verseKey !== lastVerseKeyRef.current) {
          const pv = await fetchPageVerses(pick.page);
          verse = pv.verses.find((v) => v.verseKey === pick.verseKey) ?? null;
        }
      }

      // Sinon : page aléatoire → verset aléatoire (tirage uniforme).
      if (!verse) {
        const page = startPage + Math.floor(Math.random() * (endPage - startPage + 1));
        const pageVerses = await fetchPageVerses(page);
        if (pageVerses.verses.length === 0) throw new Error('page vide');
        verse = pageVerses.verses[Math.floor(Math.random() * pageVerses.verses.length)];
        if (verse.verseKey === lastVerseKeyRef.current && pageVerses.verses.length > 1) {
          const others = pageVerses.verses.filter((v) => v.verseKey !== verse!.verseKey);
          verse = others[Math.floor(Math.random() * others.length)];
        }
      }
      lastVerseKeyRef.current = verse.verseKey;

      const pair = getPagePair(verse.page);
      const [left, right] = await Promise.all([
        fetchPageVerses(pair.leftPage),
        fetchPageVerses(pair.rightPage),
      ]);

      setTarget(verse);
      setPagePair(pair);
      setResultPair(pair);
      setLeftPageVerses(left);
      setRightPageVerses(right);
      setSelectedWords(new Map());
      setSavedWords(new Set());
      setRound((r) => r + 1);
      setPhase('listening');
    } catch {
      setLoadError('Impossible de charger la page. Vérifiez votre connexion.');
    }
  }, [startPage, endPage]);

  // Premier tour au montage (après connexion).
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || !user) return;
    startedRef.current = true;
    newRound();
  }, [newRound, user]);

  // ---------- Extrait audio de 9 s du verset cible ----------
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

  /** Réponse Trouvé / Raté : mémorisée, puis tour suivant ou fin de session. */
  const answerRound = (found: boolean) => {
    if (target) {
      recordVerseResult(user, {
        verseKey: target.verseKey,
        page: target.page,
        found,
        exercise: 'recitation',
        at: new Date().toISOString(),
      });
    }
    if (found) setFoundCount((c) => c + 1);
    audio.stop();
    recorder.clear();
    if (round >= maxRounds) setCompleted(true);
    else newRound();
  };

  const restartSession = () => {
    setRound(0);
    setFoundCount(0);
    setCompleted(false);
    lastVerseKeyRef.current = null;
    newRound();
  };

  // ---------- Feuilletage ±5 pages en phase résultat (comme Hifz) ----------
  const flipBounds = useMemo(() => {
    if (!pagePair) return null;
    const lo = Math.max(1, getPagePair(Math.max(1, pagePair.rightPage - RESULT_FLIP_RANGE)).rightPage);
    const hi = Math.min(603, getPagePair(Math.min(604, pagePair.rightPage + RESULT_FLIP_RANGE)).rightPage);
    return { lo, hi };
  }, [pagePair]);

  const canFlipPrev = !!(resultPair && flipBounds && resultPair.rightPage > flipBounds.lo);
  const canFlipNext = !!(resultPair && flipBounds && resultPair.rightPage < flipBounds.hi);

  const flipResult = (direction: 'prev' | 'next') => {
    if (!resultPair || !flipBounds) return;
    let target2 = resultPair.rightPage + (direction === 'next' ? 2 : -2);
    target2 = Math.max(flipBounds.lo, Math.min(flipBounds.hi, target2));
    if (target2 !== resultPair.rightPage) setResultPair(getPagePair(target2));
  };

  // ---------- Sélection des mots en faute (phase résultat) ----------
  const handleZoneClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (phase !== 'result') return;
    const el = (e.target as HTMLElement).closest('[data-verse]');
    if (!el || el.classList.contains('ayah-marker')) return;
    const verseKey = el.getAttribute('data-verse');
    const pos = Number(el.getAttribute('data-pos'));
    const page = Number(el.getAttribute('data-page'));
    if (!verseKey || !Number.isFinite(pos)) return;
    const key = `${verseKey}#${pos}`;
    setSelectedWords((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, { verseKey, position: pos, page });
      return next;
    });
  };

  /** Enregistre les mots sélectionnés avec le type de faute choisi. */
  const declareMistakes = (type: MistakeType) => {
    const at = new Date().toISOString();
    const mistakes: WordMistake[] = Array.from(selectedWords.values()).map((w) => ({
      verseKey: w.verseKey,
      position: w.position,
      page: w.page,
      type,
      at,
    }));
    recordWordMistakes(user, mistakes);
    setSavedWords((prev) => {
      const next = new Set(prev);
      for (const key of selectedWords.keys()) next.add(key);
      return next;
    });
    setSelectedWords(new Map());
  };

  // Mots marqués en rouge sur la page : sélection en cours + déjà déclarés.
  const markedWords = useMemo(() => {
    const set = new Set(savedWords);
    for (const key of selectedWords.keys()) set.add(key);
    return set;
  }, [savedWords, selectedWords]);

  const handleTap = () => {
    if (phase === 'listening') playSnippet();
  };

  // ---------- Rendu ----------

  if (!userChecked) {
    return <div className="min-h-screen bg-[#fdfaf3]" />;
  }

  if (!user) {
    return <LoginCard onLoggedIn={setUser} />;
  }

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

  // Fin de session : nombre de questions atteint
  if (completed) {
    return (
      <div className="min-h-screen bg-[#fdfaf3] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full border-2 border-[#2d5016] text-center">
          <h2 className="text-2xl font-bold text-[#2d5016] mb-2">Session terminée !</h2>
          <p
            className="text-4xl font-bold my-3"
            style={{
              color:
                foundCount >= maxRounds * 0.9
                  ? '#15803d'
                  : foundCount >= maxRounds * 0.6
                    ? '#b45309'
                    : '#dc2626',
            }}
          >
            {toArabicNumbers(foundCount)}/{toArabicNumbers(maxRounds)}
          </p>
          <p className="text-[#4a7c23] mb-4 text-sm">versets trouvés — fautes mémorisées pour {user}</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              onClick={restartSession}
              className="px-4 py-2 bg-[#c9a959] hover:bg-[#b89848] text-white rounded-lg font-semibold"
            >
              Recommencer
            </button>
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-white border-2 border-[#2d5016] text-[#2d5016] hover:bg-[#f0f7ea] rounded-lg font-semibold"
            >
              Tableau de bord
            </Link>
            <Link
              href="/exercises"
              className="px-4 py-2 bg-[#2d5016] hover:bg-[#4a7c23] text-white rounded-lg font-semibold"
            >
              Autres exercices
            </Link>
          </div>
          <button
            onClick={() => {
              logout();
              setUser(null);
            }}
            className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Changer de compte
          </button>
        </div>
      </div>
    );
  }

  if (!target || !pagePair || !resultPair) {
    return (
      <div className="min-h-screen bg-[#fdfaf3] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#2d5016] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#4a7c23]">Chargement...</p>
        </div>
      </div>
    );
  }

  const displayedPair = phase === 'result' ? resultPair : pagePair;

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#fdfaf3] flex flex-col overflow-locked">
      {/* Header avec progression (même format que les autres exercices) */}
      <div className="flex-none bg-[#2d5016] text-white px-4 py-2 flex items-center justify-between">
        <Link href="/exercises/recitation/setup" className="text-sm hover:underline">
          ← Retour
        </Link>
        <span className="text-sm font-medium">
          Pages {toArabicNumbers(displayedPair.rightPage)}–{toArabicNumbers(displayedPair.leftPage)}{' '}
          • Question {toArabicNumbers(Math.min(round, maxRounds))}/{toArabicNumbers(maxRounds)}
          {phase === 'result' && (
            <>
              {' • '}
              <span dir="ltr">Verset {target.verseKey}</span>
            </>
          )}
        </span>
        <span className="text-xs opacity-75">{user}</span>
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
            <span className="text-[#c9a959] text-sm">
              Puis appuyez sur le bouton rouge pour réciter
            </span>
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
            <span className="text-base font-medium">Enregistrement en cours</span>
            <span className="text-[#c9a959] text-sm">Appuyez sur stop quand vous avez terminé</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                playSnippet();
              }}
              aria-label="Faire répéter l'extrait"
              className="ml-1 w-7 h-7 rounded-full flex items-center justify-center bg-[#c9a959]/20 text-[#c9a959] hover:bg-[#c9a959]/35 active:scale-95 transition-all flex-shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3z" />
                <path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </>
        )}
        {phase === 'result' && (
          <>
            <span className="text-base font-medium">Verset surligné</span>
            <span className="text-[#c9a959] text-sm">
              Touchez les mots ratés pour les déclarer • feuilletez avec les flèches
            </span>
          </>
        )}
      </div>

      {recorder.error && (
        <div className="flex-none bg-red-600 text-white text-xs px-4 py-1.5 text-center">
          {recorder.error}
        </div>
      )}

      {/* Zone Mushaf — identique aux autres exercices, pleine hauteur */}
      <div className="flex-1 min-h-0 relative" onClick={handleZoneClick}>
        <MushafDoublePage
          leftPageVerses={leftPageVerses}
          rightPageVerses={rightPageVerses}
          pagePair={displayedPair}
          orientation="landscape"
          revealedVerses={new Set([target.verseKey])}
          visibleVerses={new Set([target.verseKey])}
          highlightedVerseKey={phase === 'result' ? target.verseKey : undefined}
          isBlurred={phase !== 'result'}
          maskAll={false}
          selectedWords={phase === 'result' ? markedWords : undefined}
          loading={false}
          onTap={handleTap}
        />

        {/* Gros bouton rouge : démarrer l'enregistrement (pages floutées) */}
        {phase === 'listening' && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                startReciting();
              }}
              aria-label="Commencer l'enregistrement"
              className="w-24 h-24 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-500 text-white shadow-[0_8px_28px_rgba(220,38,38,0.45)] border-4 border-white active:scale-95 transition-all"
            >
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </button>
            <span className="text-sm font-bold text-[#2d5016] bg-[#fdfaf3]/90 px-3 py-1 rounded-full shadow">
              Réciter
            </span>
          </div>
        )}

        {/* Gros bouton stop + compteur (pages toujours floutées) */}
        {phase === 'reciting' && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3">
            <span className="text-4xl font-bold tabular-nums text-[#2d5016] bg-[#fdfaf3]/95 px-5 py-1.5 rounded-2xl shadow-lg border border-[#c9a959]/40">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                finishReciting();
              }}
              aria-label="Arrêter l'enregistrement"
              className="w-24 h-24 rounded-full flex items-center justify-center bg-red-600 text-white shadow-[0_8px_28px_rgba(220,38,38,0.45)] border-4 border-white active:scale-95 transition-all animate-pulse"
            >
              <svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
            <span className="text-sm font-bold text-[#2d5016] bg-[#fdfaf3]/90 px-3 py-1 rounded-full shadow">
              Stop
            </span>
          </div>
        )}

        {/* Feuilletage ±5 pages (phase résultat, comme Hifz).
            Lecture RTL : avancer = aller vers la GAUCHE. */}
        {phase === 'result' && (
          <>
            <button
              type="button"
              aria-label="Pages précédentes"
              disabled={!canFlipPrev}
              onClick={(e) => {
                e.stopPropagation();
                flipResult('prev');
              }}
              className={`absolute right-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg border border-[#c9a959]/40 transition-opacity ${
                canFlipPrev
                  ? 'bg-[#2d5016]/90 text-[#fdfaf3] hover:bg-[#2d5016] active:scale-95'
                  : 'bg-[#2d5016]/30 text-[#fdfaf3]/40 cursor-not-allowed'
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Pages suivantes"
              disabled={!canFlipNext}
              onClick={(e) => {
                e.stopPropagation();
                flipResult('next');
              }}
              className={`absolute left-2 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full flex items-center justify-center shadow-lg border border-[#c9a959]/40 transition-opacity ${
                canFlipNext
                  ? 'bg-[#2d5016]/90 text-[#fdfaf3] hover:bg-[#2d5016] active:scale-95'
                  : 'bg-[#2d5016]/30 text-[#fdfaf3]/40 cursor-not-allowed'
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 6-6 6 6 6" />
              </svg>
            </button>
          </>
        )}

        {/* Barre de déclaration de fautes : type à choisir pour la sélection */}
        {phase === 'result' && selectedWords.size > 0 && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 w-[min(94vw,480px)]">
            <div
              className="bg-[#fdfaf3]/95 backdrop-blur border-2 border-red-300 rounded-2xl shadow-lg px-3 py-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-widest text-red-600">
                  {toArabicNumbers(selectedWords.size)} mot{selectedWords.size > 1 ? 's' : ''} — type de faute ?
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedWords(new Map())}
                  className="text-[11px] text-gray-400 hover:text-gray-600 underline"
                >
                  Annuler
                </button>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {MISTAKE_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => declareMistakes(t.value)}
                    className="flex-1 min-w-[70px] py-1.5 px-2 rounded-lg text-xs font-bold bg-white border-2 border-red-200 text-red-700 hover:bg-red-600 hover:text-white hover:border-red-600 active:scale-95 transition-all"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Panneau de résultat flottant et DÉPLAÇABLE (poignée en haut) */}
        {phase === 'result' && (
          <div
            ref={panelRef}
            className="fixed z-20 w-[min(92vw,420px)]"
            style={
              panelPos
                ? { left: panelPos.left, top: panelPos.top }
                : { bottom: 12, left: '50%', transform: 'translateX(-50%)' }
            }
          >
            <div
              className="bg-[#fdfaf3]/95 backdrop-blur border-2 border-[#c9a959] rounded-2xl shadow-[0_8px_28px_rgba(45,80,22,0.28)] px-4 pb-3"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Poignée de déplacement */}
              <div
                onPointerDown={onPanelDragStart}
                onPointerMove={onPanelDragMove}
                onPointerUp={onPanelDragEnd}
                onPointerCancel={onPanelDragEnd}
                className="flex items-center justify-between gap-2 pt-2 pb-1.5 cursor-grab active:cursor-grabbing select-none"
                style={{ touchAction: 'none' }}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959]">
                  Votre récitation
                </span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="text-[#c9a959]"
                  aria-hidden
                >
                  <circle cx="9" cy="6" r="1.5" />
                  <circle cx="15" cy="6" r="1.5" />
                  <circle cx="9" cy="12" r="1.5" />
                  <circle cx="15" cy="12" r="1.5" />
                  <circle cx="9" cy="18" r="1.5" />
                  <circle cx="15" cy="18" r="1.5" />
                </svg>
              </div>
              {recorder.audioUrl ? (
                <>
                  <audio
                    ref={playerRef}
                    controls
                    src={recorder.audioUrl}
                    className="w-full h-9"
                    onLoadedMetadata={(e) => {
                      e.currentTarget.playbackRate = playbackRate;
                    }}
                  />
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="text-[10px] uppercase tracking-widest text-[#c9a959] font-bold mr-1">
                      Vitesse
                    </span>
                    {[1, 1.5, 2].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setPlaybackRate(rate)}
                        className={`px-2 py-0.5 rounded-md text-xs font-bold transition-all ${
                          playbackRate === rate
                            ? 'bg-[#2d5016] text-[#fdfaf3]'
                            : 'bg-white border border-[#c9a959]/40 text-[#4a7c23] hover:border-[#c9a959]'
                        }`}
                      >
                        ×{rate === 1.5 ? '1,5' : rate}
                      </button>
                    ))}
                  </div>
                </>
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => answerRound(true)}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[#2d5016] hover:bg-[#4a7c23] text-white text-sm font-bold shadow-md active:scale-95 transition-all"
                  >
                    ✓ Trouvé
                  </button>
                  <button
                    type="button"
                    onClick={() => answerRound(false)}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold shadow-md active:scale-95 transition-all"
                  >
                    ✗ Raté
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
