import { NextRequest } from 'next/server';
import { frenchWordGloss } from '@/lib/quranWords';

// Glose française par occurrence (verset:position) — gratuit (Quran.com + Bing).
// Entrée : { items: [{ verseKey, position }] } → { "verseKey:position": "fr" }.

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { items?: { verseKey: string; position: number }[] };
  try {
    body = await req.json();
  } catch {
    return new Response('Corps JSON invalide', { status: 400 });
  }
  const items = (body.items ?? []).slice(0, 120); // borne raisonnable
  const out: Record<string, string> = {};
  // Séquentiel léger (le cache mémoire fait que chaque verset n'est appelé qu'une fois).
  for (const it of items) {
    if (!it?.verseKey || !it?.position) continue;
    const key = `${it.verseKey}:${it.position}`;
    if (out[key] != null) continue;
    out[key] = await frenchWordGloss(it.verseKey, it.position);
  }
  return Response.json({ glosses: out });
}
