#!/usr/bin/env node
// Envoie les .m4a produits par build-tafsir-audio.mjs dans le bucket public
// Supabase `tafsir` (projet almuraja3a), aux chemins du manifeste.
//
//   SUPABASE_SERVICE_KEY=… node scripts/tafsir/upload-tafsir-audio.mjs <dossier de sortie>
//
// Clé : `supabase projects api-keys --project-ref cfydyjtmvpwktuovyyfr` (service_role).
// Résumable : un fichier déjà présent avec la même taille est sauté.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [dir] = process.argv.slice(2);
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!dir || !KEY) {
  console.error('usage: SUPABASE_SERVICE_KEY=… upload-tafsir-audio.mjs <dossier de sortie>');
  process.exit(1);
}
const URL_BASE = 'https://cfydyjtmvpwktuovyyfr.supabase.co/storage/v1';
const BUCKET = 'tafsir';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { items } = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/tafsir-audio.json'), 'utf8'));
const headers = { Authorization: `Bearer ${KEY}`, apikey: KEY };

async function remoteSize(p) {
  const r = await fetch(`${URL_BASE}/object/info/${BUCKET}/${p}`, { headers });
  if (!r.ok) return -1;
  const j = await r.json();
  return Number(j.size ?? j.metadata?.size ?? -1);
}

async function upload(it) {
  const file = path.join(dir, it.path);
  const body = fs.readFileSync(file);
  if ((await remoteSize(it.path)) === body.length) return 'déjà là';
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(`${URL_BASE}/object/${BUCKET}/${it.path}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'audio/mp4', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
      body,
    });
    if (r.ok) return 'envoyé';
    if (attempt >= 3) throw new Error(`${it.path} : ${r.status} ${await r.text()}`);
    await new Promise((res) => setTimeout(res, 2000 * attempt));
  }
}

let i = 0;
let done = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (i < items.length) {
      const it = items[i++];
      const status = await upload(it);
      console.log(`[${++done}/${items.length}] ${it.path} ${status}`);
    }
  })
);
console.log('Upload terminé.');
