#!/usr/bin/env node
/**
 * Télécharge les 604 polices QCF V1 + 604 JSON de données (mots/lignes/versets).
 * Source polices : nuqayah/qpc-fonts (mushaf-woff2 = QCF V1 Hafs Madinah)
 * Source données : api.quran.com v4 (code_v1 + line_number par mot)
 *
 * Détecte aussi les lignes "manquantes" qui correspondent aux en-têtes de sourate
 * et à la basmala (cas des pages de transition entre deux sourates, ou début de sourate).
 *
 * Usage:
 *   node scripts/generate-qcf-data.js              # toutes les pages (1-604)
 *   node scripts/generate-qcf-data.js 80 100       # plage de pages
 *   node scripts/generate-qcf-data.js --force      # réécrase les fichiers existants
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FONT_DIR = path.join(ROOT, 'public', 'fonts', 'qcf-v2');
const DATA_DIR = path.join(ROOT, 'public', 'qcf-data');
const CHAPTERS_FILE = path.join(DATA_DIR, 'chapters.json');

const FONT_URL = (page) =>
  `https://raw.githubusercontent.com/nuqayah/qpc-fonts/master/mushaf-woff2/QCF_P${String(page).padStart(3, '0')}.woff2`;
const API_URL = (page) =>
  `https://api.quran.com/api/v4/verses/by_page/${page}?words=true&word_fields=code_v1,line_number,page_number,position,char_type_name&per_page=50`;

const CONCURRENCY = 6;
const RETRY_MAX = 3;
const RETRY_DELAY_MS = 1500;

const args = process.argv.slice(2);
const force = args.includes('--force');
const numeric = args.filter((a) => /^\d+$/.test(a)).map(Number);
const [START, END] = numeric.length === 2 ? numeric : [1, 604];

fs.mkdirSync(FONT_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(CHAPTERS_FILE)) {
  console.error(`Missing ${CHAPTERS_FILE}. Run the chapter fetch first.`);
  process.exit(1);
}
const CHAPTERS = JSON.parse(fs.readFileSync(CHAPTERS_FILE, 'utf-8'));
const chapterById = new Map(CHAPTERS.map((c) => [c.id, c]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBinary(url, attempt = 1) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (attempt < RETRY_MAX) {
      await sleep(RETRY_DELAY_MS * attempt);
      return fetchBinary(url, attempt + 1);
    }
    throw err;
  }
}

async function fetchJson(url, attempt = 1) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt < RETRY_MAX) {
      await sleep(RETRY_DELAY_MS * attempt);
      return fetchJson(url, attempt + 1);
    }
    throw err;
  }
}

/**
 * Transforme la réponse API en structure de page avec lignes typées.
 *
 * Convention Mushaf Medina (V1) :
 *   - L'ANNONCE de la prochaine sourate est en fin de page de la sourate précédente
 *   - La BASMALA seule est en haut de la page de début de la nouvelle sourate
 *   - Cas spéciaux :
 *     * Page 1 (Fatiha) : annonce seule (la basmala est le verset 1:1)
 *     * Sourate 9 (At-Tawbah) : annonce seule, pas de basmala
 *     * Page de transition mid-page : annonce + basmala
 *
 * Types de lignes :
 *   - 'content'      : ligne de versets normale
 *   - 'announcement' : cartouche "سُورَةُ X" annonçant une sourate
 *   - 'basmala'      : cartouche avec la basmala
 *   - 'empty'        : ligne vide (sourate courte en fin de page)
 */
