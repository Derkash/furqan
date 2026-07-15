'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getWordMorphology,
  getVerseText,
  describeMorphology,
  type WordMorphology,
} from '@/utils/vocab/morphology';
import { addVocab, getVocabEntry, type VocabEntry } from '@/utils/vocab/vocabStore';

interface WordCardProps {
  verseKey: string;
  position: number;
  side: 'left' | 'right';
  onClose: () => void;
  onAdded?: (entry: VocabEntry) => void;
}

interface Analysis {
  baseForm: string;
  baseFormType: string;
  frenchGloss: string;
  nahw: string;
  llm: boolean;
  stored?: boolean; // rechargé depuis le lexique (aucun appel API)
}

export default function WordCard({ verseKey, position, side, onClose, onAdded }: WordCardProps) {
  const [morph, setMorph] = useState<WordMorphology | null>(null);
  const [loadingMorph, setLoadingMorph] = useState(true);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loadingLLM, setLoadingLLM] = useState(false);
  const [gloss, setGloss] = useState('');
  const [already, setAlready] = useState(false);
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
      const existing = getVocabEntry(m.root, m.form);
      setAlready(!!existing);
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
        const res = await fetch('/api/vocab-analyze', {
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
    if (res.status === 'added') onAdded?.(res.entry);
  };

  return (
    <div
      className={`absolute inset-y-0 z-30 w-1/2 flex items-center justify-center p-3 ${
        side === 'left' ? 'left-0' : 'right-0'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-[#fdfaf3] border-2 border-[#c9a959] rounded-3xl shadow-2xl w-full max-w-md max-h-full overflow-y-auto p-5">
        {/* Fermer */}
        <div className="flex justify-between items-start mb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959]">
            Vocabulaire — {verseKey}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-7 h-7 rounded-full bg-[#2d5016]/10 text-[#2d5016] flex items-center justify-center hover:bg-[#2d5016]/20"
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
              className="text-center text-[#2d5016] my-1"
              style={{ fontFamily: "'UthmanicHafs','Amiri','Scheherazade New',serif", fontSize: '2.6em', lineHeight: 1.6 }}
            >
              {morph.form}
            </p>

            {/* Racine + forme de base */}
            <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
              {morph.root && (
                <span className="inline-flex items-center gap-1 text-sm bg-[#2d5016]/10 text-[#2d5016] rounded-full px-3 py-1 font-bold">
                  racine
                  <span dir="rtl" style={{ fontFamily: "'Amiri',serif", fontSize: '1.3em' }}>
                    {morph.root.split('').join(' ')}
                  </span>
                </span>
              )}
              {analysis?.baseForm && (
                <span className="inline-flex items-center gap-1 text-sm bg-[#c9a959]/20 text-[#7a5d2c] rounded-full px-3 py-1 font-bold">
                  base
                  <span dir="rtl" style={{ fontFamily: "'Amiri',serif", fontSize: '1.3em' }}>
                    {analysis.baseForm}
                  </span>
                </span>
              )}
            </div>

            {/* Analyse nahw déterministe */}
            <ul className="text-[13px] text-[#4a5a2e] space-y-0.5 mb-3 bg-white/60 rounded-xl p-3 border border-[#c9a959]/20">
              {describeMorphology(morph).map((line, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-[#c9a959]">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            {/* Explication rédigée (LLM) */}
            {loadingLLM && (
              <p className="text-xs text-gray-400 mb-2 flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-[#c9a959] border-t-transparent rounded-full animate-spin" />
                Traduction et explication…
              </p>
            )}
            {analysis?.nahw && (
              <p className="text-[13px] text-gray-600 italic mb-3 leading-relaxed">{analysis.nahw}</p>
            )}

            {/* Gloss éditable */}
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[#c9a959] mb-1">
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
              className="w-full mb-3 px-3 py-2 rounded-lg border-2 border-[#c9a959]/30 focus:border-[#c9a959] outline-none text-[#2d5016] font-semibold"
            />

            {/* Ajouter / doublon */}
            {justAdded === 'duplicate' || (already && justAdded !== 'added') ? (
              <div className="text-center text-sm text-[#7a5d2c] bg-[#c9a959]/15 rounded-xl py-2.5 font-semibold">
                Ce mot est déjà dans ton lexique ✓
              </div>
            ) : justAdded === 'added' ? (
              <div className="text-center text-sm text-white bg-[#2d5016] rounded-xl py-2.5 font-semibold">
                Ajouté à ton vocabulaire ✓
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAdd}
                disabled={!gloss.trim()}
                className="w-full py-2.5 bg-gradient-to-r from-[#2d5016] to-[#4a7c23] text-white font-bold rounded-xl disabled:opacity-40 active:scale-[0.98] transition-all"
              >
                ➕ Ajouter à mon vocabulaire
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
