'use client';

import type { ExerciseDefinition } from '@/types/exercises';
import Link from 'next/link';

interface ExerciseCardProps {
  exercise: ExerciseDefinition;
  index?: number;
}

// SVG icons (lucide-style, mais inline pour pas ajouter de dépendance)
function Icon({ name, className }: { name: string; className?: string }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
  };
  switch (name) {
    case 'ear':
      return (
        <svg {...common}>
          <path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0" />
          <path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4" />
        </svg>
      );
    case 'shuffle':
      return (
        <svg {...common}>
          <path d="m18 14 4 4-4 4" />
          <path d="m18 2 4 4-4 4" />
          <path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" />
          <path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" />
          <path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" />
        </svg>
      );
    case 'list':
      return (
        <svg {...common}>
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
          <path d="M3 6h.01" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M8 6h13" />
        </svg>
      );
    case 'help-circle':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      );
    case 'arrow-right':
      return (
        <svg {...common}>
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      );
    case 'arrow-left':
      return (
        <svg {...common}>
          <path d="m12 19-7-7 7-7" />
          <path d="M19 12H5" />
        </svg>
      );
    case 'mic':
      return (
        <svg {...common}>
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      );
    case 'pencil':
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case 'book':
      return (
        <svg {...common}>
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      );
    case 'brain':
      return (
        <svg {...common}>
          <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
          <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
          <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M2 3h20" />
          <path d="M5 7h14" />
          <path d="M3 11h18" />
          <path d="M6 15h12" />
          <path d="M9 19h6" />
        </svg>
      );
  }
}

const CATEGORY_STYLE: Record<string, { ring: string; iconBg: string; iconText: string; chip: string }> = {
  random: {
    ring: 'before:bg-[#2d5016]',
    iconBg: 'bg-[#2d5016]',
    iconText: 'text-[#fdfaf3]',
    chip: 'bg-[#2d5016]/10 text-[#2d5016] border-[#2d5016]/20',
  },
  sequential: {
    ring: 'before:bg-[#c9a959]',
    iconBg: 'bg-[#c9a959]',
    iconText: 'text-[#1a1a1a]',
    chip: 'bg-[#c9a959]/15 text-[#7a5d2c] border-[#c9a959]/30',
  },
  positional: {
    ring: 'before:bg-[#4a7c23]',
    iconBg: 'bg-[#4a7c23]',
    iconText: 'text-[#fdfaf3]',
    chip: 'bg-[#4a7c23]/10 text-[#4a7c23] border-[#4a7c23]/20',
  },
  recitation: {
    ring: 'before:bg-[#7a3030]',
    iconBg: 'bg-[#7a3030]',
    iconText: 'text-[#fdfaf3]',
    chip: 'bg-[#7a3030]/10 text-[#7a3030] border-[#7a3030]/20',
  },
};

function directionLabel(progression: string): string | null {
  if (progression === 'forward') return 'البقرة → الناس';
  if (progression === 'backward') return 'الناس → البقرة';
  return null;
}

export default function ExerciseCard({ exercise, index = 0 }: ExerciseCardProps) {
  const style = CATEGORY_STYLE[exercise.category] || CATEGORY_STYLE.random;
  const dirLabel = directionLabel(exercise.progression);

  return (
    <Link
      href={`/exercises/${exercise.id}/setup`}
      className={`
        group relative block bg-white rounded-2xl overflow-hidden
        shadow-[0_2px_8px_rgba(45,80,22,0.06)] hover:shadow-[0_8px_24px_rgba(45,80,22,0.12)]
        active:scale-[0.985] transition-all duration-200
        ring-1 ring-[#c9a959]/15 hover:ring-[#c9a959]/40
        before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 ${style.ring}
      `}
      style={{
        animationDelay: `${index * 40}ms`,
      }}
    >
      <div className="flex items-center gap-4 p-4 pl-5">
        {/* Icône colorée */}
        <div
          className={`flex-shrink-0 w-12 h-12 rounded-xl ${style.iconBg} ${style.iconText} flex items-center justify-center shadow-md`}
        >
          <Icon name={exercise.icon} />
        </div>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-[#1a1a1a] text-[15px] leading-snug">
                {exercise.name}
              </h3>
              <p
                className="text-[#7a8b3e] text-xs mt-0.5 font-semibold"
                dir="rtl"
                style={{ fontFamily: "'Amiri', 'Scheherazade New', serif" }}
              >
                {exercise.nameArabic}
              </p>
            </div>

            {/* Chevron */}
            <svg
              className="flex-shrink-0 text-[#c9a959] group-hover:translate-x-0.5 transition-transform mt-0.5"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>

          <p className="text-gray-500 text-xs mt-1.5 line-clamp-2 leading-relaxed">
            {exercise.description}
          </p>

          {/* Meta : difficulté + direction sourate */}
          <div className="flex items-center flex-wrap gap-2 mt-2.5">
            {/* Pastilles de difficulté */}
            <div className="flex items-center gap-1.5">
              <div className="flex gap-[3px]">
                {[1, 2, 3, 4, 5].map((level) => (
                  <span
                    key={level}
                    className={`block w-1.5 h-1.5 rounded-full ${
                      level <= exercise.difficulty ? 'bg-[#4a7c23]' : 'bg-[#4a7c23]/15'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Badge direction sourate */}
            {dirLabel && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${style.chip}`}
                dir="rtl"
                style={{ fontFamily: "'Amiri', 'Scheherazade New', serif" }}
              >
                {dirLabel}
              </span>
            )}

            {/* Badge audio si applicable */}
            {exercise.hasAudio && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#fdfaf3] text-[#2d5016] border border-[#2d5016]/15">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M3 9v6h4l5 5V4L7 9H3z" />
                </svg>
                Audio
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
