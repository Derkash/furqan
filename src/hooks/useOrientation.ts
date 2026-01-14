'use client';

import { useState, useEffect } from 'react';
import type { Orientation } from '@/types';

/**
 * Hook pour détecter l'orientation de l'écran
 */
export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>('portrait');

  useEffect(() => {
    const updateOrientation = () => {
      if (typeof window !== 'undefined') {
        setOrientation(
          window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
        );
      }
    };

    // Initial check
    updateOrientation();

    // Listen to resize and orientation change
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);

    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
    };
  }, []);

  return orientation;
}
