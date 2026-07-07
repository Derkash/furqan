'use client';

import { useEffect, useState } from 'react';

// Groupes de tafsir Ibn Kathir : verseKey → numéro de groupe séquentiel.
// Les versets partageant un même tafsir (même thème) portent le même numéro ;
// l'alternance pair/impair sert à alterner les teintes de surlignage.
type GroupsMap = Record<string, number>;

let cached: Promise<GroupsMap | null> | null = null;

function loadGroups(): Promise<GroupsMap | null> {
  if (!cached) {
    cached = fetch('/ibn-kathir-groups.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => {
        cached = null; // nouvelle tentative au prochain besoin
        return null;
      });
  }
  return cached;
}

/** Charge la carte des groupes de tafsir (activer via `enabled`). */
export function useTafsirGroups(enabled: boolean) {
  const [groups, setGroups] = useState<GroupsMap | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadGroups().then((g) => {
      if (!cancelled) setGroups(g);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return groups;
}
