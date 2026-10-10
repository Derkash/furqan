'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '@/lib/apiUrl';
import {
  getRootOccurrences,
  getVerseWords,
  describeMorphology,
  type RootOccurrence,
} from '@/utils/vocab/morphology';
import { toArabicNumbers } from '@/utils/arabicNumbers';
import {
  getCachedOccInfo,
  setCachedOccInfoBulk,
  getCachedRootFamily,
  setCachedRootFamilyBulk,
  familyKey,
  type RootFamilyCache,
  type RootRelation,
} from '@/utils/vocab/glossCache';
import { highlightFrench } from '@/utils/vocab/frHighlight';
import { useQuranUnits } from '@/hooks/exercises/useQuranUnits';
import { unitToPageRange } from '@/utils/exercises/rangeToPages';
import { loadSharedRange } from '@/utils/exercises/sharedRange';
import { getCurrentUser } from '@/utils/exercises/userStats';
import RangePicker, { type RangePickerValue } from '@/components/exercises/RangePicker';

interface Props {
  root: string;
  gloss?: string;
  /** Lemme du mot ÉTUDIÉ : sert à regrouper les occurrences par proximité de
   *  SENS (même mot / même famille de sens / sens éloigné malgré la racine). */
  lemma?: string;
  onClose: () => void;
  /**
   * Si fourni : mode « déjà vu » — on montre les occurrences des pages
   * 1..beforePage-1 (avant la page courante), sans sélecteur de plage.
   */
  beforePage?: number;
  /** Toutes les occurrences du Coran (Baqara → An-Nās), sans sélecteur de plage. */
  fullQuran?: boolean;
  /** Rendu intégré (sans overlay ni bouton fermer) pour l'embarquer dans un autre panneau. */
  embedded?: boolean;
}

/** Clé d'info PAR OCCURRENCE (verset:mot) : le sens d'un mot varie d'un verset
 *  à l'autre, donc chaque occurrence reçoit sa propre traduction contextuelle. */
function infoKey(o: RootOccurrence): string {
  return `${o.verseKey}:${o.word}`;
}

const RELATION_LABEL: Record<RootRelation, string> = {
  same: 'Même mot',
  close: 'Même famille de sens',
  far: 'Sens éloigné (même racine, autre mot)',
  unknown: 'Autres mots de la racine (lien de sens non vérifié)',
};

/** Explorateur : occurrences d'une racine sur une plage, REGROUPÉES PAR SENS.
 *  Une même racine couvre souvent des mots sans rapport (فَتَاة « jeune fille »
 *  vs اِسْتَفْتَى « demander un avis » partagent ف‑ت‑ي, pas le sens). On montre
 *  d'abord le mot étudié, puis sa famille de sens, et on replie le reste. */
