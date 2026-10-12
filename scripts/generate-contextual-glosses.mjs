// Traduction CONTEXTUELLE mot à mot, alignée sur Hamidullah, par page du Mushaf.
// Pour chaque verset des pages demandées : un appel Claude qui reçoit les mots
// numérotés (morphologie QAC fiable) + la traduction Hamidullah du verset (et
// des versets voisins pour le fil), et renvoie pour CHAQUE mot :
//   g : la traduction de CE mot DANS CE VERSET (formulation de Hamidullah
//       quand il rend ce mot, sinon le sens concret qui s'insère dans sa phrase),
//   h : la portion EXACTE de Hamidullah qui rend le mot ("" si aucune),
//   n : note courte seulement si le sens ici s'écarte du sens usuel du lemme.
// Sortie : public/glosses/page-NNN.json  { "s:v": [ {p,g,h,n}, … ] }
// Les fichiers existants ne sont jamais purgés ; une page est RÉÉCRITE
// seulement si on la redemande (--force), sinon elle est sautée.
//
//   node scripts/generate-contextual-glosses.mjs --pages 1-5 [--force] [--concurrency 4]
//   node scripts/generate-contextual-glosses.mjs --surahs 1-5
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = process.cwd();
const MORPH = path.join(ROOT, 'public', 'morphology');
const OUT_DIR = path.join(ROOT, 'public', 'glosses');
const MODEL = process.env.GLOSS_MODEL || 'claude-opus-5-5';

// ---- Arguments ----
const args = process.argv.slice(2);
function argVal(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
function parseRange(s) {
  const [a, b] = s.split('-').map(Number);
  const lo = a, hi = Number.isFinite(b) ? b : a;
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}
const FORCE = args.includes('--force');
const CONCURRENCY = Number(argVal('--concurrency') || 4);

function readKey() {
  const line = (fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/).find((l) => l.startsWith('ANTHROPIC_API_KEY=')) || '');
  return line.slice('ANTHROPIC_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
}

// ---- Données ----
const versePage = JSON.parse(fs.readFileSync(path.join(MORPH, 'verse-page.json'), 'utf8'));
const hamidullah = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'qcf-data', 'translation-hamidullah.fr.json'), 'utf8'));
const surahCache = new Map();
function loadSurah(s) {
  if (!surahCache.has(s)) {
    surahCache.set(s, JSON.parse(fs.readFileSync(path.join(MORPH, 'words', `surah-${s}.json`), 'utf8')));
  }
  return surahCache.get(s);
}

// Même règle que src/utils/vocab/morphology.ts (stripLeadingParticles) :
// on retire les particules collées en tête SAUF l'article et une négation.
const KEEP_PREFIX = new Set(['det', 'neg']);
function stripLeadingParticles(m) {
  let out = m.form;
  for (const p of m.prefixes ?? []) {
    if (KEEP_PREFIX.has(p.type)) break;
    if (out.startsWith(p.form)) out = out.slice(p.form.length);
  }
  out = out.replace(/^[ً-ٰٕ]+/, '');
  return out || m.form;
}

const POS_LABEL = { V: 'verbe', N: 'nom', PN: 'nom propre', ADJ: 'adjectif', PRON: 'pronom', P: 'particule/préposition', DET: 'article', CONJ: 'conjonction', ADV: 'adverbe', REL: 'relatif', DEM: 'démonstratif' };
const PREFIX_LABEL = { conj: 'و/ف conjonction', rem: 'ف de reprise', det: 'article الـ', prep: 'préposition بِ/كَ/لِ', fut: 'سـ futur', emph: 'لَـ emphase', intg: 'أ interrogatif', neg: 'négation', other: 'préfixe' };

function verseWords(verseKey) {
  const [s, v] = verseKey.split(':').map(Number);
  const words = loadSurah(s);
  return Object.keys(words)
    .filter((k) => Number(k.split(':')[0]) === v)
    .map((k) => ({ position: Number(k.split(':')[1]), ...words[k] }))
    .sort((a, b) => a.position - b.position);
}

