import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// Analyse pédagogique d'un mot du Coran pour la section Vocabulaire.
// La morphologie (racine, temps, mode, préfixes…) vient déjà, de façon
// DÉTERMINISTE, du corpus QAC côté client. Cette route ne fait que la partie
// rédactionnelle : forme de base à mémoriser, traduction française, et une
// courte explication nahw en français — à partir des faits fournis.
//
// Modèle : Claude Haiku 4.5 (rapide et peu coûteux ; la tâche est cadrée).
// Le résultat est mémorisé dans l'entrée de vocabulaire de l'utilisateur :
// chaque mot n'est donc analysé qu'une seule fois.

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'claude-haiku-4-5';

// Instructions stables → mises en cache (prompt caching) pour réduire le coût.
const SYSTEM = `Tu es un professeur d'arabe coranique qui aide un francophone ayant des bases en naḥw et ṣarf à mémoriser du vocabulaire.

On te donne l'analyse morphologique DÉJÀ ÉTABLIE d'un mot (elle est fiable, ne la contredis pas) et le verset où il apparaît. Tu produis, en JSON :
- baseForm : la forme de base à retenir, VOCALISÉE en arabe. Pour un verbe : le māḍī 3e pers. masc. sing. (forme فَعَلَ) ; pour un nom/adjectif : le singulier indéfini ; ajoute le maṣdar entre parenthèses s'il est pertinent et connu.
- baseFormType : l'un de "verbe", "nom", "adjectif", "maṣdar", "particule", "autre".
- frenchGloss : la traduction française de la forme de BASE (pas la forme fléchie), courte (1 à 6 mots).
- nahw : UNE à DEUX phrases en français expliquant la forme fléchie telle qu'elle apparaît dans le verset — temps/mode, personne, et surtout les préfixes/particules (ex. « précédé de لا nāhiya, d'où le مجزوم », « و de coordination », « article défini », préposition attachée…). Sois précis et pédagogique, sans jargon inutile.

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

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY non configurée', llm: false },
      { status: 503 }
    );
  }

  let body: {
    form?: string;
    root?: string;
    lemma?: string;
    pos?: string;
    morphology?: string[];
    verseKey?: string;
    verseText?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response('Corps JSON invalide', { status: 400 });
  }

  const { form, root, lemma, pos, morphology, verseKey, verseText } = body;
  if (!form) return new Response('form requis', { status: 400 });

  const facts = [
    `Mot fléchi : ${form}`,
    root ? `Racine : ${root}` : null,
    lemma ? `Lemme (QAC) : ${lemma}` : null,
    pos ? `Nature : ${pos}` : null,
    morphology?.length ? `Analyse : ${morphology.join(' ; ')}` : null,
    verseKey ? `Référence : ${verseKey}` : null,
    verseText ? `Verset : ${verseText}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const client = new Anthropic({ apiKey: key });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
      ],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: facts }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return Response.json({ error: 'Réponse vide' }, { status: 502 });
    }
    const parsed = JSON.parse(textBlock.text);
    return Response.json({ ...parsed, llm: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    return Response.json({ error: msg, llm: false }, { status: 502 });
  }
}