export default function OccurrencesExplorer({ root, gloss, lemma, onClose, beforePage, fullQuran, embedded }: Props) {
  const locked = typeof beforePage === 'number' || !!fullQuran;
  const studied = lemma ? lemma.normalize('NFC') : null;
  // Verdict par lemme (autre que le mot étudié) : relation + sens + note.
  const [family, setFamily] = useState<Record<string, RootFamilyCache>>({});
  const [familyLoading, setFamilyLoading] = useState(false);
  const [showFar, setShowFar] = useState(false);
  const { data: units } = useQuranUnits();
  // Par défaut, on se limite à la plage GLOBALE définie en entrant dans le
  // vocabulaire (modifiable via le sélecteur ci-dessous).
  const [range, setRange] = useState<RangePickerValue>({ mode: 'juz', start: null, end: null });
  const [occ, setOcc] = useState<RootOccurrence[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Traduction Hamidullah (verset → FR) + mots arabes par verset (pour surligner).
  const [trans, setTrans] = useState<Record<string, string> | null>(null);
  const [verseWords, setVerseWords] = useState<Record<string, { position: number; form: string }[]>>({});
  // Info par occurrence : { gloss, frSpan, note }. Claude si clé, sinon gratuit.
  const [info, setInfo] = useState<Record<string, { gloss: string; frSpan: string; note: string }>>({});

  const { startPage, endPage } = useMemo(
    () => unitToPageRange(range.mode, range.start, range.end, units),
    [range, units]
  );
  // Plage effective : tout le Coran (fullQuran) ; « déjà vu » (1..beforePage-1) ;
  // sinon la sélection, sinon tout le Coran.
  const start = locked ? 1 : (startPage ?? 1);
  const end = fullQuran ? 604 : locked ? Math.max(0, (beforePage ?? 1) - 1) : (endPage ?? 604);

  /* eslint-disable react-hooks/set-state-in-effect */
  // Se cale sur la plage globale (celle définie en entrant dans le vocabulaire).
  useEffect(() => {
    if (locked) return; // plage figée en mode « déjà vu »
    const s = loadSharedRange();
    if (s && (s.start != null || s.end != null)) {
      setRange({ mode: s.mode, start: s.start, end: s.end });
    }
  }, [locked]);

  // Traduction Hamidullah (chargée une fois).
  useEffect(() => {
    let cancelled = false;
    fetch('/qcf-data/translation-hamidullah.fr.json')
      .then((r) => r.json())
      .then((d) => !cancelled && setTrans(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setInfo({});
    getRootOccurrences(root, start, end).then(async (res) => {
      if (cancelled) return;
      setOcc(res);
      setLoading(false);
      // Mots arabes des versets (pour surligner le mot ciblé).
      const keys = Array.from(new Set(res.map((o) => o.verseKey)));
      const entries = await Promise.all(
        keys.map(async (vk) => [vk, await getVerseWords(vk)] as const)
      );
      if (!cancelled) setVerseWords(Object.fromEntries(entries));
      // Info par occurrence : traduction contextuelle + mini-explication.
      // 1) On lit d'abord le CACHE LOCAL (dispo hors ligne) ; 2) on ne demande à
      // l'API que les occurrences non encore connues ; 3) on met le cache à jour.
      const cached: Record<string, { gloss: string; frSpan: string; note: string }> = {};
      const synth = new Map<string, string>(); // infoKey (arabe) -> clé ASCII
      const items = [];
      for (const o of res) {
        const ik = infoKey(o);
        if (synth.has(ik)) continue;
        synth.set(ik, `k${synth.size}`);
        const hit = getCachedOccInfo(ik);
        // On ne réutilise le cache que s'il porte une info EXPLOITABLE (frSpan ou
        // gloss). Les entrées vides (mises en cache lors d'une réponse tronquée)
        // sont re-demandées.
        if (hit && (hit.frSpan || hit.gloss)) {
          cached[ik] = hit;
          continue;
        }
        items.push({
          key: synth.get(ik)!,
          form: o.morph?.form,
          root: o.morph?.root,
          verbForm: o.morph?.verbForm,
          pos: o.morph?.pos,
          verseKey: o.verseKey,
          position: o.word,
        });
      }
      if (!cancelled && Object.keys(cached).length) {
        setInfo((prev) => ({ ...prev, ...cached }));
      }
      if (items.length === 0) return; // tout en cache → rien à charger
      try {
        const r = await fetch(apiUrl('/api/occurrence-info'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, user: getCurrentUser() ?? undefined }),
        });
        const data = await r.json();
        if (!cancelled && data?.info) {
          const remapped: Record<string, { gloss: string; frSpan: string; note: string }> = {};
          for (const [ik, sk] of synth) if (data.info[sk]) remapped[ik] = data.info[sk];
          setInfo((prev) => ({ ...prev, ...remapped }));
          // On ne persiste que les réponses portant un frSpan (chaîne), pour ne
          // pas empoisonner le cache avec des entrées d'une ancienne API.
          const toCache: Record<string, { gloss: string; frSpan: string; note: string }> = {};
          for (const [ik, v] of Object.entries(remapped)) {
            if (typeof v.frSpan === 'string') toCache[ik] = v;
          }
          setCachedOccInfoBulk(toCache);
        }
      } catch {
        /* réseau — on garde le sens de base (et le cache déjà chargé) */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [root, start, end]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Classement des AUTRES lemmes de la racine par proximité de sens avec le
  // mot étudié : cache local d'abord, API pour les lemmes encore inconnus.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!occ || !studied) return;
    let cancelled = false;
    const samples = new Map<string, RootOccurrence>();
    for (const o of occ) {
      const l = o.morph?.lemma?.normalize('NFC');
      if (!l || l === studied || samples.has(l)) continue;
      samples.set(l, o);
    }
    const known: Record<string, RootFamilyCache> = {};
    const todo: { lemma: string; form?: string; pos?: string; verbForm?: string; verseKey: string }[] = [];
    for (const [l, o] of samples) {
      const hit = getCachedRootFamily(familyKey(root, studied, l));
      if (hit && hit.relation !== 'unknown') known[l] = hit;
      else todo.push({ lemma: l, form: o.morph?.form, pos: o.morph?.pos, verbForm: o.morph?.verbForm, verseKey: o.verseKey });
    }
    setFamily(known);
    setShowFar(false);
    if (!todo.length) return;
    setFamilyLoading(true);
    const studiedForm = occ.find((o) => o.morph?.lemma?.normalize('NFC') === studied)?.morph?.form;
    fetch(apiUrl('/api/root-family'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root, lemma: studied, gloss, form: studiedForm, others: todo, user: getCurrentUser() ?? undefined }),
    })
      .then((r) => r.json())
      .then((data: { info?: Record<string, RootFamilyCache> }) => {
        if (cancelled || !data?.info) return;
        const got: Record<string, RootFamilyCache> = {};
        const toCache: Record<string, RootFamilyCache> = {};
        for (const [l, v] of Object.entries(data.info)) {
          const nl = l.normalize('NFC');
          got[nl] = v;
          if (v.relation !== 'unknown') toCache[familyKey(root, studied, nl)] = v;
        }
        setFamily((prev) => ({ ...prev, ...got }));
        setCachedRootFamilyBulk(toCache);
      })
      .catch(() => {})
      .finally(() => !cancelled && setFamilyLoading(false));
    return () => {
      cancelled = true;
    };
  }, [occ, root, studied, gloss]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /** Relation d'une occurrence avec le mot étudié. */
  const relationOf = (o: RootOccurrence): RootRelation => {
    if (!studied) return 'same'; // pas de mot étudié : tout est listé ensemble
    const l = o.morph?.lemma?.normalize('NFC');
    if (!l) return 'unknown';
    if (l === studied) return 'same';
    return family[l]?.relation ?? 'unknown';
  };

  // Formes distinctes rencontrées — du mot étudié et de sa famille de sens
  // seulement (pas des homographes de racine au sens éloigné).
  const distinctForms = useMemo(() => {
    if (!occ) return [];
    const seen = new Set<string>();
    const forms: string[] = [];
    for (const o of occ) {
      const rel = relationOf(o);
      if (rel === 'far' || rel === 'unknown') continue;
      const f = o.morph?.form;
      if (f && !seen.has(f)) {
        seen.add(f);
        forms.push(f);
      }
    }
    return forms;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occ, family, studied]);

  // Ordre d'apparition strict dans le Mushaf (page, puis verset, puis mot).
  const ordered = useMemo(() => {
    if (!occ) return [];
    return [...occ].sort(
      (a, b) => a.page - b.page || a.surah - b.surah || a.verse - b.verse || a.word - b.word
    );
  }, [occ]);

  // Groupes par proximité de sens, dans l'ordre d'intérêt pour l'apprenant.
  const groups = useMemo(() => {
    const g: Record<RootRelation, RootOccurrence[]> = { same: [], close: [], far: [], unknown: [] };
    for (const o of ordered) g[relationOf(o)].push(o);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, family, studied]);

  // Sur tout le Coran, une racine fréquente peut avoir des centaines
  // d'occurrences → on plafonne l'affichage pour rester fluide.
  const MAX_SHOWN = 150;
  const nearCount = groups.same.length + groups.close.length;

  /** Lemmes (avec sens) d'un groupe, pour l'en-tête du groupe. */
  const lemmaChips = (list: RootOccurrence[]) => {
    const seen = new Map<string, RootFamilyCache | undefined>();
    for (const o of list) {
      const l = o.morph?.lemma?.normalize('NFC');
      if (l && !seen.has(l)) seen.set(l, family[l]);
    }
    return [...seen.entries()];
  };

  const header = (
    <div className={embedded ? 'px-1 pt-1 pb-2' : 'flex-none p-4 border-b border-[var(--ds-gold)]/30'}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--ds-gold)]">
            Occurrences de la racine
          </p>
          <p dir="rtl" className="text-2xl font-bold text-[var(--ds-green)]" style={{ fontFamily: "'Amiri',serif" }}>
            {root.split('').join(' ')}
          </p>
          {gloss && <p className="text-sm text-gray-500">{gloss}</p>}
        </div>
        {!embedded && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 rounded-full bg-[var(--ds-green)]/10 text-[var(--ds-green)] flex items-center justify-center hover:bg-[var(--ds-green)]/20"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Plage : tout le Coran / « déjà vu » figé, sinon sélecteur */}
      <div className="mt-3">
        {locked ? (
          <div className="flex items-center justify-between text-xs bg-[var(--ds-green)]/10 rounded-lg px-2.5 py-1.5">
            <span className="text-[var(--ds-green)] font-semibold">
              {fullQuran
                ? 'Toutes les occurrences (البقرة → الناس)'
                : end >= start
                  ? `Déjà rencontré avant la page ${toArabicNumbers(beforePage!)} (pages ${toArabicNumbers(start)}–${toArabicNumbers(end)})`
                  : `Aucune page avant la page ${toArabicNumbers(beforePage!)}`}
            </span>
            <span className="text-[var(--ds-sage)] font-bold whitespace-nowrap ml-2">
              {occ ? `${toArabicNumbers(occ.length)} fois` : ''}
              {occ && studied && occ.length !== nearCount ? ` · ${toArabicNumbers(nearCount)} au même sens` : ''}
            </span>
          </div>
        ) : (
          <>
            <RangePicker value={range} onChange={setRange} chapters={units?.chapters ?? []} />
            <div className="flex items-center justify-between mt-2 text-xs">
              <span className="text-[#7a5d2c]">
                {startPage != null
                  ? `pages ${Math.min(startPage, endPage!)}–${Math.max(startPage, endPage!)}`
                  : 'tout le Coran'}
              </span>
              <span className="text-[var(--ds-sage)] font-bold">
                {occ ? `${toArabicNumbers(occ.length)} apparition${occ.length > 1 ? 's' : ''}` : ''}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Formes distinctes */}
      {distinctForms.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mt-2">
          {distinctForms.slice(0, 12).map((f) => (
            <span
              key={f}
              dir="rtl"
              className="text-[var(--ds-green)] bg-white/70 border border-[var(--ds-gold)]/30 rounded-lg px-2 py-0.5"
              style={{ fontFamily: "'Amiri',serif", fontSize: '1.2em' }}
            >
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  const renderOcc = (o: RootOccurrence) => {
    const inf = info[infoKey(o)];
    return (
      <div key={o.location} className="bg-white/70 rounded-xl p-3 border border-[var(--ds-gold)]/20">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[11px] text-[#7a5d2c] font-bold whitespace-nowrap">
            {o.verseKey} · p.{toArabicNumbers(o.page)}
          </span>
          <div className="flex items-center gap-1.5">
            {o.morph?.lemma && (
              <span dir="rtl" className="text-[10px] text-[#7a5d2c] bg-[var(--ds-gold)]/15 rounded-full px-1.5" style={{ fontFamily: "'Amiri',serif" }}>
                {o.morph.lemma}
              </span>
            )}
            {o.morph && (
              <span className="text-[10px] text-gray-400 text-right">
                {describeMorphology(o.morph).slice(0, 2).join(' · ')}
              </span>
            )}
          </div>
        </div>

        {/* Verset arabe — le mot ciblé surligné */}
        <p dir="rtl" className="text-[var(--ds-green)] leading-loose" style={{ fontFamily: "'UthmanicHafs','Amiri',serif", fontSize: '1.6em' }}>
          {(verseWords[o.verseKey] ?? []).map((w) => (
            <span
              key={w.position}
              className={w.position === o.word ? 'bg-[var(--ds-gold)]/45 rounded px-0.5 font-bold' : ''}
            >
              {w.form}{' '}
            </span>
          ))}
          {!verseWords[o.verseKey] && (o.morph?.form ?? '')}
        </p>

        {/* Traduction Hamidullah du verset (contexte) — le mot ciblé
            surligné comme dans le verset arabe (portion FR exacte du LLM). */}
        {trans?.[o.verseKey] && (
          <p className="text-[12px] text-gray-600 mt-1.5 leading-relaxed">
            {highlightFrench(trans[o.verseKey], inf?.frSpan ?? '', inf?.gloss ?? '', gloss ?? '').map((seg, i) =>
              seg.hit ? (
                <mark
                  key={i}
                  className="bg-[var(--ds-gold)]/45 text-[var(--ds-green)] rounded px-0.5 font-semibold"
                >
                  {seg.t}
                </mark>
              ) : (
                <span key={i}>{seg.t}</span>
              )
            )}
          </p>
        )}

        {/* Mini-explication du wazn (ce que la forme apporte au sens) */}
        {inf?.note && (
          <p className="text-[11px] text-gray-500 italic mt-0.5">{inf.note}</p>
        )}
      </div>
    );
  };

  /** En-tête d'un groupe de sens : libellé + lemmes (sens + lien de sens). */
  const groupHeader = (rel: RootRelation, list: RootOccurrence[]) => (
    <div className="pt-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--ds-gold)]">
        {RELATION_LABEL[rel]} · {toArabicNumbers(list.length)}
      </p>
      {rel !== 'same' && (
        <ul className="mt-1 space-y-0.5">
          {lemmaChips(list).map(([l, v]) => (
            <li key={l} className="text-[12px] text-gray-600 flex items-baseline gap-1.5 flex-wrap">
              <span dir="rtl" className="text-[var(--ds-green)] font-bold" style={{ fontFamily: "'Amiri',serif", fontSize: '1.2em' }}>
                {l}
              </span>
              {v?.gloss && <span className="font-semibold">{v.gloss}</span>}
              {v?.note && <span className="italic text-gray-500">— {v.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const list = (
    <div className={embedded ? 'px-1 space-y-2' : 'flex-1 overflow-y-auto p-3 space-y-2'}>
      {loading && <p className="text-center text-gray-400 py-6 text-sm">Recherche…</p>}
      {!loading && occ?.length === 0 && (
        <p className="text-center text-gray-500 py-6 text-sm">Aucune occurrence sur cette plage.</p>
      )}

      {/* Sans mot étudié : liste simple (comportement historique). */}
      {!loading && !studied && ordered.slice(0, fullQuran ? MAX_SHOWN : undefined).map(renderOcc)}
      {!loading && !studied && fullQuran && ordered.length > MAX_SHOWN && (
        <p className="text-center text-[11px] text-gray-400 py-2">
          … et {toArabicNumbers(ordered.length - MAX_SHOWN)} autres occurrences (racine fréquente)
        </p>
      )}

      {/* Avec mot étudié : même mot → famille de sens → (replié) sens éloigné. */}
      {!loading && studied && groups.same.length > 0 && (
        <>
          {groupHeader('same', groups.same)}
          {groups.same.slice(0, MAX_SHOWN).map(renderOcc)}
          {groups.same.length > MAX_SHOWN && (
            <p className="text-center text-[11px] text-gray-400 py-2">
              … et {toArabicNumbers(groups.same.length - MAX_SHOWN)} autres occurrences de ce mot
            </p>
          )}
        </>
      )}
      {!loading && studied && groups.close.length > 0 && (
        <>
          {groupHeader('close', groups.close)}
          {groups.close.slice(0, MAX_SHOWN).map(renderOcc)}
        </>
      )}
      {!loading && studied && familyLoading && (
        <p className="text-[11px] text-gray-400 flex items-center gap-2 pt-1">
          <span className="w-3 h-3 border-2 border-[var(--ds-gold)] border-t-transparent rounded-full animate-spin" />
          Classement des autres mots de la racine par proximité de sens…
        </p>
      )}
      {!loading && studied && !familyLoading && groups.unknown.length > 0 && (
        <>
          {groupHeader('unknown', groups.unknown)}
          {groups.unknown.slice(0, 40).map(renderOcc)}
        </>
      )}
      {!loading && studied && groups.far.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowFar((v) => !v)}
            className="w-full text-left text-[12px] text-gray-500 bg-white/50 border border-dashed border-[var(--ds-gold)]/40 rounded-xl px-3 py-2 hover:bg-white/80"
          >
            <span className="font-bold text-[#7a5d2c]">
              {toArabicNumbers(groups.far.length)} occurrence{groups.far.length > 1 ? 's' : ''} d’un autre mot de la racine, au sens éloigné
            </span>
            <span className="block mt-0.5">
              {lemmaChips(groups.far)
                .map(([l, v]) => `${l}${v?.gloss ? ` (${v.gloss})` : ''}`)
                .join(' · ')}
            </span>
            <span className="block mt-0.5 underline">{showFar ? 'Masquer' : 'Afficher quand même'}</span>
          </button>
          {showFar && (
            <div className="space-y-2 mt-2">
              {groupHeader('far', groups.far)}
              {groups.far.slice(0, 60).map(renderOcc)}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Rendu intégré (dans un autre panneau) : pas d'overlay ni de carte.
  if (embedded) {
    return (
      <div>
        {header}
        {list}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="bg-[var(--ds-bg)] rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border-2 border-[var(--ds-gold)]"
        onClick={(e) => e.stopPropagation()}
      >
        {header}
        {list}
      </div>
    </div>
  );
}
