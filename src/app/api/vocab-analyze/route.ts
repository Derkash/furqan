import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { translate as bingTranslate } from 'bing-translate-api';

// Analyse rédactionnelle d'un mot du Coran pour la section Vocabulaire.
// La morphologie (racine, temps, mode, préfixes…) est DÉTERMINISTE côté client
// (corpus QAC). Cette route ne fournit que : forme de base + traduction FR
// (+ explication nahw si un LLM est configuré).
//
// DEUX MODES, choisis automatiquement :
//   1) GRATUIT (par défaut, aucune clé) : mot-à-mot ANGLAIS de Quran.com →
//      traduction FR via Bing (déjà utilisé pour Ibn Kathir). Mis en cache.
//   2) Claude (si ANTHROPIC_API_KEY est présente) : forme de base classique
//      (māḍī + muḍāriʿ), gloss usuel ancré Hamidullah/Abdel-Nour, et nahw rédigé.

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'claude-haiku-4-5';

// ---- Caches mémoire (par instance) ----
const verseWordsCache = new Map<string, { position: number; en: string }[]>();
const translateCache = new Map<string, string>();

// Table verbe (racine|forme) → { madi, mudari3 } pour la forme de base classique.
let verbs: Record<string, { madi?: string; mudari3?: string }> | null = null;
async function getVerbs(): Promise<Record<string, { madi?: string; mudari3?: string }>> {
  if (verbs) return verbs;
  try {
    const p = path.join(process.cwd(), 'public', 'morphology', 'verbs.json');
    verbs = JSON.parse(await readFile(p, 'utf8'));
  } catch {
    verbs = {};
  }
  return verbs ?? {};
}

let hamidullah: Record<string, string> | null = null;
async function getHamidullah(): Promise<Record<string, string>> {
  if (hamidullah) return hamidullah;
  try {
    const p = path.join(process.cwd(), 'public', 'qcf-data', 'translation-hamidullah.fr.json');
    hamidullah = JSON.parse(await readFile(p, 'utf8'));
  } catch {
    hamidullah = {};
  }
  return hamidullah ?? {};
}

// ---- Mode gratuit : Quran.com (mot-à-mot EN) + Bing (EN→FR) ----

/** Récupère le mot-à-mot anglais d'un verset (Quran.com), mis en cache. */
async function getVerseWordsEn(verseKey: string): Promise<{ position: number; en: string }[]> {
  if (verseWordsCache.has(verseKey)) return verseWordsCache.get(verseKey)!;
  const url = `https://api.quran.com/api/v4/verses/by_key/${verseKey}?words=true&word_translation_language=en`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`quran.com ${res.status}`);
  const data = await res.json();
  const words = (data?.verse?.words ?? [])
    .filter((w: { char_type_name?: string }) => w.char_type_name === 'word')
    .map((w: { position: number; translation?: { text?: string } }) => ({
      position: w.position,
      en: w.translation?.text ?? '',
    }));
  verseWordsCache.set(verseKey, words);
  return words;
}

/** Traduit EN→FR via Bing, avec cache. Renvoie '' en cas d'échec. */
async function toFrench(en: string): Promise<string> {
  const clean = en.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (translateCache.has(clean)) return translateCache.get(clean)!;
  try {
    const r = await bingTranslate(clean, 'en', 'fr');
    const fr = r?.translation?.trim() ?? '';
    translateCache.set(clean, fr);
    return fr;
  } catch {
    return '';
  }
}

function baseTypeFromPos(pos?: string): string {
  if (pos === 'V') return 'verbe';
  if (pos === 'ADJ') return 'adjectif';
  if (pos === 'N' || pos === 'PN') return 'nom';
  return 'autre';
}

/** Forme de base classique : VERBE → māḍī + muḍāriʿ (via racine|forme) ; sinon lemme. */
async function baseForm(input: { form: string; lemma?: string; pos?: string; root?: string; verbForm?: string }) {
  if (input.pos === 'V' && input.root && input.verbForm) {
    const v = (await getVerbs())[`${input.root}|${input.verbForm}`];
    const parts = [v?.madi, v?.mudari3].filter(Boolean);
    if (parts.length) return parts.join(' ');
    if (input.lemma) return input.lemma.replace(/تْ?$/, '') || input.lemma;
  }
  return input.lemma || input.form;
}

async function freeAnalyze(input: {
  form: string;
  lemma?: string;
  pos?: string;
  root?: string;
  verbForm?: string;
  verseKey?: string;
  position?: number;
}) {
  let frenchGloss = '';
  if (input.verseKey && input.position) {
    try {
      const words = await getVerseWordsEn(input.verseKey);
      const w = words.find((x) => x.position === input.position);
      if (w?.en) frenchGloss = await toFrench(w.en);
    } catch {
      /* réseau — on renvoie sans gloss */
    }
  }
  return {
    baseForm: await baseForm(input),
    baseFormType: baseTypeFromPos(input.pos),
    frenchGloss,
    nahw: '',
    llm: false,
    source: 'quran.com+bing',
  };
}

