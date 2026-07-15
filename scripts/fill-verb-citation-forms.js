/**
 * Complète public/morphology/verbs.json : pour chaque entrée (racine|forme) où
 * le māḍī OU le muḍāriʿ manque, on génère la forme de citation manquante à
 * partir des radicaux et du wazn (patrons réguliers des formes dérivées).
 *
 * Sûr par construction : on ne génère QUE pour les racines SAINES (triliteral,
 * pas de lettre faible ء/ا/و/ي, 2e ≠ 3e radical) et les formes régulières
 * (II, III, IV, V, VI, VII, X). Les valeurs venant du corpus (qui gèrent les
 * racines faibles) ne sont JAMAIS écrasées. À relancer après build-morphology.js.
 *
 *   node scripts/fill-verb-citation-forms.js
 */
const fs = require('fs');
const path = require('path');

const FA = 'َ'; // fatḥa
const KA = 'ِ'; // kasra
const DA = 'ُ'; // ḍamma
const SU = 'ْ'; // sukūn
const SH = 'ّ'; // shadda
const ALEF = 'ا'; // ا
const HAMZA_A = 'أ'; // أ
const YA = 'ي'; // ي
const TA = 'ت'; // ت
const NUN = 'ن'; // ن
const SIN = 'س'; // س

const WEAK = new Set([...'ءأإؤئاويى']); // ء أ إ ؤ ئ ا و ي ى

// Patrons réguliers (c1,c2,c3 = radicaux nus). Renvoie { madi, mudari3 }.
const TEMPLATES = {
  2: (a, b, c) => ({
    madi: a + FA + b + SH + FA + c + FA, // فَعَّلَ
    mudari3: YA + DA + a + FA + b + SH + KA + c + DA, // يُفَعِّلُ
  }),
  3: (a, b, c) => ({
    madi: a + FA + ALEF + b + FA + c + FA, // فَاعَلَ
    mudari3: YA + DA + a + FA + ALEF + b + KA + c + DA, // يُفَاعِلُ
  }),
  4: (a, b, c) => ({
    madi: HAMZA_A + FA + a + SU + b + FA + c + FA, // أَفْعَلَ
    mudari3: YA + DA + a + SU + b + KA + c + DA, // يُفْعِلُ
  }),
  5: (a, b, c) => ({
    madi: TA + FA + a + FA + b + SH + FA + c + FA, // تَفَعَّلَ
    mudari3: YA + FA + TA + FA + a + FA + b + SH + FA + c + DA, // يَتَفَعَّلُ
  }),
  6: (a, b, c) => ({
    madi: TA + FA + a + FA + ALEF + b + FA + c + FA, // تَفَاعَلَ
    mudari3: YA + FA + TA + FA + a + FA + ALEF + b + FA + c + DA, // يَتَفَاعَلُ
  }),
  7: (a, b, c) => ({
    madi: ALEF + KA + NUN + SU + a + FA + b + FA + c + FA, // اِنْفَعَلَ
    mudari3: YA + FA + NUN + SU + a + FA + b + KA + c + DA, // يَنْفَعِلُ
  }),
  10: (a, b, c) => ({
    madi: ALEF + KA + SIN + SU + TA + FA + a + SU + b + FA + c + FA, // اِسْتَفْعَلَ
    mudari3: YA + FA + SIN + SU + TA + FA + a + SU + b + KA + c + DA, // يَسْتَفْعِلُ
  }),
};

function isSoundTriliteral(root) {
  const letters = [...root];
  if (letters.length !== 3) return false;
  if (letters.some((l) => WEAK.has(l))) return false;
  if (letters[1] === letters[2]) return false; // muḍaʿʿaf
  return true;
}

function main() {
  const p = path.join(process.cwd(), 'public', 'morphology', 'verbs.json');
  const verbs = JSON.parse(fs.readFileSync(p, 'utf8'));
  let filledMadi = 0;
  let filledMudari = 0;

  for (const [key, v] of Object.entries(verbs)) {
    const [root, formStr] = key.split('|');
    const form = Number(formStr);
    const tmpl = TEMPLATES[form];
    if (!tmpl || !isSoundTriliteral(root)) continue;
    const [a, b, c] = [...root];
    const gen = tmpl(a, b, c);
    if (!v.madi && gen.madi) {
      v.madi = gen.madi;
      filledMadi++;
    }
    if (!v.mudari3 && gen.mudari3) {
      v.mudari3 = gen.mudari3;
      filledMudari++;
    }
  }

  fs.writeFileSync(p, JSON.stringify(verbs, null, 0));
  console.log(`verbs.json complété : +${filledMadi} māḍī, +${filledMudari} muḍāriʿ (formes régulières, racines saines).`);
}

main();
