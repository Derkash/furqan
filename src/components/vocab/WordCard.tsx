'use client';

import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/apiUrl';
import {
  getWordMorphology,
  getVerseText,
  getVerseWords,
  describeMorphology,
  stripLeadingParticles,
  type WordMorphology,
} from '@/utils/vocab/morphology';
import {
  addVocab,
  getVocabEntry,
  removeVocab,
  removeVocabContext,
  knowsSense,
  type VocabEntry,
  type VocabContext,
} from '@/utils/vocab/vocabStore';
import { getCachedAnalysis, setCachedAnalysis, type WordAnalysisCache } from '@/utils/vocab/glossCache';
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
  contextGloss: string;
  contextNote: string;
  spanStart: number;
  spanEnd: number;
  llm: boolean;
  stored?: boolean; // rechargé depuis le lexique / le cache (aucun appel API)
}

const SPAN_RADIUS = 3;

/** Fragment arabe du verset entre deux positions (1-based, inclusives). */
function snippetOf(words: { position: number; form: string }[], start: number, end: number): string {
  return words
    .filter((w) => w.position >= start && w.position <= end)
    .map((w) => w.form)
    .join(' ');
}

export default function WordCard({ verseKey, position, side, onClose, onAdded, onRemoved, onOccurrences, variant = 'panel' }: WordCardProps) {
  const [morph, setMorph] = useState<WordMorphology | null>(null);
  const [loadingMorph, setLoadingMorph] = useState(true);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loadingLLM, setLoadingLLM] = useState(false);
  const [gloss, setGloss] = useState('');
  // Sens DANS CE VERSET (modifiable) + fragment où il se lit.
  const [ctxGloss, setCtxGloss] = useState('');
  const [ctxNote, setCtxNote] = useState('');
  const [span, setSpan] = useState<{ start: number; end: number } | null>(null);
  const [verseWords, setVerseWords] = useState<{ position: number; form: string }[]>([]);
  const [existing, setExisting] = useState<VocabEntry | null>(null);
  const [justAdded, setJustAdded] = useState<'added' | 'duplicate' | 'context-added' | null>(null);
  const reqId = useRef(0);

  const existingId = existing?.id ?? null;
  // Le mot est connu mais PAS encore pour ce verset → on peut y ajouter un sens.
  const storedCtx: VocabContext | undefined = existing?.contexts?.find(
    (c) => c.verseKey === verseKey && c.position === position
  );

  // Charge la morphologie déterministe puis l'analyse (sens général + en contexte).
  useEffect(() => {
    const id = ++reqId.current;
    setMorph(null);
    setAnalysis(null);
    setGloss('');
    setCtxGloss('');
    setCtxNote('');
    setSpan(null);
    setVerseWords([]);
    setJustAdded(null);
    setLoadingMorph(true);
    setLoadingLLM(false);

    (async () => {
      const [m, words] = await Promise.all([
        getWordMorphology(verseKey, position),
        getVerseWords(verseKey).catch(() => [] as { position: number; form: string }[]),
      ]);
      if (id !== reqId.current) return;
      setMorph(m);
      setVerseWords(words);
      setLoadingMorph(false);
      if (!m) return;
      const wordCount = words.length || position + SPAN_RADIUS;
      const defaultSpan = {
        start: Math.max(1, position - SPAN_RADIUS),
        end: Math.min(wordCount, position + SPAN_RADIUS),
      };

      const ex = getVocabEntry(m.lemma, m.root, m.form);
      setExisting(ex);
      const ctxAt = ex?.contexts?.find((c) => c.verseKey === verseKey && c.position === position);

      // Déjà dans le lexique, et ce verset déjà capturé → tout est stocké,
      // AUCUN appel réseau.
      if (ex && ctxAt) {
        setAnalysis({
          baseForm: ex.baseForm || '',
          baseFormType: ex.baseFormType || '',
          frenchGloss: ex.gloss,
          nahw: ex.nahw || '',
          contextGloss: ctxAt.gloss,
          contextNote: ctxAt.note || '',
          spanStart: ctxAt.spanStart,
          spanEnd: ctxAt.spanEnd,
          llm: false,
          stored: true,
        });
        setGloss(ex.gloss);
        setCtxGloss(ctxAt.gloss);
        setCtxNote(ctxAt.note || '');
        setSpan({ start: ctxAt.spanStart, end: ctxAt.spanEnd });
        return;
      }
      if (ex) setGloss(ex.gloss);

      const apply = (a: WordAnalysisCache, stored: boolean, llm: boolean) => {
        const s = {
          start: a.spanStart ?? defaultSpan.start,
          end: a.spanEnd ?? defaultSpan.end,
        };
        setAnalysis({
          baseForm: ex?.baseForm || a.baseForm || '',
          baseFormType: ex?.baseFormType || a.baseFormType || '',
          frenchGloss: ex?.gloss || a.frenchGloss || '',
          nahw: ex?.nahw || a.nahw || '',
          contextGloss: a.contextGloss || a.frenchGloss || '',
          contextNote: a.contextNote || '',
          spanStart: s.start,
          spanEnd: s.end,
          llm,
          stored,
        });
        if (!ex) setGloss(a.frenchGloss || '');
        setCtxGloss(a.contextGloss || a.frenchGloss || '');
        setCtxNote(a.contextNote || '');
        setSpan(s);
      };

      // Cache LOCAL d'abord (dispo hors ligne), API en dernier.
      const cacheKey = `${verseKey}:${position}`;
      const cached = getCachedAnalysis(cacheKey);
      if (cached) {
        apply(cached, true, true);
        return;
      }

      setLoadingLLM(true);
      setSpan(defaultSpan);
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
          const a: WordAnalysisCache = {
            baseForm: data.baseForm,
            baseFormType: data.baseFormType,
            frenchGloss: data.frenchGloss,
            nahw: data.nahw,
            contextGloss: data.contextGloss,
            contextNote: data.contextNote,
            spanStart: data.spanStart,
            spanEnd: data.spanEnd,
          };
          apply(a, false, !!data.llm);
          setCachedAnalysis(cacheKey, a);
        }
      } catch {
        /* réseau — on garde la morphologie seule */
      } finally {
        if (id === reqId.current) setLoadingLLM(false);
      }
    })();
  }, [verseKey, position]);

  const snippet = span ? snippetOf(verseWords, span.start, span.end) : '';

  const contextInput = () => {
    if (!span || !ctxGloss.trim()) return undefined;
    return {
      verseKey,
      position,
      gloss: ctxGloss.trim(),
      snippet: snippet || morph?.form || '',
      spanStart: span.start,
      spanEnd: span.end,
      note: ctxNote.trim() || undefined,
    };
  };

  const handleAdd = () => {
    if (!morph) return;
    const res = addVocab({
      // Forme coranique EXACTE du mot, moins les particules attachées en tête
      // (و, ف, بِ, أَ interrogatif…) qui n'appartiennent pas au mot.
      arabic: stripLeadingParticles(morph),
      gloss: gloss || ctxGloss || analysis?.frenchGloss || '',
      root: morph.root,
      lemma: morph.lemma,
      baseForm: analysis?.baseForm,
      baseFormType: analysis?.baseFormType,
      nahw: analysis?.nahw,
      sampleVerseKey: verseKey,
      source: 'mushaf',
      context: contextInput(),
    });
    setJustAdded(res.status);
    setExisting(res.entry);
    if (res.status === 'added') onAdded?.(res.entry);
  };

  // Mot déjà connu : on lui ajoute le sens de CE verset.
  const handleAddContext = () => {
    if (!morph || !existing) return;
    const res = addVocab({
      arabic: stripLeadingParticles(morph),
      gloss: existing.gloss,
      root: morph.root,
      lemma: morph.lemma,
      context: contextInput(),
    });
    setJustAdded(res.status);
    setExisting(res.entry);
  };

  const handleRemove = () => {
    if (!existingId) return;
    removeVocab(existingId);
    setExisting(null);
    setJustAdded(null);
    onRemoved?.();
  };

  const handleRemoveContext = (c: VocabContext) => {
    if (!existingId) return;
    removeVocabContext(existingId, c.verseKey, c.position);
    const refreshed = morph ? getVocabEntry(morph.lemma, morph.root, morph.form) : null;
    setExisting(refreshed);
    setJustAdded(null);
  };

  const isSheet = variant === 'sheet';
  const senseDiffers =
    !!ctxGloss.trim() && !!gloss.trim() && ctxGloss.trim().toLowerCase() !== gloss.trim().toLowerCase();
  // Ce sens est-il nouveau pour un mot déjà connu ?
  const newSenseForKnown =
    !!existing && !storedCtx && !!ctxGloss.trim() && !knowsSense(existing, ctxGloss);

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
                Traduction et sens dans ce verset…
              </p>
            )}
            {analysis?.nahw && (
              <p className="text-[13px] text-gray-600 italic mb-3 leading-relaxed">{analysis.nahw}</p>
            )}

            {/* SENS DANS CE VERSET — le fragment où il se lit, puis le sens contextuel */}
            {(snippet || ctxGloss || loadingLLM) && (
              <div className="mb-3 rounded-xl border-2 border-[var(--ds-green)]/25 bg-[var(--ds-green)]/5 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--ds-green)] mb-1">
                  Sens dans ce verset
                  {senseDiffers && (
                    <span className="ml-1.5 normal-case tracking-normal font-semibold text-[#7a5d2c]">
                      — différent du sens général
                    </span>
                  )}
                </p>
                {snippet && (
                  <p
                    dir="rtl"
                    className="text-[var(--ds-green)] leading-loose mb-1.5"
                    style={{ fontFamily: "'UthmanicHafs','Amiri',serif", fontSize: '1.45em' }}
                  >
                    {verseWords
                      .filter((w) => span && w.position >= span.start && w.position <= span.end)
                      .map((w) => (
                        <span
                          key={w.position}
                          className={w.position === position ? 'bg-[var(--ds-gold)]/45 rounded px-0.5 font-bold' : ''}
                        >
                          {w.form}{' '}
                        </span>
                      ))}
                  </p>
                )}
                <input
                  value={ctxGloss}
                  onChange={(e) => setCtxGloss(e.target.value)}
                  placeholder="ce que le mot veut dire ici…"
                  className="w-full px-3 py-2 rounded-lg border-2 border-[var(--ds-green)]/30 focus:border-[var(--ds-green)] outline-none text-[var(--ds-green)] font-semibold bg-white"
                />
                {ctxNote && <p className="text-[12px] text-gray-600 italic mt-1.5 leading-relaxed">{ctxNote}</p>}
              </div>
            )}

            {/* Sens GÉNÉRAL (celui des flashcards / du jeu d'association) */}
            <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--ds-gold)] mb-1">
              Sens général (modifiable)
              {analysis && (
                <span className="ml-1 normal-case tracking-normal font-normal text-gray-400">
                  {existing
                    ? '— depuis ton lexique'
                    : analysis.stored
                      ? '— depuis le cache (sans nouvel appel)'
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
              disabled={!!existing}
              className="w-full mb-3 px-3 py-2 rounded-lg border-2 border-[var(--ds-gold)]/30 focus:border-[var(--ds-gold)] outline-none text-[var(--ds-green)] font-semibold disabled:bg-white/50"
            />

            {/* Sens déjà capturés dans d'autres versets */}
            {existing?.contexts && existing.contexts.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--ds-gold)] mb-1">
                  Sens enregistrés ({existing.contexts.length})
                </p>
                <ul className="space-y-1">
                  {existing.contexts.map((c) => (
                    <li
                      key={`${c.verseKey}:${c.position}`}
                      className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[13px] ${
                        c.verseKey === verseKey && c.position === position
                          ? 'bg-[var(--ds-green)]/10'
                          : 'bg-white/60'
                      }`}
                    >
                      <span className="text-[11px] text-[#7a5d2c] font-bold whitespace-nowrap pt-0.5">{c.verseKey}</span>
                      <span className="flex-1 min-w-0">
                        <span className="text-[var(--ds-green)] font-semibold">{c.gloss}</span>
                        {c.snippet && (
                          <span dir="rtl" className="block text-gray-600 truncate" style={{ fontFamily: "'Amiri',serif", fontSize: '1.1em' }}>
                            {c.snippet}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveContext(c)}
                        aria-label="Retirer ce sens"
                        className="flex-none text-gray-400 hover:text-[#7a3030] text-sm"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Ajouter / sens ajouté / doublon */}
            {justAdded === 'added' ? (
              <div className="text-center text-sm text-white bg-[var(--ds-green)] rounded-xl py-2.5 font-semibold">
                Ajouté à ton vocabulaire avec le sens de ce verset ✓
              </div>
            ) : justAdded === 'context-added' ? (
              <div className="text-center text-sm text-white bg-[var(--ds-green)] rounded-xl py-2.5 font-semibold">
                Nouveau sens enregistré pour ce verset ✓
              </div>
            ) : existing && newSenseForKnown ? (
              <>
                <div className="text-center text-xs text-[#7a5d2c] bg-[var(--ds-gold)]/15 rounded-xl py-2 font-semibold mb-2">
                  Mot déjà dans ton lexique — mais ici il a un autre sens
                </div>
                <button
                  type="button"
                  onClick={handleAddContext}
                  disabled={!ctxGloss.trim()}
                  className="w-full py-2.5 bg-gradient-to-r from-[var(--ds-green)] to-[var(--ds-sage)] text-white font-bold rounded-xl disabled:opacity-40 active:scale-[0.98] transition-all"
                >
                  ➕ Ajouter ce sens ({verseKey})
                </button>
              </>
            ) : existing ? (
              <div className="text-center text-sm text-[#7a5d2c] bg-[var(--ds-gold)]/15 rounded-xl py-2.5 font-semibold">
                {storedCtx ? 'Ce mot et son sens ici sont dans ton lexique ✓' : 'Ce mot est déjà dans ton lexique ✓'}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAdd}
                disabled={!gloss.trim() && !ctxGloss.trim()}
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
                  lemma={morph.lemma}
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
