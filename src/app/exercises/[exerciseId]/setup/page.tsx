'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getExerciseDefinition, isValidExerciseId } from '@/utils/exercises/exerciseRegistry';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import RangePicker, { type RangePickerValue } from '@/components/exercises/RangePicker';
import { unitToPageRange } from '@/utils/exercises/rangeToPages';
import { useQuranUnits } from '@/hooks/exercises/useQuranUnits';
import { loadSetup, saveSetup } from '@/utils/exercises/exerciseMemory';
import type { VersePositionType } from '@/types/exercises';
import Link from 'next/link';

const POSITION_OPTIONS: { value: VersePositionType; label: string }[] = [
  { value: 'first', label: 'Premier' },
  { value: 'middle', label: 'Milieu' },
  { value: 'last', label: 'Dernier' },
];

const IDENTIFY_OPTIONS: { value: VersePositionType; label: string }[] = [
  ...POSITION_OPTIONS,
  { value: 'random', label: 'Aléatoire' },
];

// À découvrir ensuite : positions de page + le verset précédant celui écouté.
const REVEAL_OPTIONS: { value: VersePositionType; label: string }[] = [
  { value: 'previous', label: 'Précédent' },
  ...POSITION_OPTIONS,
];

const DURATION_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Complet' },
  { value: 3, label: '3 s' },
  { value: 6, label: '6 s' },
  { value: 9, label: '9 s' },
  { value: 12, label: '12 s' },
];

const FRACTION_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1/6' },
  { value: 2, label: '2/6' },
  { value: 3, label: '3/6' },
  { value: 4, label: '4/6' },
  { value: 5, label: '5/6' },
  { value: 6, label: 'Tout' },
];

// Temps autorisé (mode « taper l'écran ») avant la révélation automatique.
const TIMEOUT_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Sans limite' },
  { value: 10, label: '10 s' },
  { value: 20, label: '20 s' },
  { value: 30, label: '30 s' },
];

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}