function describe(w) {
  const bits = [POS_LABEL[w.pos] ?? w.pos];
  if (w.lemma) bits.push(`lemme ${w.lemma}`);
  if (w.root) bits.push(`racine ${w.root}`);
  if (w.aspect) bits.push({ perf: 'accompli', impf: 'inaccompli', impv: 'impératif' }[w.aspect]);
  if (w.voice === 'pass') bits.push('passif');
  if (w.verbForm) bits.push(`forme ${w.verbForm}`);
  if (w.pgn) {
    const p = [w.pgn.person && `${w.pgn.person}e pers.`, w.pgn.gender === 'F' ? 'fém.' : w.pgn.gender === 'M' ? 'masc.' : null, { S: 'sing.', D: 'duel', P: 'plur.' }[w.pgn.number] ?? null].filter(Boolean);
    if (p.length) bits.push(p.join(' '));
  }
  const stripped = (w.prefixes ?? []).filter((p) => !KEEP_PREFIX.has(p.type));
  if (stripped.length) bits.push(`particules de tête HORS périmètre : ${stripped.map((p) => `${p.form} (${PREFIX_LABEL[p.type]})`).join(', ')}`);
  if (w.suffixes?.length) bits.push(`suffixe(s) ${w.suffixes.map((x) => x.form).join('')}`);
  return bits.join(' ; ');
}

// ---- Claude ----
const SYSTEM = `Tu es traducteur-pédagogue du Coran pour un francophone qui apprend l'arabe coranique et lit la traduction de Muhammad Hamidullah.

Pour UN verset, on te donne chaque mot numéroté avec sa morphologie (déjà établie, fiable, ne la contredis pas), la traduction Hamidullah de ce verset, et celle des versets voisins pour le fil du sens. Pour CHAQUE mot, renvoie :

- p : la position du mot (inchangée).
- g : la traduction française de CE mot DANS CE VERSET, 1 à 6 mots, la plus adaptée à ce contexte précis.
  • ALIGNEMENT : quand Hamidullah rend ce mot, reprends SA formulation (même verbe, même nom, même registre), ramenée au mot seul. Quand il paraphrase, déplace ou omet le mot, donne le sens concret le plus naturel qui s'insère dans SA phrase — pas un sens de dictionnaire hors contexte.
  • PÉRIMÈTRE : le mot tel qu'il est affiché (« mot » ci-dessous), c'est-à-dire SANS les particules de tête signalées hors périmètre (و, ف, بِ, كَ, لِ, سَ, أ, لَ) mais AVEC l'article et les pronoms suffixes (رزقناهم → « Nous les avons pourvus » ; بِٱلْغَيْبِ affiché ٱلْغَيْبِ → « l'invisible »).
  • Garde la personne, le temps et le nombre de la forme fléchie (يُؤْمِنُونَ → « ils croient », pas « croire » ; impératif → impératif).
  • Mots-outils (إنّ, مِن, فِي, لا, ما, الذين, ذلك…) : rends-les brièvement selon leur rôle ici (« certes », « de », « dans », « ne… pas », « ceux qui », « ceci »).
  • N'inclus JAMAIS le sens d'un autre mot du verset.
- h : la portion EXACTE de la traduction Hamidullah FOURNIE qui rend ce mot — copiée telle quelle (mêmes lettres, accents, apostrophes, majuscules), un ou quelques mots contigus. "" si le mot n'a aucun correspondant (omis, ou outil fondu dans la phrase). Jamais un mot voisin qui rend un AUTRE mot arabe.
- n : "" dans la grande majorité des cas. Seulement si le sens ici s'écarte nettement du sens usuel du lemme : UNE phrase très courte (ex. « ضرب : ici "citer (une parabole)", pas "frapper" »).

Couvre TOUTES les positions, dans l'ordre, sans en sauter. Réponds uniquement via le format structuré.`;

const SCHEMA = {
  type: 'object',
  properties: {
    words: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          p: { type: 'integer' },
          g: { type: 'string' },
          h: { type: 'string' },
          n: { type: 'string' },
        },
        required: ['p', 'g', 'h', 'n'],
        additionalProperties: false,
      },
    },
  },
  required: ['words'],
  additionalProperties: false,
};

const client = new Anthropic({ apiKey: readKey() });

function neighbor(verseKey, delta) {
  const [s, v] = verseKey.split(':').map(Number);
  const k = `${s}:${v + delta}`;
  return hamidullah[k] ? `${k} : ${hamidullah[k]}` : null;
}

