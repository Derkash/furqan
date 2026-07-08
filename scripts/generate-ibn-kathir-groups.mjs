// Génère public/ibn-kathir-groups.json : verseKey → numéro de groupe de tafsir.
// Ibn Kathir commente par passages : les versets d'un même groupe partagent le
// même tafsir (même thème). Le numéro est séquentiel dans l'ordre du Mushaf,
// ce qui permet d'alterner les teintes de surlignage entre groupes voisins.
//
// À relancer après chaque complément de public/ibn-kathir-fr/.
// Usage : node scripts/generate-ibn-kathir-groups.mjs

import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.join(process.cwd(), 'public', 'ibn-kathir-fr');
const OUT_PATH = path.join(process.cwd(), 'public', 'ibn-kathir-groups.json');

const result = {};
let groupId = 0;

for (let surah = 1; surah <= 114; surah++) {
  const dir = path.join(SRC_DIR, String(surah));
  if (!fs.existsSync(dir)) continue;
  const ayahs = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => Number(f.replace('.json', '')))
    .sort((a, b) => a - b);

  for (const ayah of ayahs) {
    const key = `${surah}:${ayah}`;
    if (key in result) continue; // déjà couvert par un groupe précédent
    const data = JSON.parse(fs.readFileSync(path.join(dir, `${ayah}.json`), 'utf8'));
    if (data.ref) {
      // Renvoi vers un groupe précédent (verset sans entrée propre) :
      // il rejoint le groupe du verset référencé.
      const refKey = data.ref.replace('/', ':');
      if (result[refKey]) result[key] = result[refKey];
      continue;
    }
    groupId++;
    for (const v of data.verses ?? [key]) result[v] = groupId;
  }
}

fs.writeFileSync(OUT_PATH, JSON.stringify(result), 'utf8');
console.log(
  `OK : ${Object.keys(result).length} versets, ${groupId} groupes → ${OUT_PATH} (${(fs.statSync(OUT_PATH).size / 1024).toFixed(0)} Ko)`
);
