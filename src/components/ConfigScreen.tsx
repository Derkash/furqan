'use client';

import { useState } from 'react';
import type { QuizConfig } from '@/types';
import { toArabicNumbers } from '@/utils/arabicNumbers';

interface ConfigScreenProps {
  onStart: (config: QuizConfig) => void;
}

export default function ConfigScreen({ onStart }: ConfigScreenProps) {
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(10);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (startPage < 1 || startPage > 604) {
      setError('La page de début doit être entre 1 et 604');
      return;
    }
    if (endPage < 1 || endPage > 604) {
      setError('La page de fin doit être entre 1 et 604');
      return;
    }
    if (startPage > endPage) {
      setError('La page de début doit être inférieure ou égale à la page de fin');
      return;
    }

    onStart({ startPage, endPage });
  };

  return (
    <div className="min-h-screen h-screen flex items-center justify-center bg-[#fdfaf3] overflow-auto p-2 landscape:p-1">
      <div className="bg-white rounded-2xl shadow-xl p-6 landscape:p-3 max-w-md w-full mx-2 border-2 border-[#2d5016]">
        <h1 className="text-2xl landscape:text-xl font-bold text-center text-[#2d5016] mb-1">
          فرقان
        </h1>
        <h2 className="text-base landscape:text-sm text-center text-[#4a7c23] mb-4 landscape:mb-2">
          Configuration Révision
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4 landscape:space-y-2">
          <div className="landscape:flex landscape:gap-4">
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
                  min={1}
                  max={604}
                  value={startPage}
                  onChange={(e) => setStartPage(Number(e.target.value))}
                  className="w-full px-4 py-2 landscape:py-1.5 border-2 border-[#c9a959] rounded-lg focus:ring-2 focus:ring-[#4a7c23] focus:border-[#2d5016] text-base"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#4a7c23] font-arabic text-lg">
                  {toArabicNumbers(startPage)}
                </span>
              </div>
            </div>

            <div className="flex-1 mt-4 landscape:mt-0">
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
                  min={1}
                  max={604}
                  value={endPage}
                  onChange={(e) => setEndPage(Number(e.target.value))}
                  className="w-full px-4 py-2 landscape:py-1.5 border-2 border-[#c9a959] rounded-lg focus:ring-2 focus:ring-[#4a7c23] focus:border-[#2d5016] text-base"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#4a7c23] font-arabic text-lg">
                  {toArabicNumbers(endPage)}
                </span>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-red-600 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            className="w-full py-3 landscape:py-2 bg-[#2d5016] hover:bg-[#4a7c23] text-white font-semibold rounded-lg transition-colors text-base shadow-md"
          >
            Commencer
          </button>
        </form>

        <p className="mt-3 landscape:mt-2 text-center text-sm text-gray-500">
          Plage : {toArabicNumbers(endPage - startPage + 1)} pages
        </p>
      </div>
    </div>
  );
}
