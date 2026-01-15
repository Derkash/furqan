'use client';

import { getAllExercises } from '@/utils/exercises/exerciseRegistry';
import ExerciseCard from '@/components/exercises/ExerciseCard';

export default function ExercisesPage() {
  const exercises = getAllExercises();

  return (
    <div
      className="min-h-screen bg-[#fdfaf3] p-4 pb-8"
      style={{
        overflow: 'auto',
        height: '100vh',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div className="max-w-2xl mx-auto">
        <header className="text-center mb-6">
          <h1 className="text-3xl font-bold text-[#2d5016] font-arabic">فرقان</h1>
          <p className="text-[#4a7c23] mt-1">Choisissez un exercice</p>
        </header>

        <div className="grid gap-3 pb-4">
          {exercises.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} />
          ))}
        </div>
      </div>
    </div>
  );
}
