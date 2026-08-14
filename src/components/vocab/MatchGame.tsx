'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getVocab, recordReview, type VocabEntry } from '@/utils/vocab/vocabStore';

/**
 * Jeu d'association du vocabulaire (maquette AlMuraja3a — Exercice Vocabulaire).
 * 4 cartes arabes en bas + une grille de mots français en haut. On clique une
 * carte arabe puis sa traduction française ; à chaque bonne association, le mot
 * quitte le plateau et un nouveau mot du vocabulaire vient prendre la place
 * libérée (arabe ET français). On enchaîne jusqu'à épuisement du lexique.
 */

const ARABIC_SLOTS = 4;
// Nombre de traductions françaises visibles (banque) — les 4 réponses + des
// leurres tirés du vocabulaire, pour créer une vraie recherche.
const FRENCH_BANK = 12;

interface Slot {
  entry: VocabEntry;
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export default function MatchGame() {
  const all = useMemo(() => getVocab().filter((e) => e.arabic && e.gloss), []);
  const total = all.length;

  // File des mots pas encore posés sur le plateau.
  const poolRef = useRef<VocabEntry[]>([]);
  // Cartes arabes en jeu (les questions).
  const [arabics, setArabics] = useState<Slot[]>([]);
  // Banque française visible (mélange réponses + leurres), par id.
  const [french, setFrench] = useState<VocabEntry[]>([]);

  const [selectedAr, setSelectedAr] = useState<string | null>(null);
  const [wrongPair, setWrongPair] = useState<string | null>(null);
  const [justMatched, setJustMatched] = useState<string | null>(null);

  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [matched, setMatched] = useState(0);
  const [done, setDone] = useState(false);

  // Recompose la banque française : les traductions des 4 arabes + des leurres.
  const rebuildFrench = useCallback((ars: Slot[], pool: VocabEntry[]) => {
    const answers = ars.map((s) => s.entry);
    const answerIds = new Set(answers.map((e) => e.id));
    const distractPool = shuffle([...pool].filter((e) => !answerIds.has(e.id)));
    const distractors = distractPool.slice(0, Math.max(0, FRENCH_BANK - answers.length));
    setFrench(shuffle([...answers, ...distractors]));
  }, []);

  const start = useCallback(() => {
    const shuffled = shuffle(all);
    const first = shuffled.slice(0, ARABIC_SLOTS).map((entry) => ({ entry }));
    poolRef.current = shuffled.slice(ARABIC_SLOTS);
    setArabics(first);
    rebuildFrench(first, poolRef.current);
    setScore(0);
    setAttempts(0);
    setMatched(0);
    setDone(false);
    setSelectedAr(null);
  }, [all, rebuildFrench]);

  useEffect(() => {
    start();
  }, [start]);

  const onFrenchClick = (fr: VocabEntry) => {
    if (!selectedAr || done) return;
    const slotIdx = arabics.findIndex((s) => s.entry.id === selectedAr);
    if (slotIdx < 0) return;
    const target = arabics[slotIdx].entry;

    if (fr.id === target.id) {
      // Bonne association.
      setScore((s) => s + 10);
      setMatched((m) => m + 1);
      recordReview(target.id, true);
      setJustMatched(target.id);
      const next = poolRef.current.shift();
      setTimeout(() => {
        setJustMatched(null);
        setArabics((prev) => {
          const copy = [...prev];
          if (next) copy[slotIdx] = { entry: next };
          else copy.splice(slotIdx, 1);
          rebuildFrench(copy, poolRef.current);
          if (copy.length === 0) setDone(true);
          return copy;
        });
      }, 380);
      setSelectedAr(null);
    } else {
      // Mauvaise association.
      setAttempts((a) => a + 1);
      recordReview(target.id, false);
      setWrongPair(fr.id);
      setTimeout(() => setWrongPair(null), 450);
    }
  };

  if (total < ARABIC_SLOTS) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center" dir="ltr">
        <p className="font-extrabold text-lg text-[var(--ds-green)]">Pas encore assez de mots.</p>
        <p className="text-[var(--ds-n600)] text-sm max-w-sm">
          Ajoute au moins {ARABIC_SLOTS} mots à ton vocabulaire (onglet « Enregistrer ») pour
          lancer le jeu d&apos;association.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center" dir="ltr">
        <div className="w-16 h-16 rounded-full bg-[var(--ds-sage-100)] text-[var(--ds-green)] flex items-center justify-center text-3xl">
          ✓
        </div>
        <p className="font-extrabold text-2xl text-[var(--ds-green)]">Bravo !</p>
        <p className="text-[var(--ds-n700)]">
          {matched} mots associés · score {score} · {attempts} erreur{attempts > 1 ? 's' : ''}
        </p>
        <button onClick={start} className="ds-btn-gold px-6 py-3 text-sm mt-2">
          Rejouer
        </button>
      </div>
    );
  }

  return (
    <div dir="ltr" className="flex flex-col h-full" style={{ fontFamily: 'var(--ds-font)' }}>
      {/* Barre de stats */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div className="ds-card flex items-center gap-3 px-4 py-2.5">
          <span className="w-9 h-9 rounded-full bg-[var(--ds-gold-100)] text-[var(--ds-gold)] flex items-center justify-center">
            ★
          </span>
          <div>
            <p className="ds-kicker">Score</p>
            <p className="text-lg font-extrabold text-[var(--ds-text)] leading-none">{score}</p>
          </div>
        </div>

        <div className="flex-1 min-w-[200px] flex flex-col items-center gap-2">
          <h2 className="text-sm md:text-base font-bold text-center text-[var(--ds-text)]">
            Associe chaque mot arabe à sa traduction française
          </h2>
          <div className="flex gap-1 flex-wrap justify-center max-w-[380px]">
            {Array.from({ length: Math.min(total, 20) }).map((_, i) => (
              <span
                key={i}
                className="h-1.5 w-6 rounded-full transition-colors"
                style={{ background: i < matched ? 'var(--ds-green)' : 'var(--ds-divider)' }}
              />
            ))}
          </div>
        </div>

        <div className="ds-card flex items-center gap-3 px-4 py-2.5">
          <div className="text-right">
            <p className="ds-kicker">Restants</p>
            <p className="text-lg font-extrabold text-[var(--ds-text)] leading-none">
              {total - matched}
            </p>
          </div>
          <span className="w-9 h-9 rounded-full bg-[var(--ds-sage-100)] text-[var(--ds-green)] flex items-center justify-center">
            ◎
          </span>
        </div>
      </div>

      {/* Banque française (grille) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 mb-6">
        {french.map((fr) => {
          const isWrong = wrongPair === fr.id;
          const isGone = justMatched === fr.id;
          return (
            <button
              key={fr.id}
              onClick={() => onFrenchClick(fr)}
              disabled={!selectedAr || isGone}
              className={`rounded-xl border px-3 py-3.5 text-center text-[13px] font-semibold transition-all ${
                isGone
                  ? 'opacity-0 scale-90'
                  : isWrong
                    ? 'border-red-400 bg-red-50 text-red-700 animate-pulse'
                    : selectedAr
                      ? 'border-[var(--ds-gold)]/40 bg-white text-[var(--ds-text)] hover:bg-[var(--ds-sage-100)] active:scale-[0.98] shadow-sm'
                      : 'border-[var(--ds-divider)] bg-white text-[var(--ds-n600)] shadow-sm'
              }`}
            >
              {fr.gloss}
            </button>
          );
        })}
      </div>

      {/* Cartes arabes (questions) */}
      <p className="text-center text-[13px] text-[var(--ds-n500)] italic mb-3">
        Clique d&apos;abord un mot arabe, puis sa traduction française
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {arabics.map((slot, i) => {
          const active = selectedAr === slot.entry.id;
          const gone = justMatched === slot.entry.id;
          return (
            <div key={slot.entry.id} className="relative">
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-6 h-6 bg-[var(--ds-green)] text-white rounded-full flex items-center justify-center text-[11px] font-bold z-10">
                {i + 1}
              </span>
              <button
                onClick={() => setSelectedAr(active ? null : slot.entry.id)}
                className={`w-full rounded-3xl min-h-[92px] flex items-center justify-center px-3 border-[1.5px] transition-all ${
                  gone
                    ? 'opacity-0 scale-90'
                    : active
                      ? 'border-[var(--ds-green)] bg-[var(--ds-sage-100)] shadow-md'
                      : 'border-[var(--ds-green)] bg-white hover:bg-[var(--ds-sage-100)] shadow-sm'
                }`}
              >
                <span
                  dir="rtl"
                  className="text-3xl md:text-4xl leading-relaxed text-[var(--ds-text)]"
                  style={{ fontFamily: "'Amiri','Scheherazade New',serif" }}
                >
                  {slot.entry.arabic}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
