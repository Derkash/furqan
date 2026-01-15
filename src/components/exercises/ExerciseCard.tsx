'use client';

import type { ExerciseDefinition } from '@/types/exercises';
import Link from 'next/link';

interface ExerciseCardProps {
  exercise: ExerciseDefinition;
}

const ICONS: Record<string, string> = {
  shuffle: '🔀',
  list: '📋',
  'help-circle': '❓',
  'arrow-right': '➡️',
  'arrow-left': '⬅️',
};

export default function ExerciseCard({ exercise }: ExerciseCardProps) {
  const icon = ICONS[exercise.icon] || '📖';

  return (
    <Link
      href={`/exercises/${exercise.id}/setup`}
      className="block bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow border-2 border-[#c9a959] hover:border-[#2d5016] p-4"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[#2d5016] text-sm truncate">
            {exercise.name}
          </h3>
          <p className="text-[#4a7c23] text-xs font-arabic mt-0.5" dir="rtl">
            {exercise.nameArabic}
          </p>
          <p className="text-gray-500 text-xs mt-1 line-clamp-2">
            {exercise.description}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-400">Difficulté:</span>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((level) => (
                <span
                  key={level}
                  className={`w-2 h-2 rounded-full ${
                    level <= exercise.difficulty
                      ? 'bg-[#4a7c23]'
                      : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