function transformToPageData(page, apiResponse) {
  // Regroupe les mots par ligne
  const linesMap = {};
  const verseKeys = [];
  for (const verse of apiResponse.verses) {
    if (!verseKeys.includes(verse.verse_key)) verseKeys.push(verse.verse_key);
    for (const w of verse.words) {
      const ln = w.line_number;
      if (!linesMap[ln]) linesMap[ln] = [];
      linesMap[ln].push({
        verseKey: verse.verse_key,
        code: w.code_v1,
        position: w.position,
        isAyahMarker: w.char_type_name === 'end',
      });
    }
  }

  // Construit les 15 lignes initiales (content ou empty)
  const allLines = [];
  for (let lineNum = 1; lineNum <= 15; lineNum++) {
    if (linesMap[lineNum]) {
      allLines.push({ line: lineNum, type: 'content', words: linesMap[lineNum] });
    } else {
      allLines.push({ line: lineNum, type: 'empty' });
    }
  }

  // Helper : surah(s) d'une ligne content
  const surahsOfLine = (line) =>
    line.type === 'content' ? [...new Set(line.words.map((w) => +w.verseKey.split(':')[0]))] : [];

  // Trouve les "blocs vides" (séquences consécutives de lignes empty)
  const blocks = [];
  let blockStart = -1;
  for (let i = 0; i < allLines.length; i++) {
    if (allLines[i].type === 'empty') {
      if (blockStart === -1) blockStart = i;
    } else if (blockStart !== -1) {
      blocks.push({ start: blockStart, end: i - 1 });
      blockStart = -1;
    }
  }
  if (blockStart !== -1) blocks.push({ start: blockStart, end: allLines.length - 1 });

  // Pour chaque bloc vide, déterminer s'il s'agit d'annonce, basmala, ou trailing empty
  for (const block of blocks) {
    const size = block.end - block.start + 1;
    const prevContent = block.start > 0 ? allLines[block.start - 1] : null;
    const nextContent = block.end < allLines.length - 1 ? allLines[block.end + 1] : null;

    // Surah qui se termine juste avant le bloc
    const prevSurah = prevContent?.type === 'content' ? surahsOfLine(prevContent).slice(-1)[0] : null;
    // Surah qui commence juste après le bloc (et verset 1)
    let nextSurah = null;
    if (nextContent?.type === 'content') {
      // La toute première sourate sur cette ligne est-elle son verset 1 ?
      const firstWord = nextContent.words[0];
      if (firstWord && firstWord.verseKey.endsWith(':1')) {
        nextSurah = +firstWord.verseKey.split(':')[0];
      }
    }

    // BLOC AU DÉBUT DE PAGE (pas de prevContent)
    if (!prevContent) {
      // Le bloc est en haut de page, avant la 1ère ligne content
      const startingSurah = nextContent?.type === 'content' ? surahsOfLine(nextContent)[0] : null;
      const startsWithVerse1 =
        nextContent?.type === 'content' && nextContent.words[0]?.verseKey.endsWith(':1');

      if (!startingSurah || !startsWithVerse1) continue; // bloc isolé sans sourate qui commence
      const surah = chapterById.get(startingSurah);
      if (!surah) continue;

      if (size === 1) {
        // 1 ligne : soit annonce (page 1 Fatiha, ou la précédente page n'avait pas de place),
        // soit basmala (cas commun pour les sourates après la 1ère)
        // Heuristique : si Fatiha (surah 1) → annonce, sinon basmala
        if (startingSurah === 1) {
          allLines[block.start] = {
            line: allLines[block.start].line,
            type: 'announcement',
            surah: startingSurah,
            nameArabic: surah.name_arabic,
          };
        } else {
          // Basmala seule (annonce était sur page précédente)
          // Sauf si sourate sans basmala (At-Tawbah) → annonce
          if (surah.bismillah_pre) {
            allLines[block.start] = { line: allLines[block.start].line, type: 'basmala' };
          } else {
            allLines[block.start] = {
              line: allLines[block.start].line,
              type: 'announcement',
              surah: startingSurah,
              nameArabic: surah.name_arabic,
            };
          }
        }
      } else if (size >= 2) {
        // 2+ lignes : annonce + basmala
        allLines[block.start] = {
          line: allLines[block.start].line,
          type: 'announcement',
          surah: startingSurah,
          nameArabic: surah.name_arabic,
        };
        if (surah.bismillah_pre) {
          allLines[block.start + 1] = { line: allLines[block.start + 1].line, type: 'basmala' };
        }
      }
      continue;
    }

    // BLOC EN FIN DE PAGE (pas de nextContent)
    if (!nextContent) {
      // Si la sourate précédente vient de finir sur cette page, on annonce la suivante
      const lastVerseKey = prevContent.words[prevContent.words.length - 1]?.verseKey;
      const isMarker = prevContent.words[prevContent.words.length - 1]?.isAyahMarker;
      const totalVersesInSurah = (chapterById.get(prevSurah) || {}).verses_count;
      // Si on a un marker ET la dernière sourate vient de finir → annonce de la prochaine
      if (isMarker && lastVerseKey && totalVersesInSurah) {
        const lastVerseNum = +lastVerseKey.split(':')[1];
        if (lastVerseNum === totalVersesInSurah && prevSurah < 114) {
          const next = chapterById.get(prevSurah + 1);
          if (next) {
            allLines[block.start] = {
              line: allLines[block.start].line,
              type: 'announcement',
              surah: prevSurah + 1,
              nameArabic: next.name_arabic,
            };
          }
        }
      }
      continue;
    }

    // BLOC EN MILIEU DE PAGE (transition de sourate)
    if (prevSurah && nextSurah && prevSurah !== nextSurah) {
      const surah = chapterById.get(nextSurah);
      if (!surah) continue;

      if (size === 1) {
        // 1 ligne : c'est une annonce (la basmala est généralement séparée)
        allLines[block.start] = {
          line: allLines[block.start].line,
          type: 'announcement',
          surah: nextSurah,
          nameArabic: surah.name_arabic,
        };
      } else if (size >= 2) {
        allLines[block.start] = {
          line: allLines[block.start].line,
          type: 'announcement',
          surah: nextSurah,
          nameArabic: surah.name_arabic,
        };
        if (surah.bismillah_pre) {
          allLines[block.start + 1] = { line: allLines[block.start + 1].line, type: 'basmala' };
        }
      }
    }
  }

  return {
    page,
    font: `QCF_P${String(page).padStart(3, '0')}`,
    verses: verseKeys,
    lines: allLines,
  };
}

