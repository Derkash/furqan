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
    .replace(/\s+/g, '');
}

// Normalisation « moyenne » : GARDE les voyelles brèves/sukūn/shadda (pour
// distinguer un nom d'un verbe homographe : بَرْق « éclair » ≠ بَرِقَ verbe),
// mais neutralise tanwin, alef superscrit, tatweel, sièges de hamza, alef/ya.
function mnorm(s) {
  return s
    .normalize('NFKC')
    .replace(/[ًٌٍ]/g, '')
    .replace(/[ٰـ]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/[ؤئ]/g, 'ء')
    .replace(/ى/g, 'ي')
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

// Le « lemme » du corpus est parfois le māḍī 3fs (نَقَضَتْ) : on retire le تْ final
// pour retrouver la citation 3ms (نَقَضَ).
function normalizeVerbLemma(lemma) {
  // Retire uniquement le ت (avec éventuel sukūn) du māḍī 3fs, en gardant la
  // voyelle précédente : نَقَضَتْ → نَقَضَ. Ne touche pas un māḍī déjà en 3ms.
  return lemma.replace(/تْ?$/, '').trim() || lemma;
}

function main() {
  const srcArg = process.argv[2];
  if (!srcArg || !fs.existsSync(srcArg)) {
    console.error('Fournir le JSON extrait : node scripts/build-vocab-seed.js <seed_words.json>');
    process.exit(1);
  }
  const seed = JSON.parse(fs.readFileSync(srcArg, 'utf8'));
  const verbs = JSON.parse(fs.readFileSync(path.join(MORPH, 'verbs.json'), 'utf8'));

  // Index bare-form -> lectures {mnorm, root, lemma, pos, verbForm, count}.
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
      const sig = `${mn}|${m.root}|${m.pos || ''}|${m.verbForm || ''}`;
      if (!formInfo.has(b)) formInfo.set(b, new Map());
      const im = formInfo.get(b);
      const cur =
        im.get(sig) ||
        { mnorm: mn, root: m.root, lemma: m.lemma, pos: m.pos, verbForm: m.verbForm, count: 0 };
      cur.count++;
      im.set(sig, cur);
    }
  }

  let matched = 0;
  const out = seed.map((row) => {
    const arabic = cleanArabic(row.arabic);
    const entry = { n: row.n, arabic, french: (row.french || '').trim() };
    const im = formInfo.get(bare(arabic));
    if (im && im.size > 0) {
      const readings = Array.from(im.values());
      // Racine : lecture la plus fréquente (toutes natures confondues).
      let byFreq = null;
      for (const r of readings) if (!byFreq || r.count > byFreq.count) byFreq = r;
      entry.root = byFreq.root;
      if (byFreq.lemma) entry.lemma = byFreq.lemma;

      // Nature EXACTE : on exige que la forme vocalisée du mot corresponde à une
      // lecture du corpus (mnorm). Sinon on NE FORCE PAS (homographe nom/verbe).
      const sform = mnorm(arabic);
      let chosen = null;
      for (const r of readings) {
        if (r.mnorm === sform && (!chosen || r.count > chosen.count)) chosen = r;
      }

      // māḍī + muḍāriʿ UNIQUEMENT si le mot est réellement un verbe.
      if (chosen && chosen.pos === 'V') {
        entry.root = chosen.root;
        if (chosen.lemma) entry.lemma = chosen.lemma;
        const v = chosen.verbForm ? verbs[`${chosen.root}|${chosen.verbForm}`] : null;
        const parts = [v?.madi, v?.mudari3].filter(Boolean);
        if (parts.length) entry.baseForm = parts.join(' ');
        else if (chosen.lemma) entry.baseForm = normalizeVerbLemma(chosen.lemma);
      }
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
