'use client';

import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/apiUrl';
import {
  getWordMorphology,
  getVerseText,
  describeMorphology,
  type WordMorphology,
} from '@/utils/vocab/morphology';
import { addVocab, getVocabEntry, removeVocab, type VocabEntry } from '@/utils/vocab/vocabStore';
import { getCurrentUser } from '@/utils/exercises/userStats';
import OccurrencesExplorer from '@/components/vocab/OccurrencesExplorer';

interface WordCardProps {
  verseKey: string;
  position: number;
  side: 'left' | 'right';
  onClose: () => void;
  onAdded?: (entry: VocabEntry) => void;
  onRemoved?: () => void;
  /** Si fourni : affiche un bouton « occurrences avant cette page » (mode Lecture). */
  onOccurrences?: (root: string) => void;
  /**
   * 'panel' = demi-écran latéral (capture /vocab) ; 'sheet' = panneau centré
   * scrollable avec occurrences intégrées (toutes les apparitions dans le Coran).
   */
  variant?: 'panel' | 'sheet';
}

interface Analysis {
  baseForm: string;
  baseFormType: string;
  frenchGloss: string;
  nahw: string;
  llm: boolean;
  stored?: boolean; // rechargé depuis le lexique (aucun appel API)
}

export default function WordCard({ verseKey, position, side, onClose, onAdded, onRemoved, onOccurrences, variant = 'panel' }: WordCardProps) {
  const [morph, setMorph] = useState<WordMorphology | null>(null);
  const [loadingMorph, setLoadingMorph] = useState(true);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loadingLLM, setLoadingLLM] = useState(false);
  const [gloss, setGloss] = useState('');
  const [already, setAlready] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<'added' | 'duplicate' | null>(null);
  const reqId = useRef(0);

  // Charge la morphologie déterministe puis l'analyse LLM.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const id = ++reqId.current;
    setMorph(null);
    setAnalysis(null);
    setGloss('');
    setJustAdded(null);
    setLoadingMorph(true);
    setLoadingLLM(false);

    (async () => {
      const m = await getWordMorphology(verseKey, position);
      if (id !== reqId.current) return;
      setMorph(m);
      setLoadingMorph(false);
      if (!m) return;

      // Déjà dans le lexique → on réutilise l'analyse stockée, AUCUN appel API.
      const existing = getVocabEntry(m.lemma, m.root, m.form);
      setAlready(!!existing);
      setExistingId(existing?.id ?? null);
      if (existing && existing.baseForm) {
        setAnalysis({
          baseForm: existing.baseForm,
          baseFormType: existing.baseFormType || '',
          frenchGloss: existing.gloss,
          nahw: existing.nahw || '',
          llm: false,
          stored: true,
        });
        setGloss(existing.gloss);
        return;
      }

      // Analyse rédactionnelle (forme de base + gloss + nahw) via l'API.
      setLoadingLLM(true);
      const verseText = await getVerseText(verseKey).catch(() => '');
      if (id !== reqId.current) return;
      try {
        const res = await fetch(apiUrl('/api/vocab-analyze'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            form: m.form,
            root: m.root,
            lemma: m.lemma,
            pos: m.pos,
            verbForm: m.verbForm,
            position,
            morphology: describeMorphology(m),
            verseKey,
            verseText,
            user: getCurrentUser() ?? undefined,
          }),
        });
        const data = await res.json();
        if (id !== reqId.current) return;
        if (res.ok && data.baseForm) {
          setAnalysis(data);
          setGloss(data.frenchGloss || '');
        }
      } catch {
        /* réseau — on garde la morphologie seule */
      } finally {
        if (id === reqId.current) setLoadingLLM(false);
      }
    })();
  }, [verseKey, position]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleAdd = () => {
    if (!morph) return;
    const res = addVocab({
      arabic: analysis?.baseForm || morph.lemma || morph.form,
      gloss: gloss || analysis?.frenchGloss || '',
      root: morph.root,
      lemma: morph.lemma,
      baseForm: analysis?.baseForm,
      baseFormType: analysis?.baseFormType,
      nahw: analysis?.nahw,
      sampleVerseKey: verseKey,
      source: 'mushaf',
    });
    setJustAdded(res.status);
    setAlready(true);
    setExistingId(res.entry.id);
    if (res.status === 'added') onAdded?.(res.entry);
  };

  const handleRemove = () => {
    if (!existingId) return;
    removeVocab(existingId);
    setAlready(false);
    setExistingId(null);
    setJustAdded(null);
    onRemoved?.();
  };

  const isSheet = variant === 'sheet';

  return (
    <div
      className={
        isSheet
          ? 'fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-3'
          : `absolute inset-y-0 z-30 w-1/2 flex items-center justify-center p-3 ${side === 'left' ? 'left-0' : 'right-0'}`
      }
      onClick={isSheet ? onClose : (e) => e.stopPropagation()}
    >
      <div
        className={`bg-[var(--ds-bg)] border-2 border-[var(--ds-gold)] rounded-3xl shadow-2xl w-full overflow-y-auto p-5 ${
          isSheet ? 'max-w-lg max-h-[92vh]' : 'max-w-md max-h-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fermer */}
        <div className="flex justify-between items-start mb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--ds-gold)]">
            Vocabulaire — {verseKey}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-7 h-7 rounded-full bg-[var(--ds-green)]/10 text-[var(--ds-green)] flex items-center justify-center hover:bg-[var(--ds-green)]/20"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loadingMorph && <p className="text-sm text-gray-400 py-6 text-center">Analyse…</p>}

        {!loadingMorph && !morph && (
          <p className="text-sm text-gray-500 py-6 text-center">
            Aucune donnée morphologique pour ce mot.
          </p>
        )}

        {morph && (
          <>
            {/* Mot fléchi */}
            <p
              dir="rtl"
              className="text-center text-[var(--ds-green)] my-1"
              style={{ fontFamily: "'UthmanicHafs','Amiri','Scheherazade New',serif", fontSize: '2.6em', lineHeight: 1.6 }}
            >
              {morph.form}
            </p>

            {/* Racine + forme de base */}
            <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
              {morph.root && (
                <span className="inline-flex items-center gap-1 text-sm bg-[var(--ds-green)]/10 text-[var(--ds-green)] rounded-full px-3 py-1 font-bold">
                  racine
                  <span dir="rtl" style={{ fontFamily: "'Amiri',serif", fontSize: '1.3em' }}>
                    {morph.root.split('').join(' ')}
                  </span>
                </span>
              )}
              {analysis?.baseForm && (
                <span className="inline-flex items-center gap-1 text-sm bg-[var(--ds-gold)]/20 text-[#7a5d2c] rounded-full px-3 py-1 font-bold">
                  base
                  <span dir="rtl" style={{ fontFamily: "'Amiri',serif", fontSize: '1.3em' }}>
                    {analysis.baseForm}
                  </span>
                </span>
              )}
            </div>

            {/* Occurrences déjà rencontrées avant la page courante (mode Lecture) */}
            {onOccurrences && morph.root && (
              <button
                type="button"
                onClick={() => onOccurrences(morph.root!)}
                className="w-full mb-3 text-xs font-bold text-[var(--ds-green)] bg-[var(--ds-green)]/10 rounded-lg px-3 py-2 hover:bg-[var(--ds-green)]/20 flex items-center justify-center gap-1.5"
              >
                📜 Déjà vu avant cette page ?
              </button>
            )}

            {/* Analyse nahw déterministe */}
            <ul className="text-[13px] text-[#4a5a2e] space-y-0.5 mb-3 bg-white/60 rounded-xl p-3 border border-[var(--ds-gold)]/20">
              {describeMorphology(morph).map((line, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-[var(--ds-gold)]">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            {/* Explication rédigée (LLM) */}
            {loadingLLM && (
              <p className="text-xs text-gray-400 mb-2 flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-[var(--ds-gold)] border-t-transparent rounded-full animate-spin" />
                Traduction et explication…
              </p>
            )}
            {analysis?.nahw && (
              <p className="text-[13px] text-gray-600 italic mb-3 leading-relaxed">{analysis.nahw}</p>
            )}

            {/* Gloss éditable */}
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--ds-gold)] mb-1">
              Traduction (modifiable)
              {analysis && (
                <span className="ml-1 normal-case tracking-normal font-normal text-gray-400">
                  {analysis.stored
                    ? '— depuis ton lexique (sans nouvel appel)'
                    : analysis.llm
                      ? '— sens usuel (Hamidullah / Abdel-Nour)'
                      : '— d’après Quran.com'}
                </span>
              )}
            </label>
            <input
              value={gloss}
              onChange={(e) => setGloss(e.target.value)}
              placeholder="sens de la forme de base…"
              className="w-full mb-3 px-3 py-2 rounded-lg border-2 border-[var(--ds-gold)]/30 focus:border-[var(--ds-gold)] outline-none text-[var(--ds-green)] font-semibold"
            />

            {/* Ajouter / doublon */}
            {justAdded === 'duplicate' || (already && justAdded !== 'added') ? (
              <div className="text-center text-sm text-[#7a5d2c] bg-[var(--ds-gold)]/15 rounded-xl py-2.5 font-semibold">
                Ce mot est déjà dans ton lexique ✓
              </div>
            ) : justAdded === 'added' ? (
              <div className="text-center text-sm text-white bg-[var(--ds-green)] rounded-xl py-2.5 font-semibold">
                Ajouté à ton vocabulaire ✓
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAdd}
                disabled={!gloss.trim()}
                className="w-full py-2.5 bg-gradient-to-r from-[var(--ds-green)] to-[var(--ds-sage)] text-white font-bold rounded-xl disabled:opacity-40 active:scale-[0.98] transition-all"
              >
                ➕ Ajouter à mon vocabulaire
              </button>
            )}

            {/* Retirer du lexique (quand le mot y est déjà) */}
            {existingId && (
              <button
                type="button"
                onClick={handleRemove}
                className="w-full mt-2 py-2.5 text-sm font-bold text-[#7a3030] border-2 border-[#7a3030]/25 rounded-xl hover:bg-[#7a3030]/5 active:scale-[0.98] transition-all"
              >
                🗑️ Je connais ce mot — le retirer du lexique
              </button>
            )}

            {/* Toutes les occurrences dans le Coran (Baqara → An-Nās) */}
            {isSheet && morph.root && (
              <div className="mt-4 pt-3 border-t border-[var(--ds-gold)]/30">
                <OccurrencesExplorer
                  root={morph.root}
                  gloss={gloss || analysis?.frenchGloss}
                  fullQuran
                  embedded
                  onClose={() => {}}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
