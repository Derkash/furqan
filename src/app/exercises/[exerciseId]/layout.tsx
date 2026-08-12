import { EXERCISES } from '@/utils/exercises/exerciseRegistry';

// Les ids d'exercices sont connus statiquement : indispensable pour
// l'export statique (build Capacitor iPad), sans effet sur le build web.
export function generateStaticParams() {
  return EXERCISES.map((exercise) => ({ exerciseId: exercise.id }));
}

export default function ExerciseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
