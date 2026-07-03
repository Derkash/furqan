'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import MushafDoublePage from '@/components/MushafDoublePage';
import { useRecitationVerses, type RecitationVerse } from '@/hooks/exercises/useRecitationVerses';
import { useSpeechRecognition } from '@/hooks/exercises/useSpeechRecognition';
import { useAudio } from '@/hooks/useAudio';
import { normalizeArabicWord } from '@/utils/exercises/arabicNormalization';
import {
  analyzeRecitation,
  type RecitationAnalysis,
  type RecitationWord,
} from '@/lib/exercises/recitationMatcher';
import { toGlobalAyahNumber } from '@/utils/ayahMapping';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import type { PagePair, VersePosition } from '@/types';
import type { VersePositionType } from '@/types/exercises';

const ARABIC_FONT = "'UthmanicHafs', 'Amiri', 'Scheherazade New', serif";

/** Durée de l'extrait audio joué au début de chaque tour. */
const SNIPPET_SECONDS = 2;

type Phase = 'listening' | 'reciting' | 'result';

interface RoundResult {
  verseKey: string;
  accuracy: number;
  faults: number;
}

function getPagePair(page: number): PagePair {
  const rightPage = page % 2 === 1 ? page : page - 1;
  return {
    rightPage: Math.max(1, rightPage),
    leftPage: Math.min(604, rightPage + 1),
  };
}

function toVersePosition(v: RecitationVerse): VersePosition {
  return {
    verseKey: v.verseKey,
    surah: v.surah,
    verse: v.ayah,
    page: v.page,
    lines: [],
    globalNumber: toGlobalAyahNumber(v.surah, v.ayah),
  };
}

function spokenToNorms(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeArabicWord)
    .filter((w) => w.length > 0);
}

/**
 * Exercice « Récitation » sur la double page Mushaf :
 * 1. Extrait audio de 2 s du verset cible, page floutée.
 * 2. Micro : réciter de mémoire autant de versets que voulu, tout est masqué.
 * 3. Analyse globale de la récitation → verdict, versets révélés, fautes listées.
 */
