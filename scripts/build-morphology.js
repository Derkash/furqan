#!/usr/bin/env node
/**
 * Génère les données morphologiques du vocabulaire à partir du Quranic Arabic
 * Corpus (QAC). Source : quran-morphology.txt (segments annotés : racine, lemme,
 * temps, mode, personne/genre/nombre, préfixes, suffixes).
 *
 * Alignement avec les pages QCF : le numéro de MOT (s:v:w) du corpus correspond
 * au `position` (hors marqueur de fin de verset) des fichiers public/qcf-data.
 *
 * Sorties (public/morphology/) :
 *   - words/surah-{n}.json : { "v:w": WordMorphology } pour chaque sourate
 *   - roots.json           : { racine: { lemmas:[...], count, occ:["s:v:w",...] } }
 *   - verse-page.json      : { "s:v": page }
 *
 * Usage : node scripts/build-morphology.js [chemin-vers-quran-morphology.txt]
 * Le fichier source par défaut est téléchargé si absent.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'morphology');
const QCF_DIR = path.join(ROOT, 'public', 'qcf-data');
const SRC_URL =
  'https://raw.githubusercontent.com/mustafa0x/quran-morphology/master/quran-morphology.txt';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      })
      .on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
  });
}

// ---- Parsing des features QAC ----

/** Découpe les features "PERF|VF:1|ROOT:رزق|LEM:رَزَقَ|1P" en objet. */
function parseFeatures(tag, featStr) {
  const parts = featStr.split('|');
  const f = { pos: tag, flags: [] };
  for (const p of parts) {
    if (p.includes(':')) {
      const idx = p.indexOf(':');
      const key = p.slice(0, idx);
      const val = p.slice(idx + 1);
      f[key] = val;
    } else {
      f.flags.push(p);
    }
  }
  return f;
}

const PGN_RE = /^([123])?([MF])?([SDP])$/; // ex: 3MP, 2MS, 1P, MS, P

/** Extrait personne/genre/nombre depuis un flag type "3MP". */
function parsePGN(flags) {
  for (const fl of flags) {
    const m = fl.match(PGN_RE);
    if (m && (m[1] || m[2] || m[3])) {
      return { person: m[1] || null, gender: m[2] || null, number: m[3] || null };
    }
  }
  return null;
}

/** Type de préfixe lisible depuis les flags d'un segment PREF. */
function prefixType(flags) {
  if (flags.includes('CONJ')) return 'conj'; // و / ف (coordination)
  if (flags.includes('REM')) return 'rem'; // ف de reprise (استئناف)
  if (flags.includes('DET')) return 'det'; // ال (article défini)
  if (flags.includes('P')) return 'prep'; // بِ كِ لِ (préposition)
  if (flags.includes('FUT')) return 'fut'; // سَ (futur)
  if (flags.includes('EMPH')) return 'emph'; // لَ (emphase)
  if (flags.includes('INTG')) return 'intg'; // أَ (interrogation)
  if (flags.includes('NEG')) return 'neg';
  return 'other';
}

function main() {
  const srcArg = process.argv[2];
  const src = srcArg || path.join(OUT_DIR, '.quran-morphology.txt');

  const run = async () => {
    if (!fs.existsSync(src)) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      console.log('Téléchargement du corpus morphologique QAC…');
      await download(SRC_URL, src);
    }
    build(src);
  };
  run().catch((e) => {
    console.error('Échec :', e.message);
    process.exit(1);
  });
}

