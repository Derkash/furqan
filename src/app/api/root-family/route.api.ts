import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

// Famille de SENS d'une racine, pour l'explorateur d'occurrences.
// Une racine arabe couvre souvent des mots sans lien de sens (فَتاة « jeune
// fille » vs اِسْتَفْتَى « demander un avis » ; كِتاب « livre » vs كَتيبة
// « bataillon »). Pour un mot ÉTUDIÉ (lemme + sens) et les AUTRES lemmes de
// la même racine rencontrés, on classe chacun : même mot, famille de sens
// proche, ou sens éloigné — afin de ne plus associer aveuglément par racine.
//   - Avec ANTHROPIC_API_KEY (comptes autorisés) : un appel Claude par racine.
//   - Sinon : 'unknown' (affiché à part, sans prétendre à une parenté).
// Résultat mis en cache (mémoire serveur + localStorage côté client).

export const runtime = 'nodejs';
export const maxDuration = 45;

const MODEL = 'claude-opus-5-5';

const CLAUDE_USERS = (process.env.CLAUDE_USERS || 'derkash,abdoulkhader')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
function claudeAllowed(user?: string): boolean {
  return !!process.env.ANTHROPIC_API_KEY && !!user && CLAUDE_USERS.includes(user.toLowerCase());
}

interface OtherLemma {
  lemma: string;
  form?: string; // une forme rencontrée
  pos?: string;
  verbForm?: string;
  verseKey?: string; // un verset d'exemple
}

interface Verdict {
  relation: 'same' | 'close' | 'far' | 'unknown';
  gloss: string;
  note: string;
}

const cache = new Map<string, Verdict>();
const cacheKey = (root: string, studied: string, other: string) =>
  `${root}|${studied.normalize('NFC')}|${other.normalize('NFC')}`;

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

const SYSTEM = `Tu aides un francophone à mémoriser le vocabulaire coranique par familles de SENS, pas seulement par racine.

On te donne un MOT ÉTUDIÉ (lemme arabe, son sens français) et une liste d'AUTRES LEMMES de la MÊME racine rencontrés dans le Coran, chacun avec une forme, un verset d'exemple et sa traduction Hamidullah. Pour CHAQUE autre lemme, renvoie :
- lemma : le lemme fourni, inchangé.
- relation :
  • "close" si le lemme partage clairement le NOYAU de sens du mot étudié, au point qu'apprendre l'un aide à retenir l'autre (ex. étudié غَفَرَ « pardonner » → غَفُور « Pardonneur », مَغْفِرَة « pardon », اِسْتَغْفَرَ « demander pardon » sont "close") ;
  • "far" si, malgré la racine commune, le sens est trop éloigné pour aider la mémorisation (ex. étudié كِتاب « livre » → كَتيبة « bataillon » ; étudié فَتاة « jeune fille » → اِسْتَفْتَى « demander un avis » ; étudié ضَرَبَ « frapper » → ضَريبة « impôt » ; étudié عَرَضَ « présenter » → عَرْض « largeur » est "far", mais أَعْرَضَ « se détourner » reste "close" de مُعْرِض « qui se détourne »).
  Sois exigeant : un rapport étymologique savant ne suffit pas, il faut un rapprochement de sens ÉVIDENT pour un apprenant. En cas de doute, "far".
- gloss : le sens français usuel et concret du lemme (1 à 4 mots, style Abdel-Nour / Hamidullah).
- note : UNE phrase courte. Si "close" : le lien de sens avec le mot étudié (ex. « nom d'action : le pardon lui-même »). Si "far" : pourquoi le sens n'a rien à voir pour l'apprenant.
Réponds uniquement via le format structuré.`;

const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          lemma: { type: 'string' },
          relation: { type: 'string', enum: ['close', 'far'] },
          gloss: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['lemma', 'relation', 'gloss', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
} as const;

async function classify(
  root: string,
  studied: { lemma: string; gloss?: string; form?: string },
  others: OtherLemma[]
): Promise<Record<string, Verdict>> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const trans = await getHamidullah();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const head = [
    `Racine : ${root}`,
    `MOT ÉTUDIÉ : lemme=${studied.lemma}${studied.form ? ` | forme=${studied.form}` : ''}${
      studied.gloss ? ` | sens=${studied.gloss}` : ''
    }`,
    'AUTRES LEMMES DE LA RACINE :',
  ];
  const lines = others.map((o) => {
    const t = o.verseKey ? trans[o.verseKey] : undefined;
    return `- lemme=${o.lemma}${o.form ? ` | forme=${o.form}` : ''}${o.pos ? ` | nature=${o.pos}` : ''}${
      o.verbForm ? ` | wazn=${o.verbForm}` : ''
    }${o.verseKey ? ` | verset ${o.verseKey}` : ''}${t ? ` : ${t}` : ''}`;
  });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: [...head, ...lines].join('\n') }],
  });
  const block = msg.content.find((b) => b.type === 'text');
  const out: Record<string, Verdict> = {};
  if (block && block.type === 'text') {
    const parsed = JSON.parse(block.text) as { results?: { lemma: string; relation: 'close' | 'far'; gloss: string; note: string }[] };
    for (const r of parsed.results ?? []) {
      if (!r.lemma) continue;
      out[r.lemma.normalize('NFC')] = {
        relation: r.relation === 'close' ? 'close' : 'far',
        gloss: r.gloss ?? '',
        note: r.note ?? '',
      };
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  let body: {
    root?: string;
    lemma?: string;
    gloss?: string;
    form?: string;
    others?: OtherLemma[];
    user?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response('Corps JSON invalide', { status: 400 });
  }
  const root = body.root?.trim();
  const studied = body.lemma?.normalize('NFC');
  if (!root || !studied) return new Response('root et lemma requis', { status: 400 });

  const others = (body.others ?? [])
    .filter((o) => o?.lemma)
    .map((o) => ({ ...o, lemma: o.lemma.normalize('NFC') }))
    .filter((o) => o.lemma !== studied)
    .slice(0, 40);

  const result: Record<string, Verdict> = {};
  const todo: OtherLemma[] = [];
  for (const o of others) {
    const ck = cacheKey(root, studied, o.lemma);
    const hit = cache.get(ck);
    if (hit && hit.relation !== 'unknown') result[o.lemma] = hit;
    else todo.push(o);
  }
  if (todo.length === 0) return Response.json({ info: result });

  if (claudeAllowed(body.user)) {
    try {
      const got = await classify(root, { lemma: studied, gloss: body.gloss, form: body.form }, todo);
      for (const o of todo) {
        const v = got[o.lemma] ?? { relation: 'unknown' as const, gloss: '', note: '' };
        if (v.relation !== 'unknown') cache.set(cacheKey(root, studied, o.lemma), v);
        result[o.lemma] = v;
      }
      return Response.json({ info: result });
    } catch {
      /* échec LLM → repli : lien non évalué */
    }
  }
  for (const o of todo) result[o.lemma] = { relation: 'unknown', gloss: '', note: '' };
  return Response.json({ info: result });
}