function SingleSelect({
  options,
  value,
  onChange,
}: {
  options: { value: VersePositionType; label: string }[];
  value: VersePositionType;
  onChange: (v: VersePositionType) => void;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 min-w-[68px] py-2 px-2 rounded-lg text-sm font-bold border-2 transition-all ${
              active
                ? 'bg-[#2d5016] text-[#fdfaf3] border-[#2d5016] shadow-md'
                : 'bg-white text-[#4a7c23] border-[#c9a959]/30 hover:border-[#c9a959]'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function NumberSelect({
  options,
  value,
  onChange,
}: {
  options: { value: number; label: string }[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 min-w-[52px] py-2 px-2 rounded-lg text-sm font-bold border-2 transition-all ${
              active
                ? 'bg-[#2d5016] text-[#fdfaf3] border-[#2d5016] shadow-md'
                : 'bg-white text-[#4a7c23] border-[#c9a959]/30 hover:border-[#c9a959]'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function MultiSelect({
  options,
  selected,
  onToggle,
}: {
  options: { value: VersePositionType; label: string }[];
  selected: VersePositionType[];
  onToggle: (v: VersePositionType) => void;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o) => {
        const active = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={`flex-1 min-w-[68px] py-2 px-2 rounded-lg text-sm font-bold border-2 transition-all ${
              active
                ? 'bg-[#4a7c23] text-white border-[#4a7c23] shadow-md'
                : 'bg-white text-[#4a7c23] border-[#c9a959]/30 hover:border-[#c9a959]'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const params = useParams();
  const exerciseId = params.exerciseId as string;

  const { data: units } = useQuranUnits();

  const isAudioQuiz = exerciseId === 'audio-quiz';
  const isSequential = exerciseId === 'sequential';
  const isPageNumber = exerciseId === 'page-number';

  // Aucune valeur pré-saisie au premier rendu (évite aussi un décalage d'hydratation SSR).
  const [range, setRange] = useState<RangePickerValue>({ mode: 'page', start: null, end: null });
  // Choix spécifiques (avec des défauts sensés ; la mémoire les remplace au montage si présents).
  const [identifyPosition, setIdentifyPosition] = useState<VersePositionType>('random');
  const [revealAfter, setRevealAfter] = useState<VersePositionType[]>([]);
  const [audioSeconds, setAudioSeconds] = useState<number>(0);
  const [revealFraction, setRevealFraction] = useState<number>(6);
  const [answerMode, setAnswerMode] = useState<'tap' | 'recite'>('tap');
  const [revealTimeout, setRevealTimeout] = useState<number>(0);
  const [showPositions, setShowPositions] = useState<VersePositionType[]>(
    isPageNumber ? ['first', 'middle', 'last'] : ['first']
  );
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [error, setError] = useState<string | null>(null);

  const isHifz = exerciseId === 'hifz';

  // Restauration des derniers réglages pour cet exercice (proposés par défaut).
  // Lecture localStorage après montage → 1er rendu vide (pas de décalage d'hydratation).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = loadSetup(exerciseId);
    if (!saved) return;
    if (saved.mode != null || saved.start != null || saved.end != null) {
      setRange({
        mode: saved.mode ?? 'page',
        start: saved.start ?? null,
        end: saved.end ?? null,
      });
    } else if (saved.singlePage != null) {
      // Rétro-compat : ancien Hifz enregistré en page unique → proposer la même page en plage.
      setRange({ mode: 'page', start: saved.singlePage, end: saved.singlePage });
    }
    if (saved.identifyPosition) setIdentifyPosition(saved.identifyPosition);
    if (saved.revealAfter) setRevealAfter(saved.revealAfter);
    if (saved.audioSeconds != null) setAudioSeconds(saved.audioSeconds);
    if (saved.revealFraction != null) setRevealFraction(saved.revealFraction);
    if (saved.answerMode) setAnswerMode(saved.answerMode);
    if (saved.revealTimeout != null) setRevealTimeout(saved.revealTimeout);
    if (saved.showPositions) setShowPositions(saved.showPositions);
    if (saved.direction) setDirection(saved.direction);
    if (saved.questionCount) setQuestionCount(saved.questionCount);
  }, [exerciseId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { startPage, endPage } = useMemo(
    () => unitToPageRange(range.mode, range.start, range.end, units),
    [range, units]
  );

  if (!isValidExerciseId(exerciseId)) {
    return (
      <div className="min-h-screen bg-[#fdfaf3] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">Exercice non trouvé</p>
          <Link href="/exercises" className="text-[#2d5016] underline">
            Retour aux exercices
          </Link>
        </div>
      </div>
    );
  }

  const exercise = getExerciseDefinition(exerciseId);
  if (!exercise) {
    return null;
  }

  const toggleReveal = (p: VersePositionType) =>
    setRevealAfter((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  const toggleShow = (p: VersePositionType) =>
    setShowPositions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (range.start == null || range.end == null) {
      setError('Veuillez saisir un début et une fin');
      return;
    }
    if (startPage == null || endPage == null) {
      setError('Plage invalide');
      return;
    }
    const lo = Math.min(startPage, endPage);
    const hi = Math.max(startPage, endPage);
    if (lo < 1 || hi > 604) {
      setError('La plage doit être entre 1 et 604');
      return;
    }

    if ((isSequential || isPageNumber) && showPositions.length === 0) {
      setError('Choisissez au moins un verset à afficher');
      return;
    }

    const query = new URLSearchParams({ start: String(lo), end: String(hi) });

    // Nombre de questions (tous les exercices sauf Hifz, qui est une lecture libre)
    const count = Math.max(1, Math.min(200, Math.round(questionCount) || 1));
    if (!isHifz) query.set('n', String(count));
    const base = {
      mode: range.mode,
      start: range.start,
      end: range.end,
      ...(isHifz ? {} : { questionCount: count }),
    };

    if (isAudioQuiz) {
      query.set('identify', identifyPosition);
      if (revealAfter.length > 0) query.set('reveal', revealAfter.join(','));
      if (audioSeconds > 0) query.set('dur', String(audioSeconds));
      if (revealFraction >= 1 && revealFraction < 6) query.set('frac', String(revealFraction));
      if (answerMode === 'recite') query.set('ans', 'recite');
      // Temps autorisé : uniquement en mode « taper l'écran » (la récitation gère
      // sa propre temporisation via la fin de l'enregistrement).
      if (answerMode === 'tap' && revealTimeout > 0) query.set('to', String(revealTimeout));
      saveSetup(exerciseId, {
        ...base,
        identifyPosition,
        revealAfter,
        audioSeconds,
        revealFraction,
        answerMode,
        revealTimeout,
      });
    } else if (isSequential) {
      query.set('show', showPositions.join(','));
      query.set('dir', direction);
      saveSetup(exerciseId, { ...base, showPositions, direction });
    } else if (isPageNumber) {
      query.set('show', showPositions.join(','));
      saveSetup(exerciseId, { ...base, showPositions });
    } else {
      saveSetup(exerciseId, base);
    }

    router.push(`/exercises/${exerciseId}/practice?${query.toString()}`);
  };

  const hasPageRange = startPage != null && endPage != null;
  const pageCount = hasPageRange ? Math.abs(endPage! - startPage!) + 1 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fdfaf3] via-[#fdfaf3] to-[#f4e9d0] p-4 pb-12" dir="ltr">
      <div className="max-w-md mx-auto">
        <Link
          href="/exercises"
          className="text-[#4a7c23] text-sm hover:underline mb-4 inline-block"
        >
          ← Retour aux exercices
        </Link>

        <div className="bg-white rounded-2xl shadow-lg p-5 border border-[#c9a959]/20">
          <h1 className="text-xl font-bold text-[#2d5016] mb-1">{exercise.name}</h1>
          <p
            className="text-[#7a8b3e] font-semibold text-sm mb-3"
            dir="rtl"
            style={{ fontFamily: "'Amiri', 'Scheherazade New', serif" }}
          >
            {exercise.nameArabic}
          </p>
          <p className="text-gray-500 text-sm mb-5">{exercise.description}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <RangePicker value={range} onChange={setRange} chapters={units?.chapters ?? []} />

            {/* Récap de la plage en pages */}
            <div className="bg-[#fdfaf3] border border-[#c9a959]/30 rounded-xl p-3 text-center">
              <div className="text-[10px] uppercase tracking-widest text-[#c9a959] font-bold">
                Plage de pages
              </div>
              <div className="text-lg font-bold text-[#2d5016] mt-1">
                {hasPageRange
                  ? `${Math.min(startPage!, endPage!)} → ${Math.max(startPage!, endPage!)}`
                  : '—'}
              </div>
              <div className="text-xs text-[#7a8b3e] mt-0.5">
                {hasPageRange
                  ? `${toArabicNumbers(pageCount)} page${pageCount > 1 ? 's' : ''}`
                  : 'Saisissez un début et une fin'}
              </div>
            </div>

            {/* Choix spécifiques : Quiz audio */}
            {isAudioQuiz && (
              <>
                <OptionGroup label="Verset à identifier (audio)">
                  <SingleSelect
                    options={IDENTIFY_OPTIONS}
                    value={identifyPosition}
                    onChange={setIdentifyPosition}
                  />
                </OptionGroup>
                <OptionGroup label="Durée de l'extrait audio (question)">
                  <NumberSelect options={DURATION_OPTIONS} value={audioSeconds} onChange={setAudioSeconds} />
                  <p className="text-[11px] text-gray-400 mt-1">La récitation de la question s&apos;arrête après cette durée.</p>
                </OptionGroup>
                <OptionGroup label="À découvrir ensuite (sans audio)">
                  <MultiSelect options={REVEAL_OPTIONS} selected={revealAfter} onToggle={toggleReveal} />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Optionnel — « Précédent » = le verset juste avant celui écouté.
                  </p>
                </OptionGroup>
                <OptionGroup label="Partie du verset révélée en réponse">
                  <NumberSelect options={FRACTION_OPTIONS} value={revealFraction} onChange={setRevealFraction} />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Ex : 2/6 = seul le premier tiers du verset est montré.
                  </p>
                </OptionGroup>
                <OptionGroup label="Réponse aux questions">
                  <div className="flex gap-1.5">
                    {([
                      { value: 'tap', label: 'Taper l’écran' },
                      { value: 'recite', label: '🎙 Réciter au micro' },
                    ] as const).map((o) => {
                      const active = answerMode === o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setAnswerMode(o.value)}
                          className={`flex-1 py-2 px-2 rounded-lg text-sm font-bold border-2 transition-all ${
                            active
                              ? 'bg-[#2d5016] text-[#fdfaf3] border-[#2d5016] shadow-md'
                              : 'bg-white text-[#4a7c23] border-[#c9a959]/30 hover:border-[#c9a959]'
                          }`}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Au micro : vous récitez, la fin de l&apos;enregistrement révèle le verset et vous pouvez vous réécouter.
                  </p>
                </OptionGroup>
                {answerMode === 'tap' && (
                  <OptionGroup label="Temps autorisé (puis révélation)">
                    <NumberSelect options={TIMEOUT_OPTIONS} value={revealTimeout} onChange={setRevealTimeout} />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Un compte à rebours démarre à chaque question ; à la fin, le verset se révèle
                      automatiquement (vous pouvez révéler avant en tapant).
                    </p>
                  </OptionGroup>
                )}
              </>
            )}

            {/* Choix spécifiques : Numéro de page */}
            {isPageNumber && (
              <OptionGroup label="Versets à dévoiler">
                <MultiSelect options={POSITION_OPTIONS} selected={showPositions} onToggle={toggleShow} />
                <p className="text-[11px] text-gray-400 mt-1">
                  Après avoir retrouvé la page, on dévoile au tap les versets choisis
                  (premier, milieu et/ou dernier).
                </p>
              </OptionGroup>
            )}

            {/* Choix spécifiques : Séquentiel */}
            {isSequential && (
              <>
                <OptionGroup label="Versets à afficher">
                  <MultiSelect options={POSITION_OPTIONS} selected={showPositions} onToggle={toggleShow} />
                </OptionGroup>
                <OptionGroup label="Sens">
                  <div className="flex gap-1.5">
                    {([
                      { value: 'forward', label: 'Avancer →' },
                      { value: 'backward', label: '← Reculer' },
                    ] as const).map((o) => {
                      const active = direction === o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setDirection(o.value)}
                          className={`flex-1 py-2 px-2 rounded-lg text-sm font-bold border-2 transition-all ${
                            active
                              ? 'bg-[#2d5016] text-[#fdfaf3] border-[#2d5016] shadow-md'
                              : 'bg-white text-[#4a7c23] border-[#c9a959]/30 hover:border-[#c9a959]'
                          }`}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </OptionGroup>
              </>
            )}

            {/* Nombre de questions (tous les exercices sauf Hifz) */}
            {!isHifz && (
              <OptionGroup label="Nombre de questions">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuestionCount((c) => Math.max(1, c - 5))}
                    className="w-10 h-10 rounded-lg border-2 border-[#c9a959]/30 text-[#2d5016] font-bold hover:border-[#c9a959]"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                    className="flex-1 text-center px-3 py-2 rounded-lg border-2 border-[#c9a959]/30 focus:border-[#c9a959] outline-none font-bold text-[#2d5016]"
                  />
                  <button
                    type="button"
                    onClick={() => setQuestionCount((c) => Math.min(200, c + 5))}
                    className="w-10 h-10 rounded-lg border-2 border-[#c9a959]/30 text-[#2d5016] font-bold hover:border-[#c9a959]"
                  >
                    +
                  </button>
                </div>
              </OptionGroup>
            )}

            {error && <p className="text-red-600 text-sm text-center">{error}</p>}

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-[#2d5016] to-[#4a7c23] hover:from-[#4a7c23] hover:to-[#2d5016] text-white font-bold rounded-xl transition-all text-base shadow-lg active:scale-[0.98]"
            >
              Commencer
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