async function processPage(page) {
  const padded = String(page).padStart(3, '0');
  const fontPath = path.join(FONT_DIR, `QCF_P${padded}.woff2`);
  const dataPath = path.join(DATA_DIR, `page-${padded}.json`);

  const tasks = [];

  if (force || !fs.existsSync(fontPath)) {
    tasks.push(
      (async () => {
        const buf = await fetchBinary(FONT_URL(page));
        fs.writeFileSync(fontPath, buf);
      })()
    );
  }

  if (force || !fs.existsSync(dataPath)) {
    tasks.push(
      (async () => {
        const api = await fetchJson(API_URL(page));
        const pageData = transformToPageData(page, api);
        fs.writeFileSync(dataPath, JSON.stringify(pageData));
      })()
    );
  }

  if (tasks.length === 0) return { page, skipped: true };
  await Promise.all(tasks);
  return { page, skipped: false };
}

async function run() {
  const pages = [];
  for (let p = START; p <= END; p++) pages.push(p);

  console.log(`[QCF] Génération pages ${START}→${END} (concurrence ${CONCURRENCY})`);
  const t0 = Date.now();
  let done = 0;
  let skipped = 0;
  const errors = [];

  const queue = pages.slice();
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const page = queue.shift();
      try {
        const res = await processPage(page);
        if (res.skipped) skipped++;
        done++;
        if (done % 50 === 0 || done === pages.length) {
          const pct = ((done / pages.length) * 100).toFixed(1);
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          console.log(`  ${done}/${pages.length} (${pct}%) — ${elapsed}s — skipped ${skipped} — errors ${errors.length}`);
        }
      } catch (err) {
        errors.push({ page, message: err.message });
        console.warn(`  ✗ page ${page}: ${err.message}`);
      }
    }
  });

  await Promise.all(workers);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[QCF] Terminé en ${elapsed}s — ${done}/${pages.length} OK, ${skipped} skipped, ${errors.length} errors`);
  if (errors.length) {
    console.log('Pages en erreur :', errors.map((e) => e.page).join(', '));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[QCF] Échec fatal :', err);
  process.exit(1);
});
