'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirection côté client (et non redirect() serveur) : nécessaire pour que la
// page racine soit exportable en statique dans le build Capacitor (iPad).
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/exercises');
  }, [router]);

  return null;
}
