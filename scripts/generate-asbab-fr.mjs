// Génère public/asbab-fr.json : sabab an-nuzûl en français, par verset.
// Source : Sahih Asbab al-Nuzul (Ibrahim Muhammad al-Ali) — occasions
// authentifiées uniquement — repo mostafaahmed97/asbab-al-nuzul-dataset.
// Traduction AR→FR : endpoint public Google Translate (gtx), texte par texte.
//
// Usage : node scripts/generate-asbab-fr.mjs

import fs from 'node:fs';
import path from 'node:path';
import { translate as bingTranslate } from 'bing-translate-api';

const SOURCE_URL = (surah) =>
  `https://raw.githubusercontent.com/mostafaahmed97/asbab-al-nuzul-dataset/main/data/structured/json/${String(surah).padStart(3, '0')}.json`;

const OUT_PATH = path.join(process.cwd(), 'public', 'asbab-fr.json');
// Cache persistant des morceaux déjà traduits : le script est résumable
// (relance après un rate-limit sans tout retraduire).
const CACHE_PATH = path.join(process.cwd(), 'scripts', '.asbab-cache.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cache = fs.existsSync(CACHE_PATH)
  ? JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
  : {};
let cacheDirty = 0;
function saveCache() {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf8');
  cacheDirty = 0;
}

const CHUNK_MAX = 900;

/** Découpe un texte en morceaux ≤ CHUNK_MAX, aux paragraphes puis aux phrases. */
function chunkText(text) {
  const segments = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    if (paragraph.length <= CHUNK_MAX) {
      segments.push(paragraph);
    } else {
      // Paragraphe trop long : découpe aux fins de phrases arabes.
      let buf = '';
      for (const sentence of paragraph.split(/(?<=[.!؟?،:])\s+/)) {
        if (buf.length + sentence.length > CHUNK_MAX && buf) {
          segments.push(buf);
          buf = sentence;
        } else {
          buf = buf ? `${buf} ${sentence}` : sentence;
        }
      }
      if (buf) segments.push(buf);
    }
  }
  // Regroupe les petits segments pour limiter le nombre de requêtes.
  const chunks = [];
  let current = '';
  for (const seg of segments) {
    if (current.length + seg.length > CHUNK_MAX && current) {
      chunks.push(current);
      current = seg;
    } else {
      current = current ? `${current}\n\n${seg}` : seg;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Traduit un texte arabe en français via l'endpoint public gtx (POST, par morceaux).
 *  Résumable : les morceaux déjà traduits viennent du cache ; backoff long sur 429. */
async function translate(text) {
  const out = [];
  for (const chunk of chunkText(text)) {
    if (cache[chunk]) {
      out.push(cache[chunk]);
      continue;
    }
    let ok = false;
    for (let attempt = 0; attempt < 5 && !ok; attempt++) {
      try {
        const res = await bingTranslate(chunk, 'ar', 'fr');
        const translated = res?.translation ?? '';
        if (!translated) throw new Error('réponse vide');
        cache[chunk] = translated;
        if (++cacheDirty >= 10) saveCache();
        out.push(translated);
        ok = true;
      } catch (e) {
        console.error(`  retry (${e.message})`);
        await sleep(5000 * (attempt + 1));
      }
    }
    if (!ok) {
      saveCache();
      throw new Error('traduction impossible après 7 essais');
    }
    await sleep(300);
  }
  return out.join('\n\n');
}

async function main() {
  /** @type {Record<string, {fr: string, ar: string}[]>} verseKey → occasions (fr + arabe original) */
  const result = {};
  let totalOccasions = 0;

  for (let surah = 1; surah <= 114; surah++) {
    const res = await fetch(SOURCE_URL(surah));
    if (!res.ok) continue; // pas d'entrée pour cette sourate
    const entries = await res.json();
    console.log(`Sourate ${surah} : ${entries.length} entrées`);

    for (const entry of entries) {
      const occasions = [];
      for (const occasion of entry.occasions ?? []) {
        // Français (traduction IA) + arabe original conservé pour vérification.
        occasions.push({ fr: await translate(occasion), ar: occasion });
        totalOccasions++;
      }
      if (occasions.length === 0) continue;
      for (const ayah of entry.ayahs ?? []) {
        const key = `${entry.surah}:${ayah}`;
        result[key] = [...(result[key] ?? []), ...occasions];
      }
    }
  }

  saveCache();
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 0), 'utf8');
  const size = (fs.statSync(OUT_PATH).size / 1024).toFixed(0);
  console.log(
    `\nOK : ${Object.keys(result).length} versets couverts, ${totalOccasions} occasions traduites, ${size} Ko → ${OUT_PATH}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
