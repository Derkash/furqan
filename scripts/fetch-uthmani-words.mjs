// Télécharge (une fois) le texte Uthmani MOT PAR MOT, avec les signes de
// pause (ج, لا, ۛ…) et le chakl, depuis l'API Quran.com, et l'écrit par page :
// public/uthmani/page-NNN.json  { "s:v:pos": "texte" }  (mots seulement).
// Les positions sont celles des données QCF de l'app (mêmes numérotations).
// Sert à l'exercice « Écriture » (mode « lettres masquées, signes visibles »).
//
//   node scripts/fetch-uthmani-words.mjs [--from 1] [--to 604] [--force]
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public', 'uthmani');
const args = process.argv.slice(2);
const val = (n, d) => (args.includes(n) ? Number(args[args.indexOf(n) + 1]) : d);
const FROM = val('--from', 1), TO = val('--to', 604), FORCE = args.includes('--force');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let words = 0;
for (let p = FROM; p <= TO; p++) {
  const file = path.join(OUT, `page-${String(p).padStart(3, '0')}.json`);
  if (fs.existsSync(file) && !FORCE) continue;
  const url = `https://api.quran.com/api/v4/verses/by_page/${p}?words=true&word_fields=text_uthmani&per_page=50`;
  let data;
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      data = await r.json();
      break;
    } catch (e) {
      if (a === 3) throw new Error(`page ${p} : ${e.message}`);
      await sleep(1500 * (a + 1));
    }
  }
  const out = {};
  for (const v of data.verses) {
    for (const w of v.words) if (w.char_type_name === 'word') out[`${v.verse_key}:${w.position}`] = w.text_uthmani;
  }
  words += Object.keys(out).length;
  fs.writeFileSync(file, JSON.stringify(out));
  if (p % 50 === 0) console.log(`page ${p} ok`);
  await sleep(120);
}
console.log(`terminé : ${words} mots écrits`);
