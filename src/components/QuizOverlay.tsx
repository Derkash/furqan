'use client';

import type { QuizStep } from '@/types';

interface QuizOverlayProps {
  step: QuizStep;
  isPlaying: boolean;
}

const MESSAGES: Record<QuizStep, { title: string; subtitle: string }> = {
  config: { title: '', subtitle: '' },
  listening: {
    title: 'Écoutez le verset...',
    subtitle: 'Où se trouve-t-il ?',
  },
  reveal_recited: {
    title: 'Récitez le premier verset',
    subtitle: 'de cette page',
  },
  ask_first: {
    title: 'Récitez le premier verset',
    subtitle: 'de cette page',
  },
  reveal_first: {
    title: 'Récitez le dernier verset',
    subtitle: 'de cette page',
  },
  ask_last: {
    title: 'Récitez le dernier verset',
    subtitle: 'de cette page',
  },
  reveal_last: {
    title: 'Nouveau tour',
    subtitle: 'Tapez pour continuer',
  },
};

export default function QuizOverlay({ step, isPlaying }: QuizOverlayProps) {
  if (step === 'config') return null;

  const message = MESSAGES[step];

  return (
    <div className="absolute inset-x-0 bottom-1 sm:bottom-2 flex justify-center pointer-events-none z-50">
      <div className="bg-[#2d5016]/95 text-white px-4 py-1.5 sm:px-6 sm:py-2 rounded-lg shadow-2xl text-center max-w-xs sm:max-w-sm mx-2 sm:mx-4">
        {isPlaying && (
          <div className="flex justify-center gap-1 mb-2 sm:mb-3">
            <span className="w-1 h-3 sm:h-4 bg-[#c9a959] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-3 sm:h-4 bg-[#c9a959] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-3 sm:h-4 bg-[#c9a959] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
        <h3 className="text-base sm:text-xl font-semibold mb-0.5 sm:mb-1">{message.title}</h3>
        <p className="text-[#c9a959] text-xs sm:text-sm">{message.subtitle}</p>
      </div>
    </div>
  );
}
