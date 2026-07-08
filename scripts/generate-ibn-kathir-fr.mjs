// Génère public/ibn-kathir-fr/{surah}/{ayah}.json : tafsir Ibn Kathir (abrégé)
// traduit EN→FR (Bing) — Option A pour les sourates 1-7 et le Juz 'Amma (78-114).
// Ibn Kathir commente par GROUPES de versets : le texte est stocké une fois
// (fichier du 1er verset du groupe), les autres versets pointent dessus ({ref}).
// Résumable : les fichiers déjà écrits sont sautés.
//
// Usage : node scripts/generate-ibn-kathir-fr.mjs

import fs from 'node:fs';
import path from 'node:path';
import { translate as bingTranslate } from 'bing-translate-api';

// Sourates cibles : par défaut 1-7 + Juz 'Amma ; surchargable via SURAHS=2,3 ou SURAHS=4-5
function parseSurahs(spec) {
  return spec.split(',').flatMap((part) => {
    const [a, b] = part.split('-').map(Number);
    return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a];
  });
}
const SURAHS = process.env.SURAHS
  ? parseSurahs(process.env.SURAHS)
  : [1, 2, 3, 4, 5, 6, 7, ...Array.from({ length: 37 }, (_, i) => 78 + i)];

const SOURCE_URL = (ayah) =>
  `https://api.qurancdn.com/api/qdc/tafsirs/en-tafisr-ibn-kathir/by_ayah/${ayah}`;
const OUT_DIR = path.join(process.cwd(), 'public', 'ibn-kathir-fr');
const CHUNK_MAX = 900;

const chapters = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'public', 'qcf-data', 'chapters.json'), 'utf8')
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function htmlToText(html) {
  return html
    .replace(/<\/(h1|h2|h3|p|div)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function chunkText(text) {
  const segments = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    if (paragraph.length <= CHUNK_MAX) {
      segments.push(paragraph);
    } else {
      let buf = '';
      for (const sentence of paragraph.split(/(?<=[.!?؟:])\s+/)) {
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

async function translateToFrench(text) {
  const out = [];
  for (const chunk of chunkText(text)) {
    let translated = '';
    for (let attempt = 0; attempt < 6 && !translated; attempt++) {
      try {
        const res = await bingTranslate(chunk, 'en', 'fr');
        translated = res?.translation ?? '';
        if (!translated) throw new Error('réponse vide');
      } catch (e) {
        console.error(`  retry (${e.message})`);
        await sleep(4000 * (attempt + 1));
      }
    }
    if (!translated) throw new Error('traduction impossible');
    out.push(translated);
    await sleep(250);
  }
  return out.join('\n\n');
}

function outPath(surah, ayah) {
  return path.join(OUT_DIR, String(surah), `${ayah}.json`);
}

function writeJson(surah, ayah, data) {
  fs.mkdirSync(path.join(OUT_DIR, String(surah)), { recursive: true });
  fs.writeFileSync(outPath(surah, ayah), JSON.stringify(data), 'utf8');
}

async function fetchGroup(verseKey) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(SOURCE_URL(verseKey), {
        headers: { 'User-Agent': 'almuraja3a.com (generation locale)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error(`  fetch retry (${e.message})`);
      await sleep(3000 * (attempt + 1));
    }
  }
  throw new Error(`source injoignable pour ${verseKey}`);
}

async function main() {
  let done = 0;
  for (const surah of SURAHS) {
    const versesCount = chapters.find((c) => c.id === surah)?.verses_count;
    if (!versesCount) continue;
    console.log(`\n=== Sourate ${surah} (${versesCount} versets) ===`);

    let ayah = 1;
    while (ayah <= versesCount) {
      if (fs.existsSync(outPath(surah, ayah))) {
        ayah++;
        continue; // déjà généré (reprise)
      }
      const verseKey = `${surah}:${ayah}`;
      const data = await fetchGroup(verseKey);
      const english = htmlToText(data?.tafsir?.text ?? '');
      const groupVerses = Object.keys(data?.tafsir?.verses ?? {});
      const group =
        groupVerses.length > 0
          ? groupVerses
              .map((k) => Number(k.split(':')[1]))
              .filter((n) => Number.isFinite(n))
              .sort((a, b) => a - b)
          : [ayah];

      const first = group[0];
      if (english) {
        writeJson(surah, first, {
          verses: group.map((n) => `${surah}:${n}`),
          text: await translateToFrench(english),
        });
      } else {
        writeJson(surah, first, { verses: [`${surah}:${first}`], text: null });
      }
      for (const n of group) {
        if (n !== first && n <= versesCount) {
          writeJson(surah, n, { ref: `${surah}/${first}` });
        }
      }
      // Certains versets n'ont PAS d'entrée propre : l'API renvoie le groupe
      // PRÉCÉDENT sans les inclure (ex. 20:32 → groupe 20:22-31). On les fait
      // pointer sur ce groupe, sinon leur fichier ne serait jamais écrit.
      if (!group.includes(ayah)) {
        writeJson(surah, ayah, { ref: `${surah}/${first}` });
      }
      done++;
      if (done % 10 === 0) console.log(`  … ${verseKey} ok (${done} groupes)`);
      ayah = Math.max(...group, ayah) + 1;
    }
    console.log(`Sourate ${surah} terminée.`);
  }
  console.log(`\nOK : ${done} groupes générés dans ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