async function translateVerse(verseKey) {
  const words = verseWords(verseKey);
  if (!words.length) return null;
  const trad = hamidullah[verseKey] ?? '';
  const lines = words.map((w) => `[${w.position}] mot : ${stripLeadingParticles(w)}  (forme complète : ${w.form}) — ${describe(w)}`);
  const user = [
    `Verset ${verseKey}`,
    `Traduction Hamidullah : ${trad}`,
    neighbor(verseKey, -1) ? `Verset précédent (contexte) — ${neighbor(verseKey, -1)}` : null,
    neighbor(verseKey, +1) ? `Verset suivant (contexte) — ${neighbor(verseKey, +1)}` : null,
    '',
    'Mots :',
    ...lines,
  ].filter((x) => x !== null).join('\n');

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: user }],
      });
      if (msg.stop_reason === 'refusal') throw new Error('refusal');
      const block = msg.content.find((b) => b.type === 'text');
      if (!block) throw new Error('réponse vide');
      const parsed = JSON.parse(block.text);
      // Vérification : toutes les positions, h vraiment dans Hamidullah.
      const byPos = new Map(parsed.words.map((x) => [x.p, x]));
      const out = [];
      let missing = 0, badH = 0;
      for (const w of words) {
        const r = byPos.get(w.position);
        if (!r) { missing++; out.push({ p: w.position, g: '', h: '', n: '' }); continue; }
        let h = (r.h ?? '').trim();
        if (h && !trad.includes(h)) {
          const i = trad.toLowerCase().indexOf(h.toLowerCase());
          if (i >= 0) h = trad.slice(i, i + h.length); // recopie casse exacte
          else { badH++; h = ''; }
        }
        out.push({ p: w.position, g: (r.g ?? '').trim(), h, n: (r.n ?? '').trim() });
      }
      return { words: out, missing, badH, usage: msg.usage };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// ---- Pages → versets ----
const byPage = new Map();
for (const [vk, p] of Object.entries(versePage)) {
  if (!byPage.has(p)) byPage.set(p, []);
  byPage.get(p).push(vk);
}
for (const list of byPage.values()) list.sort((a, b) => {
  const [sa, va] = a.split(':').map(Number), [sb, vb] = b.split(':').map(Number);
  return sa - sb || va - vb;
});

let pages;
if (argVal('--pages')) pages = parseRange(argVal('--pages'));
else if (argVal('--surahs')) {
  const ss = new Set(parseRange(argVal('--surahs')));
  pages = [...new Set(Object.entries(versePage).filter(([vk]) => ss.has(Number(vk.split(':')[0]))).map(([, p]) => p))].sort((a, b) => a - b);
} else {
  console.error('Usage : --pages 1-5 | --surahs 1-5 [--force] [--concurrency 4]');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

async function runPool(tasks, n) {
  const results = new Array(tasks.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < tasks.length) {
      const k = i++;
      results[k] = await tasks[k]();
    }
  }));
  return results;
}

const t0 = Date.now();
let totalIn = 0, totalOut = 0, totalCacheRead = 0;
for (const page of pages) {
  const file = path.join(OUT_DIR, `page-${String(page).padStart(3, '0')}.json`);
  if (fs.existsSync(file) && !FORCE) { console.log(`page ${page} : déjà faite (--force pour refaire)`); continue; }
  const verses = byPage.get(page) ?? [];
  const results = await runPool(verses.map((vk) => async () => {
    try {
      const r = await translateVerse(vk);
      if (r?.usage) { totalIn += r.usage.input_tokens ?? 0; totalOut += r.usage.output_tokens ?? 0; totalCacheRead += r.usage.cache_read_input_tokens ?? 0; }
      console.log(`  ${vk} : ${r.words.length} mots${r.missing ? ` · ${r.missing} manquants` : ''}${r.badH ? ` · ${r.badH} ancres rejetées` : ''}`);
      return [vk, r.words];
    } catch (e) {
      console.error(`  ${vk} : ÉCHEC ${e.message}`);
      return [vk, null];
    }
  }), CONCURRENCY);
  const data = {};
  for (const [vk, words] of results) if (words) data[vk] = words;
  fs.writeFileSync(file, JSON.stringify(data));
  console.log(`page ${page} : ${Object.keys(data).length}/${verses.length} versets → ${path.relative(ROOT, file)}`);
}
const secs = ((Date.now() - t0) / 1000).toFixed(0);
// Tarifs Opus 5.5 : $4/M entrée, $20/M sortie, cache lu $0.20/M (ordre de grandeur).
const cost = (totalIn * 4 + totalOut * 20 + totalCacheRead * 0.2) / 1e6;
console.log(`Terminé en ${secs}s — tokens entrée ${totalIn} (cache lu ${totalCacheRead}), sortie ${totalOut} ≈ $${cost.toFixed(2)}`);