export default function RecitationPractice() {
  const searchParams = useSearchParams();
  const startPage = Number(searchParams.get('start')) || 1;
  const endPage = Number(searchParams.get('end')) || startPage;
  const startPosition = (searchParams.get('pos') ?? 'first') as VersePositionType;

  const { verses, loading, loadedPages, totalPages, error: loadError } = useRecitationVerses(
    startPage,
    endPage
  );

  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('listening');
  const [analysis, setAnalysis] = useState<RecitationAnalysis | null>(null);
  // Fenêtre de mots attendus utilisée par la dernière analyse (pour lister les fautes).
  const [analyzedWords, setAnalyzedWords] = useState<RecitationWord[]>([]);
  const [rounds, setRounds] = useState<RoundResult[]>([]);
  const [completed, setCompleted] = useState(false);
  const [heardWords, setHeardWords] = useState(0);

  // Choix du verset cible du premier tour, selon la position demandée,
  // parmi les versets de la première page de la plage.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!verses || verses.length === 0 || targetIndex !== null) return;
    const firstPage = verses[0].page;
    const onPage = verses.filter((v) => v.page === firstPage);
    let localIdx = 0;
    if (startPosition === 'middle') localIdx = Math.floor(onPage.length / 2);
    else if (startPosition === 'last') localIdx = onPage.length - 1;
    else if (startPosition === 'random') localIdx = Math.floor(Math.random() * onPage.length);
    setTargetIndex(verses.indexOf(onPage[localIdx] ?? verses[0]));
  }, [verses, targetIndex, startPosition]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const target = targetIndex !== null && verses ? (verses[targetIndex] ?? null) : null;
  const pagePair = useMemo(() => (target ? getPagePair(target.page) : null), [target]);

  // ---------- Audio : extrait de 2 s du verset cible ----------
  const audio = useAudio();
  const snippetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playSnippet = useCallback(() => {
    if (!target) return;
    if (snippetTimer.current) clearTimeout(snippetTimer.current);
    audio.play(toVersePosition(target));
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
    };
  }, []);

  // ---------- Micro : accumulation du transcript ----------
  const finalsRef = useRef<string[]>([]);
  const interimRef = useRef('');

  const handleFinal = useCallback((text: string) => {
    finalsRef.current.push(text);
    interimRef.current = '';
    setHeardWords(spokenToNorms(finalsRef.current.join(' ')).length);
  }, []);

  const handleInterim = useCallback((text: string) => {
    interimRef.current = text;
    setHeardWords(
      spokenToNorms(finalsRef.current.join(' ')).length + spokenToNorms(text).length
    );
  }, []);

  const mic = useSpeechRecognition({ onFinal: handleFinal, onInterim: handleInterim });

  // ---------- Transitions ----------
  const startReciting = () => {
    if (snippetTimer.current) clearTimeout(snippetTimer.current);
    audio.stop();
    finalsRef.current = [];
    interimRef.current = '';
    setHeardWords(0);
    mic.start();
    setPhase('reciting');
  };

  const finishReciting = () => {
    mic.stop();
    if (!verses || targetIndex === null) return;

    const spoken = spokenToNorms(
      [...finalsRef.current, interimRef.current].join(' ')
    );
    // Fenêtre attendue : du verset cible jusqu'à la fin de la plage,
    // bornée par la longueur de la récitation (l'analyse reste instantanée).
    const allExpected = verses.slice(targetIndex).flatMap((v) => v.words);
    const windowSize = Math.min(allExpected.length, spoken.length * 2 + 40);
    const expected = allExpected.slice(0, windowSize);

    const result = analyzeRecitation(expected, spoken);
    setAnalyzedWords(expected);
    setAnalysis(result);
    if (result.score.attempted > 0 && target) {
      setRounds((prev) => [
        ...prev,
        { verseKey: target.verseKey, accuracy: result.score.accuracy, faults: result.score.faults },
      ]);
    }
    setPhase('result');
  };

  // Versets entièrement couverts par la dernière analyse.
  const fullyAttemptedCount = useMemo(() => {
    if (!analysis || !verses || targetIndex === null) return 0;
    let count = 0;
    let cum = 0;
    for (let i = targetIndex; i < verses.length; i++) {
      cum += verses[i].words.length;
      if (analysis.attemptedWordCount >= cum) count++;
      else break;
    }
    return count;
  }, [analysis, verses, targetIndex]);

  // Versets à révéler en phase résultat (tous ceux touchés par la récitation).
  const attemptedVerseKeys = useMemo(() => {
    if (!analysis) return new Set<string>();
    const keys = new Set<string>();
    for (let k = 0; k < analysis.attemptedWordCount; k++) {
      keys.add(analyzedWords[k].verseKey);
    }
    return keys;
  }, [analysis, analyzedWords]);

  const faultWords = useMemo(() => {
    if (!analysis) return [];
    return analyzedWords
      .map((w, i) => ({ ...w, status: analysis.statuses[i] }))
      .filter((w) => w.status === 'error' || w.status === 'missed');
  }, [analysis, analyzedWords]);

  const retryRound = () => {
    setAnalysis(null);
    setPhase('listening');
  };

  const continueNext = () => {
    if (!verses || targetIndex === null) return;
    const next = targetIndex + Math.max(1, fullyAttemptedCount);
    setAnalysis(null);
    if (next >= verses.length) {
      setCompleted(true);
    } else {
      setTargetIndex(next);
      setPhase('listening');
    }
  };

  const restartSession = () => {
    setRounds([]);
    setCompleted(false);
    setAnalysis(null);
    setTargetIndex(null);
    setPhase('listening');
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

  if (loading || !verses || targetIndex === null || !target || !pagePair) {
    return (
      <div className="min-h-screen bg-[#fdfaf3] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#2d5016] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#4a7c23]">
            Chargement du texte… {loadedPages}/{totalPages} pages
          </p>
        </div>
      </div>
    );
  }

  if (!mic.supported) {
    return (
      <div className="min-h-screen bg-[#fdfaf3] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full border-2 border-[#c9a959] text-center">
          <h2 className="text-xl font-bold text-[#2d5016] mb-2">Micro non disponible</h2>
          <p className="text-gray-600 text-sm mb-4">
            La reconnaissance vocale n&apos;est pas disponible sur ce navigateur. Utilisez
            Chrome (Android/ordinateur) ou Safari (iPhone/iPad).
          </p>
          <Link href="/exercises" className="text-[#2d5016] underline">
            Retour aux exercices
          </Link>
        </div>
      </div>
    );
  }

  // Écran de fin de session
  if (completed) {
    const avg =
      rounds.length > 0
        ? Math.round(rounds.reduce((s, r) => s + r.accuracy, 0) / rounds.length)
        : 0;
    const totalFaults = rounds.reduce((s, r) => s + r.faults, 0);
    return (
      <div className="min-h-screen bg-[#fdfaf3] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full border-2 border-[#2d5016] text-center">
          <h2 className="text-2xl font-bold text-[#2d5016] mb-2">Plage terminée !</h2>
          <p
            className="text-4xl font-bold my-3"
            style={{ color: avg >= 90 ? '#15803d' : avg >= 70 ? '#b45309' : '#dc2626' }}
          >
            {avg}%
          </p>
          <p className="text-[#4a7c23] mb-4 text-sm">
            {toArabicNumbers(rounds.length)} récitation{rounds.length > 1 ? 's' : ''} •{' '}
            {toArabicNumbers(totalFaults)} faute{totalFaults > 1 ? 's' : ''} au total
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={restartSession}
              className="px-4 py-2 bg-[#c9a959] hover:bg-[#b89848] text-white rounded-lg font-semibold"
            >
              Recommencer
            </button>
            <Link
              href="/exercises"
              className="px-4 py-2 bg-[#2d5016] hover:bg-[#4a7c23] text-white rounded-lg font-semibold"
            >
              Autres exercices
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const verdict =
    analysis && analysis.score.attempted > 0
      ? analysis.score.accuracy >= 95
        ? { label: 'Excellent, c’est bon !', color: '#15803d' }
        : analysis.score.accuracy >= 85
          ? { label: 'Bien — quelques fautes à revoir', color: '#b45309' }
          : { label: 'À retravailler', color: '#dc2626' }
      : null;

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#fdfaf3] flex flex-col">
      {/* Barre du haut */}
      <div className="flex-none bg-[#2d5016] text-white px-4 py-2 flex items-center justify-between">
        <Link href="/exercises/recitation/setup" className="text-sm hover:underline">
          ← Retour
        </Link>
        <span className="text-sm font-medium">
          Pages {toArabicNumbers(pagePair.rightPage)}–{toArabicNumbers(pagePair.leftPage)}
          {' • '}
          {phase === 'result' ? (
            <span dir="ltr">Verset {target.verseKey}</span>
          ) : (
            'Verset ؟'
          )}
        </span>
        <span className="text-xs opacity-75">Récitation</span>
      </div>

      {/* Bandeau de consigne */}
      <div className="flex-none bg-[#2d5016]/90 text-white px-4 py-1.5 flex items-center justify-center gap-2 text-sm">
        {phase === 'listening' && (
          <>
            {audio.isPlaying && (
              <span className="flex gap-0.5">
                <span className="w-0.5 h-3 bg-[#c9a959] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-0.5 h-3 bg-[#c9a959] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-0.5 h-3 bg-[#c9a959] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            )}
            <span>Écoutez le début du verset, puis récitez de mémoire</span>
          </>
        )}
        {phase === 'reciting' && (
          <>
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span>
              Récitez autant de versets que vous voulez —{' '}
              {toArabicNumbers(heardWords)} mot{heardWords > 1 ? 's' : ''} capté
              {heardWords > 1 ? 's' : ''}
            </span>
          </>
        )}
        {phase === 'result' && verdict && (
          <span className="font-semibold" style={{ color: verdict.color === '#15803d' ? '#8fce6a' : verdict.color === '#b45309' ? '#e8b64c' : '#ff8a8a' }}>
            {verdict.label} — {analysis!.score.accuracy}% ({toArabicNumbers(analysis!.score.faults)} faute{analysis!.score.faults > 1 ? 's' : ''})
          </span>
        )}
        {phase === 'result' && !verdict && (
          <span className="text-[#e8b64c]">Aucune récitation détectée — réessayez</span>
        )}
      </div>

      {mic.error && (
        <div className="flex-none bg-red-600 text-white text-xs px-4 py-1.5 text-center">
          {mic.error}
        </div>
      )}

      {/* Double page Mushaf */}
      <div className="flex-1 min-h-0 relative">
        <MushafDoublePage
          leftPageVerses={null}
          rightPageVerses={null}
          pagePair={pagePair}
          orientation="landscape"
          revealedVerses={attemptedVerseKeys}
          visibleVerses={phase === 'result' ? attemptedVerseKeys : new Set()}
          highlightedVerseKey={phase === 'result' ? target.verseKey : undefined}
          isBlurred={phase === 'listening'}
          maskAll={phase !== 'listening'}
          loading={false}
          onTap={phase === 'listening' ? playSnippet : () => {}}
        />
      </div>

      {/* Panneau résultat : fautes détectées */}
      {phase === 'result' && faultWords.length > 0 && (
        <div className="flex-none bg-white border-t border-[#c9a959]/30 px-4 py-2 max-h-28 overflow-y-auto">
          <div className="max-w-2xl mx-auto">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1">
              Mots à revoir
            </div>
            <div className="flex flex-wrap gap-1.5" dir="rtl">
              {faultWords.map((w, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 bg-[#fdfaf3] border border-red-200 text-red-700 rounded-lg px-2 py-0.5 text-lg"
                  style={{ fontFamily: ARABIC_FONT }}
                >
                  {w.display}
                  <span className="text-[10px] text-gray-400" dir="ltr">
                    {w.verseKey}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Contrôles bas */}
      <div className="flex-none bg-white/90 backdrop-blur border-t border-[#c9a959]/30 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-center gap-4">
          {phase === 'listening' && (
            <>
              <button
                type="button"
                onClick={playSnippet}
                className="w-12 h-12 rounded-full flex items-center justify-center bg-[#fdfaf3] border border-[#c9a959]/40 text-[#2d5016] active:scale-95 transition-all"
                aria-label="Réécouter l'extrait"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3z" />
                  <path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={startReciting}
                className="h-14 px-6 rounded-full flex items-center gap-2 bg-[#2d5016] text-[#fdfaf3] hover:bg-[#4a7c23] shadow-lg active:scale-95 transition-all font-bold"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
                Je récite
              </button>
            </>
          )}

          {phase === 'reciting' && (
            <button
              type="button"
              onClick={finishReciting}
              className="h-14 px-6 rounded-full flex items-center gap-2 bg-red-600 text-white shadow-lg active:scale-95 transition-all font-bold animate-pulse"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              Terminer ma récitation
            </button>
          )}

          {phase === 'result' && (
            <>
              <button
                type="button"
                onClick={retryRound}
                className="h-12 px-5 rounded-full flex items-center gap-2 bg-[#fdfaf3] border border-[#c9a959]/40 text-[#2d5016] active:scale-95 transition-all font-semibold"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                Réessayer
              </button>
              <button
                type="button"
                onClick={continueNext}
                className="h-12 px-5 rounded-full flex items-center gap-2 bg-[#2d5016] text-[#fdfaf3] hover:bg-[#4a7c23] shadow-lg active:scale-95 transition-all font-bold"
              >
                Continuer
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
