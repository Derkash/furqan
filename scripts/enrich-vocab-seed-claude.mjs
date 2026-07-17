// Enrichit public/vocab-seed.json avec l'analyse Claude, EN RESPECTANT la nature
// morphologique déterministe (pos QAC) : les VERBES reçoivent māḍī+muḍāriʿ (Forme I
// par défaut si elle existe), les NOMS/adjectifs reçoivent leur singulier indéfini —
// jamais de nom transformé en verbe. La traduction française de l'utilisateur est
// conservée ; on ne (ré)écrit que baseForm et baseFormType. Clé lue depuis .env.local.
//
//   node scripts/enrich-vocab-seed-claude.mjs
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = process.cwd();
const MORPH = path.join(ROOT, 'public', 'morphology');
const SEED = path.join(ROOT, 'public', 'vocab-seed.json');
const MODEL = 'claude-haiku-4-5';
const CONCURRENCY = 6;

function readKey() {
  const line = (fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith('ANTHROPIC_API_KEY=')) || '');
  return line.slice('ANTHROPIC_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
}

// bare/mnorm identiques à build-vocab-seed.js (pour retrouver la nature exacte).
function bare(s) {
  return s.normalize('NFKC').replace(/[ً-ْٰـۖ-ࣰۭ-ࣿ]/g, '').replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/\s+/g, '');
}
function mnorm(s) {
  return s.normalize('NFKC').replace(/[ًٌٍ]/g, '').replace(/[ٰـ]/g, '').replace(/[إأآٱ]/g, 'ا').replace(/[ؤئ]/g, 'ء').replace(/ى/g, 'ي').replace(/\s+/g, '');
}

// Index bare-form → lectures (mnorm, pos, verbForm, count) pour déterminer la nature.
function buildIndex() {
  const formInfo = new Map();
  for (let s = 1; s <= 114; s++) {
    const f = path.join(MORPH, 'words', `surah-${s}.json`);
    if (!fs.existsSync(f)) continue;
    const words = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const key of Object.keys(words)) {
      const m = words[key];
      if (!m.root || !m.form) continue;
      const b = bare(m.form);
      if (!b) continue;
      const mn = mnorm(m.form);
      const sig = `${mn}|${m.pos || ''}|${m.verbForm || ''}`;
      if (!formInfo.has(b)) formInfo.set(b, new Map());
      const im = formInfo.get(b);
      const cur = im.get(sig) || { mnorm: mn, pos: m.pos, verbForm: m.verbForm, count: 0 };
      cur.count++;
      im.set(sig, cur);
    }
  }
  return formInfo;
}

const POS_LABEL = { V: 'verbe', N: 'nom', PN: 'nom propre', ADJ: 'adjectif' };

const SYSTEM = `Tu es un professeur d'arabe coranique. On te donne un mot arabe vocalisé (du Coran), sa racine, son lemme, sa NATURE morphologique (fiable, ne la contredis pas) et la traduction française retenue par l'utilisateur. Renvoie en JSON :
- baseForm : la forme de base à mémoriser, VOCALISÉE.
  • NATURE = verbe : PAR DÉFAUT le verbe de la RACINE à la FORME I, māḍī puis muḍāriʿ 3e p. m. sing. (patron فَعَلَ يَفْعُلُ) SI cette forme I existe réellement (ex. اِسْتَغْفَرَ→«غَفَرَ يَغْفِرُ»). Sinon la forme dérivée réellement employée (ex. تَرَبَّصَ يَتَرَبَّصُ, اِسْتَطَاعَ يَسْتَطِيعُ). NE FABRIQUE JAMAIS une forme I inexistante. Bonne voyelle du muḍāriʿ.
  • NATURE = nom / nom propre / adjectif : le SINGULIER INDÉFINI vocalisé. NE TRANSFORME JAMAIS un nom en verbe.
  • NATURE inconnue : la forme de citation la plus naturelle, SANS forcer en verbe.
- baseFormType : "verbe" | "nom" | "adjectif" | "maṣdar" | "particule" | "autre", cohérent avec la nature.
Reste fidèle à la traduction fournie. Réponds uniquement via le format structuré.`;

const SCHEMA = {
  type: 'object',
  properties: {
    baseForm: { type: 'string' },
    baseFormType: { type: 'string', enum: ['verbe', 'nom', 'adjectif', 'maṣdar', 'particule', 'autre'] },
  },
  required: ['baseForm', 'baseFormType'],
  additionalProperties: false,
};

const client = new Anthropic({ apiKey: readKey() });

async function analyze(word, nat) {
  const facts = [
    `Mot : ${word.arabic}`,
    word.root ? `Racine : ${word.root}` : null,
    word.lemma ? `Lemme : ${word.lemma}` : null,
    `Nature : ${nat.label}${nat.verbForm ? ` (forme ${nat.verbForm})` : ''}`,
    word.french ? `Traduction retenue : ${word.french}` : null,
  ].filter(Boolean).join('\n');
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: facts }],
  });
  const block = msg.content.find((b) => b.type === 'text');
  return block && block.type === 'text' ? JSON.parse(block.text) : null;
}

// Lecture verbale EXACTE du mot dans le corpus (mnorm) → { isVerb, verbForm }.
function verbReading(word, formInfo) {
  const im = formInfo.get(bare(word.arabic));
  if (!im) return { isVerb: false, verbForm: null };
  const sform = mnorm(word.arabic);
  let chosen = null;
  for (const r of im.values()) if (r.mnorm === sform && (!chosen || r.count > chosen.count)) chosen = r;
  if (!chosen || chosen.pos !== 'V') return { isVerb: false, verbForm: null };
  return { isVerb: true, verbForm: chosen.verbForm };
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  const formInfo = buildIndex();
  let done = 0, verbs = 0, nouns = 0;
  const queue = [...seed.keys()];
  async function worker() {
    while (queue.length) {
      const i = queue.shift();
      const w = seed[i];
      // Verbe = déjà classé verbe par le builder (baseForm présent) OU lecture
      // verbale exacte dans le corpus. Sinon : nom/adjectif — JAMAIS forcé en verbe.
      const vr = verbReading(w, formInfo);
      const isVerb = !!w.baseForm || vr.isVerb;
      const nat = isVerb
        ? { label: 'verbe', verbForm: vr.verbForm }
        : { label: 'nom ou adjectif (jamais un verbe)', verbForm: null };
      if (isVerb) verbs++; else nouns++;
      try {
        const r = await analyze(w, nat);
        if (r?.baseForm) {
          w.baseForm = r.baseForm;
          w.baseFormType = r.baseFormType;
        }
      } catch (e) {
        console.error(`  ⚠️ ${w.arabic}:`, (e.message || '').slice(0, 100));
      }
      done++;
      if (done % 20 === 0) console.log(`  ${done}/${seed.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  fs.writeFileSync(SEED, JSON.stringify(seed, null, 0));
  console.log(`Terminé : ${seed.length} mots (${verbs} verbes, ${nouns} noms/adj., reste indéterminé).`);
}

main();
