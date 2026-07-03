'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRecitationVerses } from '@/hooks/exercises/useRecitationVerses';
import { useSpeechRecognition } from '@/hooks/exercises/useSpeechRecognition';
import { normalizeArabicWord } from '@/utils/exercises/arabicNormalization';
import {
  applySpokenWords,
  cloneMatcherState,
  computeScore,
  createMatcherState,
  skipCurrentWord,
  type MatcherState,
  type RecitationWord,
} from '@/lib/exercises/recitationMatcher';
import { toArabicNumbers } from '@/utils/arabicNumbers';

const ARABIC_FONT = "'UthmanicHafs', 'Amiri', 'Scheherazade New', serif";

function spokenToNorms(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeArabicWord)
    .filter((w) => w.length > 0);
}

/** Exercice « Récitation » : réciter au micro, les fautes sont détectées mot à mot. */
export default function RecitationPractice() {
  const searchParams = useSearchParams();
  const startPage = Number(searchParams.get('start')) || 1;
  const endPage = Number(searchParams.get('end')) || startPage;

  const { verses, loading, loadedPages, totalPages, error: loadError } = useRecitationVerses(
    startPage,
    endPage
  );

  // Liste plate des mots de toute la plage (l'ordre suit les versets).
  const words: RecitationWord[] = useMemo(
    () => (verses ? verses.flatMap((v) => v.words) : []),
    [verses]
  );

  // État committé (résultats finaux du micro) + état affiché (committé + provisoire).
  const committedRef = useRef<MatcherState | null>(null);
  const [display, setDisplay] = useState<MatcherState | null>(null);
  const [hideText, setHideText] = useState(false);

  useEffect(() => {
    if (words.length === 0) return;
    committedRef.current = createMatcherState(words.length);
    setDisplay(cloneMatcherState(committedRef.current));
  }, [words]);

  // Fin de l'exercice : dérivé de l'avancement (tous les mots passés).
  const finished = !!display && words.length > 0 && display.pointer >= words.length;

  const wordsRef = useRef(words);
  useEffect(() => {
    wordsRef.current = words;
  }, [words]);

  const handleFinal = useCallback((text: string) => {
    const committed = committedRef.current;
    if (!committed) return;
    applySpokenWords(committed, wordsRef.current, spokenToNorms(text));
    setDisplay(cloneMatcherState(committed));
  }, []);

  const handleInterim = useCallback((text: string) => {
    const committed = committedRef.current;
    if (!committed) return;
    const tentative = cloneMatcherState(committed);
    applySpokenWords(tentative, wordsRef.current, spokenToNorms(text));
    setDisplay(tentative);
  }, []);

  const mic = useSpeechRecognition({ onFinal: handleFinal, onInterim: handleInterim });

  // Couper le micro quand la récitation est terminée.
  const micStopRef = useRef(mic.stop);
  useEffect(() => {
    micStopRef.current = mic.stop;
  }, [mic.stop]);
  useEffect(() => {
    if (finished) micStopRef.current();
  }, [finished]);

  // Auto-scroll : garder le mot courant visible.
  const currentWordRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    currentWordRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [display?.pointer]);

  const handleSkipWord = () => {
    const committed = committedRef.current;
    if (!committed) return;
    skipCurrentWord(committed, wordsRef.current);
    setDisplay(cloneMatcherState(committed));
  };

  const handleRestart = () => {
    mic.stop();
    committedRef.current = createMatcherState(words.length);
    setDisplay(cloneMatcherState(committedRef.current));
  };

  // Index global du premier mot de chaque verset (pour le rendu).
  const verseStarts = useMemo(() => {
    const starts: number[] = [];
    let acc = 0;
    for (const v of verses ?? []) {
      starts.push(acc);
      acc += v.words.length;
    }
    return starts;
  }, [verses]);

  const score = useMemo(
    () => (display ? computeScore(display, words) : null),
    [display, words]
  );

  // Verset courant (celui du mot au pointeur) pour l'entête.
  const currentVerse = useMemo(() => {
    if (!display || !verses || words.length === 0) return null;
    const idx = Math.min(display.pointer, words.length - 1);
    const key = words[idx].verseKey;
    return verses.find((v) => v.verseKey === key) ?? null;
  }, [display, verses, words]);

  const verseNumberDone = useMemo(() => {
    if (!display || !verses) return 0;
    let count = 0;
    let offset = 0;
    for (const v of verses) {
      offset += v.words.length;
      if (display.pointer >= offset) count++;
      else break;
    }
    return count;
  }, [display, verses]);

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

  if (loading || !display || !verses) {
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

  // Écran de fin
  if (finished && score) {
    const faultWords = words
      .map((w, i) => ({ ...w, status: display.statuses[i] }))
      .filter((w) => w.status === 'missed' || w.status === 'error');
    return (
      <div className="min-h-screen bg-[#fdfaf3] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full border-2 border-[#2d5016]">
          <h2 className="text-2xl font-bold text-[#2d5016] mb-1 text-center">
            Récitation terminée !
          </h2>
          <p className="text-center text-4xl font-bold my-3" style={{ color: score.accuracy >= 90 ? '#15803d' : score.accuracy >= 70 ? '#b45309' : '#dc2626' }}>
            {score.accuracy}%
          </p>
          <div className="grid grid-cols-3 gap-2 text-center text-sm mb-4">
            <div className="bg-[#f0f7ea] rounded-lg py-2">
              <div className="font-bold text-[#15803d]">{toArabicNumbers(score.correct)}</div>
              <div className="text-[11px] text-gray-500">justes</div>
            </div>
            <div className="bg-[#fdf6e9] rounded-lg py-2">
              <div className="font-bold text-[#b45309]">{toArabicNumbers(score.corrected)}</div>
              <div className="text-[11px] text-gray-500">corrigés</div>
            </div>
            <div className="bg-[#fdeeee] rounded-lg py-2">
              <div className="font-bold text-[#dc2626]">{toArabicNumbers(score.faults)}</div>
              <div className="text-[11px] text-gray-500">fautes</div>
            </div>
          </div>

          {faultWords.length > 0 && (
            <div className="mb-4 max-h-44 overflow-y-auto rounded-xl border border-[#c9a959]/30 bg-[#fdfaf3] p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-2">
                Mots à revoir
              </div>
              <div className="flex flex-wrap gap-1.5" dir="rtl">
                {faultWords.map((w, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 bg-white border border-red-200 text-red-700 rounded-lg px-2 py-0.5 text-lg"
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
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={handleRestart}
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

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#fdfaf3] flex flex-col">
      {/* Barre du haut */}
      <div className="flex-none bg-[#2d5016] text-white px-4 py-2 flex items-center justify-between">
        <Link href="/exercises/recitation/setup" className="text-sm hover:underline">
          ← Retour
        </Link>
        <span className="text-sm font-medium">
          Verset {toArabicNumbers(Math.min(verseNumberDone + 1, verses.length))}/
          {toArabicNumbers(verses.length)}
          {currentVerse ? ` • Page ${toArabicNumbers(currentVerse.page)}` : ''}
        </span>
        <span className="text-xs opacity-75">Récitation</span>
      </div>

      {/* Sous-barre : score live + masquage */}
      <div className="flex-none bg-[#2d5016]/90 text-white px-4 py-1.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="text-[#8fce6a] font-semibold">✓ {toArabicNumbers(score?.correct ?? 0)}</span>
          <span className="text-[#e8b64c] font-semibold">↺ {toArabicNumbers(score?.corrected ?? 0)}</span>
          <span className="text-[#ff8a8a] font-semibold">✗ {toArabicNumbers(score?.faults ?? 0)}</span>
        </div>
        <button
          type="button"
          onClick={() => setHideText((h) => !h)}
          className="flex items-center gap-1.5 font-semibold text-[#c9a959] hover:text-[#fdfaf3] transition-colors"
        >
          {hideText ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
              <path d="m2 2 20 20" />
            </svg>
          )}
          {hideText ? 'Afficher le texte' : 'Masquer le texte'}
        </button>
      </div>

      {mic.error && (
        <div className="flex-none bg-red-600 text-white text-xs px-4 py-1.5 text-center">
          {mic.error}
        </div>
      )}

      {/* Texte des versets */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
        <div
          className="max-w-2xl mx-auto leading-[2.4] text-justify"
          dir="rtl"
          style={{ fontFamily: ARABIC_FONT, fontSize: 'clamp(24px, 5.5vw, 34px)' }}
        >
          {verses.map((verse, verseIndex) => {
            const start = verseStarts[verseIndex];
            return (
                <span key={verse.verseKey}>
                  {verse.words.map((w, i) => {
                    const gi = start + i;
                    const status = display.statuses[gi];
                    const isCurrent = gi === display.pointer && !finished;
                    const revealed = status !== 'pending' || !hideText;

                    let color = '#1a1a1a';
                    if (status === 'correct') color = '#15803d';
                    else if (status === 'corrected') color = '#b45309';
                    else if (status === 'missed' || status === 'error') color = '#dc2626';
                    else if (status === 'skipped') color = '#9ca3af';
                    else if (w.optional) color = '#7a8b3e';

                    return (
                      <span key={gi}>
                        <span
                          ref={isCurrent ? currentWordRef : undefined}
                          className={`rounded-md px-0.5 transition-colors duration-200 ${
                            isCurrent ? 'bg-[#c9a959]/25 shadow-[inset_0_-3px_0_#c9a959]' : ''
                          }`}
                          style={{
                            color: revealed ? color : 'transparent',
                            background: revealed
                              ? undefined
                              : 'rgba(45, 80, 22, 0.08)',
                          }}
                        >
                          {w.display}
                        </span>{' '}
                      </span>
                    );
                  })}
                  {/* Marqueur de fin de verset */}
                  <span className="text-[#c9a959] select-none" style={{ fontSize: '0.75em' }}>
                    ﴿{toArabicNumbers(verse.ayah)}﴾
                  </span>{' '}
              </span>
            );
          })}
        </div>
        <div className="h-32" />
      </div>

      {/* Contrôles bas */}
      <div className="flex-none bg-white/90 backdrop-blur border-t border-[#c9a959]/30 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleRestart}
            className="w-12 h-12 rounded-full flex items-center justify-center bg-[#fdfaf3] border border-[#c9a959]/40 text-[#2d5016] active:scale-95 transition-all"
            aria-label="Recommencer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>

          <button
            type="button"
            onClick={mic.listening ? mic.stop : mic.start}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all ${
              mic.listening
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-[#2d5016] text-[#fdfaf3] hover:bg-[#4a7c23]'
            }`}
            aria-label={mic.listening ? 'Arrêter le micro' : 'Démarrer le micro'}
          >
            {mic.listening ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <rect x="7" y="7" width="10" height="10" rx="1.5" />
              </svg>
            ) : (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={handleSkipWord}
            className="w-12 h-12 rounded-full flex items-center justify-center bg-[#fdfaf3] border border-[#c9a959]/40 text-[#2d5016] active:scale-95 transition-all"
            aria-label="Passer le mot"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m13 17 5-5-5-5" />
              <path d="m6 17 5-5-5-5" />
            </svg>
          </button>
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-1.5">
          {mic.listening
            ? 'Récitez : les mots se valident au fur et à mesure'
            : 'Appuyez sur le micro pour commencer à réciter'}
        </p>
      </div>
    </div>
  );
}
