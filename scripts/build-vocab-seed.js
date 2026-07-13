#!/usr/bin/env node
/**
 * Construit public/vocab-seed.json : le lexique personnel (ARAB_VOCAB.pdf)
 * nettoyé et enrichi de la racine QAC quand la forme se retrouve dans le Coran.
 *
 * Entrée : un JSON [{n, arabic, french}] extrait du PDF (voir scratchpad).
 * Usage  : node scripts/build-vocab-seed.js <seed_words.json>
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MORPH = path.join(ROOT, 'public', 'morphology');

// Retire harakat, shadda, tanwin, sukun, superscript alef, tatweel ; normalise
// les hamza/alef pour comparer les formes « nues ».
function bare(s) {
  return s
    .normalize('NFKC')
    .replace(/[ً-ْٰـۖ-ࣰۭ-ࣿ]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, '');
}

// Nettoie l'arabe affiché : supprime les espaces parasites avant une marque
// combinatoire (issus de l'extraction PDF), et normalise.
function cleanArabic(s) {
  return s
    .normalize('NFKC')
    .replace(/\s+([ً-ْٰـ])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function main() {
  const srcArg = process.argv[2];
  if (!srcArg || !fs.existsSync(srcArg)) {
    console.error('Fournir le JSON extrait : node scripts/build-vocab-seed.js <seed_words.json>');
    process.exit(1);
  }
  const seed = JSON.parse(fs.readFileSync(srcArg, 'utf8'));

  // Index bare-form -> {root, count} depuis les fichiers de mots QAC.
  const formRoots = new Map(); // bareForm -> Map(root -> count)
  for (let s = 1; s <= 114; s++) {
    const f = path.join(MORPH, 'words', `surah-${s}.json`);
    if (!fs.existsSync(f)) continue;
    const words = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const key of Object.keys(words)) {
      const m = words[key];
      if (!m.root || !m.form) continue;
      const b = bare(m.form);
      if (!b) continue;
      if (!formRoots.has(b)) formRoots.set(b, new Map());
      const rm = formRoots.get(b);
      rm.set(m.root, (rm.get(m.root) || 0) + 1);
    }
  }

  let matched = 0;
  const out = seed.map((row) => {
    const arabic = cleanArabic(row.arabic);
    const entry = { n: row.n, arabic, french: (row.french || '').trim() };
    const b = bare(arabic);
    const rm = formRoots.get(b);
    if (rm && rm.size > 0) {
      // racine la plus fréquente pour cette forme
      let best = null;
      let bestC = -1;
      for (const [r, c] of rm) {
        if (c > bestC) {
          bestC = c;
          best = r;
        }
      }
      entry.root = best;
      matched++;
    }
    return entry;
  });

  fs.writeFileSync(
    path.join(ROOT, 'public', 'vocab-seed.json'),
    JSON.stringify(out, null, 0)
  );
  console.log(`Seed : ${out.length} mots, ${matched} racines rattachées (QAC).`);
}

main();