// ---- Mode Claude (optionnel) ----

const SYSTEM = `Tu es un professeur d'arabe coranique qui aide un francophone ayant des bases en naḥw et ṣarf à mémoriser du vocabulaire.

On te donne l'analyse morphologique DÉJÀ ÉTABLIE d'un mot (elle est fiable, ne la contredis pas), le verset où il apparaît, et la traduction française de Hamidullah de ce verset. Tu produis, en JSON :
- baseForm : la forme de base CLASSIQUE à retenir (celle d'un dictionnaire), VOCALISÉE en arabe. Pour un VERBE : donne le māḍī PUIS le muḍāriʿ, 3e pers. masc. sing. (ex. « هَزَمَ يَهْزِمُ », « أَفْسَدَ يُفْسِدُ ») — mets la bonne voyelle du muḍāriʿ. Pour un nom/adjectif : le singulier indéfini. Si c'est un participe, donne le verbe de base (māḍī + muḍāriʿ) dont il dérive.
- baseFormType : l'un de "verbe", "nom", "adjectif", "maṣdar", "particule", "autre".
- frenchGloss : le sens USUEL et CONCRET de la forme de base (pas de la forme fléchie), courte (1 à 6 mots). RÈGLES IMPORTANTES :
  • Reste fidèle à la manière dont HAMIDULLAH rend ce mot dans le verset fourni (aligne-toi sur son vocabulaire quand c'est ce mot précis qui est traduit).
  • Donne le sens du registre d'un dictionnaire arabe-français usuel comme l'ABDEL-NOUR (Abd An-Nour) : le mot courant, concret, celui qu'on emploie vraiment — PAS une traduction théorique, littérale ou étymologique.
  • Ex. préfère « semer la corruption / corrompre » à « détériorer » ; « craindre » à « appréhender par révérence ». Pas de calque morphologique.
- nahw : UNE à DEUX phrases en français expliquant la forme fléchie telle qu'elle apparaît dans le verset — temps/mode, personne, et surtout les préfixes/particules (ex. « précédé de لا nāhiya, d'où le مجزوم », « و de coordination », « article défini », préposition attachée…). Concret et pédagogique, sans jargon inutile.

Réponds uniquement via le format structuré demandé.`;

const SCHEMA = {
  type: 'object',
  properties: {
    baseForm: { type: 'string' },
    baseFormType: {
      type: 'string',
      enum: ['verbe', 'nom', 'adjectif', 'maṣdar', 'particule', 'autre'],
    },
    frenchGloss: { type: 'string' },
    nahw: { type: 'string' },
  },
  required: ['baseForm', 'baseFormType', 'frenchGloss', 'nahw'],
  additionalProperties: false,
} as const;

async function claudeAnalyze(input: {
  form: string;
  root?: string;
  lemma?: string;
  pos?: string;
  morphology?: string[];
  verseKey?: string;
  verseText?: string;
}) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const trad = input.verseKey ? (await getHamidullah())[input.verseKey] : undefined;
  const facts = [
    `Mot fléchi : ${input.form}`,
    input.root ? `Racine : ${input.root}` : null,
    input.lemma ? `Lemme (QAC) : ${input.lemma}` : null,
    input.pos ? `Nature : ${input.pos}` : null,
    input.morphology?.length ? `Analyse : ${input.morphology.join(' ; ')}` : null,
    input.verseKey ? `Référence : ${input.verseKey}` : null,
    input.verseText ? `Verset : ${input.verseText}` : null,
    trad ? `Traduction Hamidullah du verset : ${trad}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: facts }],
  });
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') throw new Error('Réponse vide');
  return { ...JSON.parse(textBlock.text), llm: true, source: 'claude' };
}

// ---- Point d'entrée ----

export async function POST(req: NextRequest) {
  let body: {
    form?: string;
    root?: string;
    lemma?: string;
    pos?: string;
    verbForm?: string;
    morphology?: string[];
    verseKey?: string;
    verseText?: string;
    position?: number;
  };
  try {
    body = await req.json();
  } catch {
    return new Response('Corps JSON invalide', { status: 400 });
  }
  if (!body.form) return new Response('form requis', { status: 400 });
  const input = { ...body, form: body.form };

  // Claude si une clé est présente, sinon repli automatique sur le gratuit.
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return Response.json(await claudeAnalyze(input));
    } catch {
      /* échec LLM → on bascule sur le mode gratuit */
    }
  }
  return Response.json(await freeAnalyze(input));
}
