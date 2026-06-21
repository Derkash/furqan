'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getExerciseDefinition, isValidExerciseId } from '@/utils/exercises/exerciseRegistry';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import RangePicker, { type RangeMode } from '@/components/exercises/RangePicker';
import Link from 'next/link';

interface RangeValue {
  mode: RangeMode;
  start: number;
  end: number;
  startPage: number;
  endPage: number;
}

export default function SetupPage() {
  const router = useRouter();
  const params = useParams();
  const exerciseId = params.exerciseId as string;

  const [range, setRange] = useState<RangeValue>({
    mode: 'page',
    start: 3,
    end: 10,
    startPage: 3,
    endPage: 10,
  });
  const [singlePageValue, setSinglePageValue] = useState(3);
  const [error, setError] = useState<string | null>(null);

  const isSinglePageExercise = exerciseId === 'hifz';

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
      if (singlePageValue < 1 || singlePageValue > 604) {
        setError('La page doit être entre 1 et 604');
        return;
      }
      router.push(
        `/exercises/${exerciseId}/practice?start=${singlePageValue}&end=${singlePageValue}`
      );
      return;
    }

    const lo = Math.min(range.startPage, range.endPage);
    const hi = Math.max(range.startPage, range.endPage);
    if (lo < 1 || hi > 604) {
      setError('La plage doit être entre 1 et 604');
      return;
    }
    router.push(`/exercises/${exerciseId}/practice?start=${lo}&end=${hi}`);
  };

  const pageCount = Math.abs(range.endPage - range.startPage) + 1;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fdfaf3] via-[#fdfaf3] to-[#f4e9d0] p-4 pb-12">
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
                    min={1}
                    max={604}
                    value={singlePageValue}
                    onChange={(e) => setSinglePageValue(Number(e.target.value))}
                    className="w-full px-4 py-2.5 border-2 border-[#c9a959] rounded-lg focus:ring-2 focus:ring-[#4a7c23] focus:border-[#2d5016] text-base"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#4a7c23] font-arabic text-lg pointer-events-none">
                    {toArabicNumbers(singlePageValue)}
                  </span>
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
                    {Math.min(range.startPage, range.endPage)} → {Math.max(range.startPage, range.endPage)}
                  </div>
                  <div className="text-xs text-[#7a8b3e] mt-0.5">
                    {toArabicNumbers(pageCount)} page{pageCount > 1 ? 's' : ''}
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
