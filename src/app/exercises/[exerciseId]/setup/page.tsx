'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getExerciseDefinition, isValidExerciseId } from '@/utils/exercises/exerciseRegistry';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import Link from 'next/link';

export default function SetupPage() {
  const router = useRouter();
  const params = useParams();
  const exerciseId = params.exerciseId as string;

  const [startPage, setStartPage] = useState(3);
  const [endPage, setEndPage] = useState(10);
  const [error, setError] = useState<string | null>(null);

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

    if (startPage < 3 || startPage > 604) {
      setError('La page de début doit être entre 3 et 604');
      return;
    }
    if (endPage < 3 || endPage > 604) {
      setError('La page de fin doit être entre 3 et 604');
      return;
    }
    if (startPage > endPage) {
      setError('La page de début doit être inférieure ou égale à la page de fin');
      return;
    }

    // Navigate to practice with query params
    router.push(
      `/exercises/${exerciseId}/practice?start=${startPage}&end=${endPage}`
    );
  };

  return (
    <div className="min-h-screen bg-[#fdfaf3] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full border-2 border-[#2d5016]">
        <Link
          href="/exercises"
          className="text-[#4a7c23] text-sm hover:underline mb-4 inline-block"
        >
          ← Retour aux exercices
        </Link>

        <h1 className="text-xl font-bold text-[#2d5016] mb-1">{exercise.name}</h1>
        <p className="text-[#4a7c23] font-arabic text-sm mb-2" dir="rtl">
          {exercise.nameArabic}
        </p>
        <p className="text-gray-500 text-sm mb-6">{exercise.description}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label
                htmlFor="startPage"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Page de début
              </label>
              <div className="relative">
                <input
                  type="number"
                  id="startPage"
                  min={3}
                  max={604}
                  value={startPage}
                  onChange={(e) => setStartPage(Number(e.target.value))}
                  className="w-full px-4 py-2 border-2 border-[#c9a959] rounded-lg focus:ring-2 focus:ring-[#4a7c23] focus:border-[#2d5016] text-base"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#4a7c23] font-arabic text-lg">
                  {toArabicNumbers(startPage)}
                </span>
              </div>
            </div>

            <div className="flex-1">
              <label
                htmlFor="endPage"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Page de fin
              </label>
              <div className="relative">
                <input
                  type="number"
                  id="endPage"
                  min={3}
                  max={604}
                  value={endPage}
                  onChange={(e) => setEndPage(Number(e.target.value))}
                  className="w-full px-4 py-2 border-2 border-[#c9a959] rounded-lg focus:ring-2 focus:ring-[#4a7c23] focus:border-[#2d5016] text-base"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#4a7c23] font-arabic text-lg">
                  {toArabicNumbers(endPage)}
                </span>
              </div>
            </div>
          </div>

          {error && <p className="text-red-600 text-sm text-center">{error}</p>}

          <button
            type="submit"
            className="w-full py-3 bg-[#2d5016] hover:bg-[#4a7c23] text-white font-semibold rounded-lg transition-colors text-base shadow-md"
          >
            Commencer
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          Plage : {toArabicNumbers(endPage - startPage + 1)} pages
        </p>
      </div>
    </div>
  );
}
