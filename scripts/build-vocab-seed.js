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

  // Index bare-form -> meilleure info {root, lemma, pos} (par fréquence).
  const formInfo = new Map(); // bareForm -> Map(sig -> {root,lemma,pos,count})
  for (let s = 1; s <= 114; s++) {
    const f = path.join(MORPH, 'words', `surah-${s}.json`);
    if (!fs.existsSync(f)) continue;
    const words = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const key of Object.keys(words)) {
      const m = words[key];
      if (!m.root || !m.form) continue;
      const b = bare(m.form);
      if (!b) continue;
      const sig = `${m.root}|${m.pos || ''}|${m.verbForm || ''}`;
      if (!formInfo.has(b)) formInfo.set(b, new Map());
      const im = formInfo.get(b);
      const cur =
        im.get(sig) || { root: m.root, lemma: m.lemma, pos: m.pos, verbForm: m.verbForm, count: 0 };
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
      let best = null;
      for (const info of im.values()) if (!best || info.count > best.count) best = info;
      entry.root = best.root;
      if (best.lemma) entry.lemma = best.lemma;
      // Forme de base classique : VERBE → māḍī + muḍāriʿ (depuis racine|forme).
      // Repli : lemme normalisé (retire le marqueur féminin ـتْ du māḍī 3fs).
      if (best.pos === 'V') {
        const v = best.verbForm ? verbs[`${best.root}|${best.verbForm}`] : null;
        const parts = [v?.madi, v?.mudari3].filter(Boolean);
        if (parts.length) entry.baseForm = parts.join(' ');
        else if (best.lemma) entry.baseForm = normalizeVerbLemma(best.lemma);
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
