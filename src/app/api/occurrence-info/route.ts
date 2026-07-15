import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { frenchWordGloss } from '@/lib/quranWords';

// Info par forme fléchie pour l'explorateur d'occurrences : traduction de CETTE
// forme + une mini-explication (ce que le wazn apporte au sens).
//   - Avec ANTHROPIC_API_KEY : un seul appel Claude pour toute la liste.
//   - Sinon : traduction mot-à-mot Quran.com→FR, sans explication rédigée.
// Résultat mis en cache par clé (forme) pour ne pas repayer.

export const runtime = 'nodejs';
export const maxDuration = 45;

interface Item {
  key: string; // clé stable (ex. forme fléchie)
  form?: string;
  root?: string;
  verbForm?: string;
  pos?: string;
  verseKey?: string;
  position?: number;
}

const cache = new Map<string, { gloss: string; note: string }>();

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

const SYSTEM = `Tu aides un francophone à mémoriser le vocabulaire coranique. On te donne une LISTE de formes fléchies d'une même racine (rencontrées dans des versets). Pour CHAQUE forme, renvoie :
- key : la clé fournie, inchangée.
- gloss : la traduction française CONCRÈTE de CETTE forme précise (pas de la racine), courte (1 à 6 mots), au registre usuel (style dictionnaire Abdel-Nour), fidèle au sens dans le verset fourni.
- note : UNE phrase courte expliquant ce que la forme/le wazn apporte au sens (ex. « forme X : demander l'action → demander pardon » ; « forme IV, factitif : rendre corrompu » ; passif, participe, etc.). Concret, pas de jargon inutile.
Réponds uniquement via le format structuré.`;

const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          gloss: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['key', 'gloss', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
} as const;

async function claudeBatch(items: Item[]): Promise<Record<string, { gloss: string; note: string }>> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const trans = await getHamidullah();
  const lines = items.map((it) => {
    const t = it.verseKey ? trans[it.verseKey] : undefined;
    return `- key=${it.key} | forme=${it.form ?? ''} | racine=${it.root ?? ''} | wazn=${it.verbForm ?? ''} | nature=${it.pos ?? ''}${
      t ? ` | verset: ${t}` : ''
    }`;
  });
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1500,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: lines.join('\n') }],
  });
  const block = msg.content.find((b) => b.type === 'text');
  const out: Record<string, { gloss: string; note: string }> = {};
  if (block && block.type === 'text') {
    const parsed = JSON.parse(block.text);
    for (const r of parsed.results ?? []) {
      if (r.key) out[r.key] = { gloss: r.gloss ?? '', note: r.note ?? '' };
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  let body: { items?: Item[] };
  try {
    body = await req.json();
  } catch {
    return new Response('Corps JSON invalide', { status: 400 });
  }
  const items = (body.items ?? []).filter((it) => it?.key).slice(0, 60);
  const result: Record<string, { gloss: string; note: string }> = {};
  const todo: Item[] = [];
  for (const it of items) {
    if (cache.has(it.key)) result[it.key] = cache.get(it.key)!;
    else todo.push(it);
  }
  if (todo.length === 0) return Response.json({ info: result });

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const got = await claudeBatch(todo);
      for (const it of todo) {
        const v = got[it.key] ?? { gloss: '', note: '' };
        cache.set(it.key, v);
        result[it.key] = v;
      }
      return Response.json({ info: result });
    } catch {
      /* échec LLM → repli gratuit */
    }
  }

  // Repli gratuit : traduction mot-à-mot (Quran.com→FR), sans note rédigée.
  for (const it of todo) {
    const gloss =
      it.verseKey && it.position ? await frenchWordGloss(it.verseKey, it.position) : '';
    const v = { gloss, note: '' };
    if (gloss) cache.set(it.key, v);
    result[it.key] = v;
  }
  return Response.json({ info: result });
}
