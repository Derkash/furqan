'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getExerciseDefinition, isValidExerciseId } from '@/utils/exercises/exerciseRegistry';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import RangePicker, { type RangePickerValue } from '@/components/exercises/RangePicker';
import { unitToPageRange } from '@/utils/exercises/rangeToPages';
import { useQuranUnits } from '@/hooks/exercises/useQuranUnits';
import { loadSetup, saveSetup } from '@/utils/exercises/exerciseMemory';
import Link from 'next/link';

export default function SetupPage() {
  const router = useRouter();
  const params = useParams();
  const exerciseId = params.exerciseId as string;

  const { data: units } = useQuranUnits();

  // Aucune valeur pré-saisie au premier rendu (évite aussi un décalage d'hydratation SSR).
  const [range, setRange] = useState<RangePickerValue>({ mode: 'page', start: null, end: null });
  const [singlePageValue, setSinglePageValue] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSinglePageExercise = exerciseId === 'hifz';

  // Restauration des dernières valeurs saisies pour cet exercice (proposées par défaut).
  // On lit le localStorage après le montage : le 1er rendu (serveur + client) reste vide,
  // ce qui évite tout décalage d'hydratation, puis on applique les valeurs mémorisées.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = loadSetup(exerciseId);
    if (!saved) return;
    if (saved.singlePage != null) {
      setSinglePageValue(saved.singlePage);
    }
    if (saved.mode != null || saved.start != null || saved.end != null) {
      setRange({
        mode: saved.mode ?? 'page',
        start: saved.start ?? null,
        end: saved.end ?? null,
      });
    }
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSinglePageExercise) {
      if (singlePageValue == null || singlePageValue < 1 || singlePageValue > 604) {
        setError('La page doit être entre 1 et 604');
        return;
      }
      saveSetup(exerciseId, { singlePage: singlePageValue });
      router.push(
        `/exercises/${exerciseId}/practice?start=${singlePageValue}&end=${singlePageValue}`
      );
      return;
    }

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
    saveSetup(exerciseId, { mode: range.mode, start: range.start, end: range.end });
    router.push(`/exercises/${exerciseId}/practice?start=${lo}&end=${hi}`);
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
            {isSinglePageExercise ? (
              <div>
                <label htmlFor="singlePage" className="block text-sm font-medium text-gray-700 mb-1">
                  Page à mémoriser
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="singlePage"
                    inputMode="numeric"
                    min={1}
                    max={604}
                    placeholder="1–604"
                    value={singlePageValue === null ? '' : singlePageValue}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setSinglePageValue(raw === '' ? null : Number(raw));
                    }}
                    className="w-full px-4 py-2.5 border-2 border-[#c9a959] rounded-lg focus:ring-2 focus:ring-[#4a7c23] focus:border-[#2d5016] text-base"
                  />
                  {singlePageValue !== null && (
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#4a7c23] font-arabic text-lg pointer-events-none">
                      {toArabicNumbers(singlePageValue)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <>
                <RangePicker value={range} onChange={setRange} />

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
              </>
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