function build(src) {
  console.log('Lecture du corpus :', src);
  const lines = fs.readFileSync(src, 'utf8').split('\n');

  // 1) Regrouper les segments par mot (s:v:w)
  /** @type {Map<string, Array<{seg:number, form:string, tag:string, feat:object}>>} */
  const wordSegments = new Map();

  for (const line of lines) {
    if (!line.trim() || line.startsWith('#')) continue;
    const cols = line.split('\t');
    if (cols.length < 4) continue;
    const [loc, form, tag, featStr] = cols;
    const locParts = loc.split(':');
    if (locParts.length !== 4) continue;
    const [s, v, w, seg] = locParts.map(Number);
    const key = `${s}:${v}:${w}`;
    if (!wordSegments.has(key)) wordSegments.set(key, []);
    wordSegments.get(key).push({
      seg,
      form,
      tag,
      feat: parseFeatures(tag, featStr || ''),
    });
  }

  // 2) Construire la morphologie par mot + l'index des racines
  const bySurah = new Map(); // surah -> { "v:w": WordMorphology }
  const roots = new Map(); // racine -> { lemmas:Set, occ:[] }

  for (const [key, segsRaw] of wordSegments) {
    const segs = segsRaw.sort((a, b) => a.seg - b.seg);
    const [s, v, w] = key.split(':').map(Number);

    // Forme complète = concaténation des segments
    const form = segs.map((x) => x.form).join('');

    // Segment "stem" : celui qui porte la racine, sinon le 1er non-préfixe
    let stem = segs.find((x) => x.feat.ROOT);
    if (!stem) stem = segs.find((x) => !x.feat.flags.includes('PREF'));
    if (!stem) stem = segs[segs.length - 1];

    const prefixes = segs
      .filter((x) => x.feat.flags.includes('PREF'))
      .map((x) => ({ form: x.form, type: prefixType(x.feat.flags) }));

    // Suffixes pronominaux (segments après le stem portant un pronom)
    const stemIdx = segs.indexOf(stem);
    const suffixes = segs
      .slice(stemIdx + 1)
      .filter((x) => x.feat.flags.includes('PRON') || x.tag === 'PRON')
      .map((x) => ({ form: x.form }));

    const sf = stem.feat;
    const pgn = parsePGN(sf.flags);

    // Aspect verbal
    let aspect = null;
    if (sf.flags.includes('PERF')) aspect = 'perf';
    else if (sf.flags.includes('IMPF')) aspect = 'impf';
    else if (sf.flags.includes('IMPV')) aspect = 'impv';

    let mood = null;
    if (sf.MOOD === 'SUBJ') mood = 'subj';
    else if (sf.MOOD === 'JUS') mood = 'jus';
    else if (sf.MOOD === 'IND') mood = 'ind';

    // Voix (passif) et type de dérivé nominal (participes, maṣdar)
    const voice = sf.flags.includes('PASS') ? 'pass' : null;
    let deriv = null;
    if (sf.flags.includes('ACT_PCPL')) deriv = 'act_pcpl'; // اسم فاعل
    else if (sf.flags.includes('PASS_PCPL')) deriv = 'pass_pcpl'; // اسم مفعول
    else if (sf.flags.includes('VN')) deriv = 'masdar'; // مصدر

    const entry = {
      form,
      pos: stem.tag, // V, N, PN, ADJ, PRON, P, ...
    };
    if (sf.ROOT) entry.root = sf.ROOT;
    if (sf.LEM) entry.lemma = sf.LEM;
    if (aspect) entry.aspect = aspect;
    if (voice) entry.voice = voice;
    if (deriv) entry.deriv = deriv;
    if (mood) entry.mood = mood;
    if (sf.VF) entry.verbForm = sf.VF; // wazn (1-10)
    if (pgn) entry.pgn = pgn;
    if (prefixes.length) entry.prefixes = prefixes;
    if (suffixes.length) entry.suffixes = suffixes;

    if (!bySurah.has(s)) bySurah.set(s, {});
    bySurah.get(s)[`${v}:${w}`] = entry;

    // Index racine (mots de contenu uniquement)
    if (sf.ROOT) {
      if (!roots.has(sf.ROOT)) roots.set(sf.ROOT, { lemmas: new Set(), occ: [] });
      const r = roots.get(sf.ROOT);
      if (sf.LEM) r.lemmas.add(sf.LEM);
      r.occ.push(key);
    }
  }

  // 3) verse -> page (depuis les fichiers de page QCF)
  const versePage = {};
  for (let p = 1; p <= 604; p++) {
    const padded = String(p).padStart(3, '0');
    const file = path.join(QCF_DIR, `page-${padded}.json`);
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const vk of data.verses || []) {
      if (versePage[vk] == null) versePage[vk] = p; // 1ère page listant le verset
    }
  }

  // 4) Écritures
  fs.mkdirSync(path.join(OUT_DIR, 'words'), { recursive: true });
  for (const [s, obj] of bySurah) {
    fs.writeFileSync(
      path.join(OUT_DIR, 'words', `surah-${s}.json`),
      JSON.stringify(obj)
    );
  }

  // 3bis) Table VERBE (clé = racine|forme) → { madi, mudari3 } de citation 3ᵐˢ.
  //   On dérive la citation depuis les occurrences 3e masc. sing. SANS suffixe
  //   et à préfixes retirables (و/ف/س…) — la forme obtenue est déjà فَعَلَ / يَفْعُلُ.
  //   On n'utilise PAS le champ « lemme » (non fiable dans ce corpus).
  const STRIPPABLE = new Set(['conj', 'rem', 'fut', 'emph', 'intg', 'neg']);
  const stripPrefixes = (form, prefixes) => {
    let f = form;
    for (const p of prefixes || []) if (f.startsWith(p.form)) f = f.slice(p.form.length);
    return f;
  };
  const perfCite = new Map(); // racine|vf -> { form, score }
  const impfCite = new Map();
  for (const [, obj] of bySurah) {
    for (const k of Object.keys(obj)) {
      const e = obj[k];
      if (
        e.pos !== 'V' ||
        !e.root ||
        !e.verbForm ||
        !e.pgn ||
        e.pgn.person !== '3' ||
        e.pgn.gender !== 'M' ||
        e.pgn.number !== 'S' ||
        e.suffixes ||
        e.voice === 'pass'
      ) {
        continue;
      }
      if (e.prefixes && !e.prefixes.every((p) => STRIPPABLE.has(p.type))) continue;
      const key = `${e.root}|${e.verbForm}`;
      const citation = stripPrefixes(e.form, e.prefixes);
      const score = (e.prefixes ? 2 : 0) + (e.mood === 'ind' || !e.mood ? 0 : 1);
      const map = e.aspect === 'perf' ? perfCite : e.aspect === 'impf' ? impfCite : null;
      if (!map) continue;
      const cur = map.get(key);
      if (!cur || score < cur.score) map.set(key, { form: citation, score });
    }
  }
  const verbs = {};
  const keys = new Set([...perfCite.keys(), ...impfCite.keys()]);
  for (const key of keys) {
    verbs[key] = {};
    if (perfCite.has(key)) verbs[key].madi = perfCite.get(key).form;
    if (impfCite.has(key)) verbs[key].mudari3 = impfCite.get(key).form;
  }
  fs.writeFileSync(path.join(OUT_DIR, 'verbs.json'), JSON.stringify(verbs));

  const rootsObj = {};
  for (const [r, data] of roots) {
    rootsObj[r] = {
      lemmas: Array.from(data.lemmas),
      count: data.occ.length,
      occ: data.occ,
    };
  }
  fs.writeFileSync(path.join(OUT_DIR, 'roots.json'), JSON.stringify(rootsObj));
  fs.writeFileSync(
    path.join(OUT_DIR, 'verse-page.json'),
    JSON.stringify(versePage)
  );

  console.log(
    `OK — ${wordSegments.size} mots, ${roots.size} racines, ${bySurah.size} sourates, ${Object.keys(verbs).length} verbes (racine|forme).`
  );
}

main();
