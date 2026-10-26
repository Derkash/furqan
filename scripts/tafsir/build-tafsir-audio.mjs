#!/usr/bin/env node
// Tafsir audio (fichiers personnels de l'utilisateur) → AAC compressé + manifeste.
//
//   node scripts/tafsir/build-tafsir-audio.mjs "<dossier TAFSIR CORAN>" <dossier de sortie>
//
// - lit les MP3 de « 02-Al baqarah », « 03-Al Imrân » et « Juz-30 » ;
// - déduit sourate + versets du nom de fichier (Tafsir_baqarah_021-025,
//   Al-Imran_130-136, Juz-30 : une sourate entière par fichier) ;
// - encode en HE-AAC mono (afconvert, macOS) : 24 kbps, moins si le fichier
//   dépasserait 48 Mo (limite de 50 Mo par fichier du Supabase gratuit) ;
// - écrit public/tafsir-audio.json (durées, versets, chemins dans le bucket).
// Résumable : un .m4a déjà présent n'est pas ré-encodé.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: build-tafsir-audio.mjs <dossier TAFSIR CORAN> <dossier de sortie>');
  process.exit(1);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chapters = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/qcf-data/chapters.json'), 'utf8'));
const versesCount = Object.fromEntries(chapters.map((c) => [c.id, c.verses_count]));

const MAX_BYTES = 48 * 1024 * 1024;
const pad = (n) => String(n).padStart(3, '0');

function listMp3(dir) {
  return fs
    .readdirSync(path.join(src, dir))
    .filter((f) => f.toLowerCase().endsWith('.mp3'))
    .sort();
}

/** Liste des fichiers à produire : { source, surah, from, to, whole, kind }. */
function collect() {
  const items = [];
  for (const f of listMp3('02-Al baqarah')) {
    const m = f.match(/baqarah_(\d+)(?:[-_](\d+))?\.mp3$/i);
    if (!m) throw new Error(`Nom inattendu : ${f}`);
    items.push({ source: `02-Al baqarah/${f}`, surah: 2, from: +m[1], to: +(m[2] ?? m[1]) });
  }
  for (const f of listMp3('03-Al Imrân')) {
    const m = f.match(/Imran_(\d+)(?:-(\d+))?\.mp3$/i);
    if (!m) throw new Error(`Nom inattendu : ${f}`);
    items.push({ source: `03-Al Imrân/${f}`, surah: 3, from: +m[1], to: +(m[2] ?? m[1]) });
  }
  // An-Nisa (cours du Cheikh Al-Fawzan) : les noms ne donnent pas les versets,
  // relevés à la transcription des débuts/fins de leçon → nisa-verses.json.
  if (fs.existsSync(path.join(src, '04-An nissa'))) {
    const verses = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/tafsir/nisa-verses.json'), 'utf8'));
    for (const f of listMp3('04-An nissa')) {
      const r = verses[f.slice(0, 2)];
      if (!r) throw new Error(`Versets inconnus pour ${f} (nisa-verses.json)`);
      items.push({ source: `04-An nissa/${f}`, surah: 4, from: r[0], to: r[1], lesson: +f.slice(0, 2) });
    }
  }
  for (const f of listMp3('Juz-30')) {
    const n = +f.match(/^(\d+)/)[1];
    if (n === 1) {
      // Introduction générale au Juz 'Amma : jouée avant An-Naba (78:1).
      items.push({ source: `Juz-30/${f}`, surah: 78, from: 0, to: 0, kind: 'intro' });
      continue;
    }
    // 02 = Al-Fatiha, puis 03 An-Nas (114) … 39 An-Naba (78).
    const surah = n === 2 ? 1 : 117 - n;
    items.push({ source: `Juz-30/${f}`, surah, from: 1, to: versesCount[surah], whole: true });
  }
  return items;
}

async function duration(file) {
  const { stdout } = await run('afinfo', [file]);
  return Number(stdout.match(/estimated duration: ([\d.]+)/)[1]);
}

function remotePath(it) {
  if (it.kind === 'intro') return `${pad(it.surah)}/intro.m4a`;
  if (it.whole) return `${pad(it.surah)}/all.m4a`;
  // Leçons : deux leçons peuvent commenter le même verset (fin/début) → n° de leçon dans le nom.
  if (it.lesson) return `${pad(it.surah)}/L${String(it.lesson).padStart(2, '0')}_${pad(it.from)}-${pad(it.to)}.m4a`;
  return `${pad(it.surah)}/${pad(it.from)}-${pad(it.to)}.m4a`;
}

async function pool(list, size, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < list.length) await fn(list[i++]);
    })
  );
}

const items = collect();
fs.mkdirSync(out, { recursive: true });
let done = 0;
await pool(items, Math.max(2, os.cpus().length - 2), async (it) => {
  const input = path.join(src, it.source);
  it.path = remotePath(it);
  it.dur = Math.round(await duration(input));
  // HE-AAC mono : 24 kbps (voix intacte), réduit pour les très longs cours.
  let kbps = 24;
  while (kbps > 12 && (it.dur * kbps * 1000) / 8 > MAX_BYTES) kbps -= 4;
  const dest = path.join(out, it.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 2048) {
    const tmp = `${dest}.part`;
    await run('afconvert', ['-f', 'm4af', '-d', 'aach', '-b', String(kbps * 1000), '-c', '1', input, tmp]);
    fs.renameSync(tmp, dest);
  }
  it.bytes = fs.statSync(dest).size;
  done++;
  console.log(`[${done}/${items.length}] ${it.path} ${kbps}k ${(it.bytes / 1e6).toFixed(1)} Mo`);
});

const order = (it) => {
  // Ordre du mushaf ; l'introduction du Juz 'Amma avant An-Naba.
  if (it.kind === 'intro') return 78 * 1000 - 1;
  return it.surah * 1000 + (it.lesson ? it.lesson / 100 : it.from);
};
items.sort((a, b) => order(a) - order(b));

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  items: items.map((it) => ({
    id: it.path.replace(/\.m4a$/, ''),
    surah: it.surah,
    from: it.from,
    to: it.to,
    ...(it.whole ? { whole: true } : {}),
    ...(it.kind ? { kind: it.kind } : {}),
    ...(it.lesson ? { lesson: it.lesson } : {}),
    dur: it.dur,
    path: it.path,
  })),
};
fs.writeFileSync(path.join(ROOT, 'public/tafsir-audio.json'), JSON.stringify(manifest));
const total = items.reduce((s, it) => s + it.bytes, 0);
console.log(`Manifeste : ${items.length} fichiers, ${(total / 1e6).toFixed(0)} Mo.`);
