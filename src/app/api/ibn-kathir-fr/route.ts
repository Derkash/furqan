import { NextRequest } from 'next/server';
import { translate as bingTranslate } from 'bing-translate-api';

// Tafsir Ibn Kathir (abrégé) traduit EN→FR à la demande — Option B.
// Les sourates 1-7 et le Juz 'Amma sont pré-traduits dans public/ibn-kathir-fr/
// (Option A) ; cette route couvre le reste. La réponse est mise en cache un an
// sur le CDN Vercel : seul le premier visiteur d'un verset paie la traduction.

export const runtime = 'nodejs';
export const maxDuration = 60;

const SOURCE_URL = (ayah: string) =>
  `https://api.qurancdn.com/api/qdc/tafsirs/en-tafisr-ibn-kathir/by_ayah/${ayah}`;

const CHUNK_MAX = 900;

/** HTML du tafsir → texte brut en gardant la structure en paragraphes. */
function htmlToText(html: string): string {
  return html
    .replace(/<\/(h1|h2|h3|p|div)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function chunkText(text: string): string[] {
  const segments: string[] = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    if (paragraph.length <= CHUNK_MAX) {
      segments.push(paragraph);
    } else {
      let buf = '';
      for (const sentence of paragraph.split(/(?<=[.!?؟:])\s+/)) {
        if (buf.length + sentence.length > CHUNK_MAX && buf) {
          segments.push(buf);
          buf = sentence;
        } else {
          buf = buf ? `${buf} ${sentence}` : sentence;
        }
      }
      if (buf) segments.push(buf);
    }
  }
  const chunks: string[] = [];
  let current = '';
  for (const seg of segments) {
    if (current.length + seg.length > CHUNK_MAX && current) {
      chunks.push(current);
      current = seg;
    } else {
      current = current ? `${current}\n\n${seg}` : seg;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function translateToFrench(text: string): Promise<string> {
  const out: string[] = [];
  for (const chunk of chunkText(text)) {
    let translated = '';
    for (let attempt = 0; attempt < 3 && !translated; attempt++) {
      try {
        const res = await bingTranslate(chunk, 'en', 'fr');
        translated = res?.translation ?? '';
      } catch {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    if (!translated) throw new Error('traduction indisponible');
    out.push(translated);
  }
  return out.join('\n\n');
}

export async function GET(req: NextRequest) {
  const ayah = req.nextUrl.searchParams.get('ayah') ?? '';
  if (!/^\d{1,3}:\d{1,3}$/.test(ayah)) {
    return new Response('Paramètre ayah invalide (attendu "2:255")', { status: 400 });
  }

  try {
    const src = await fetch(SOURCE_URL(ayah), {
      headers: { 'User-Agent': 'almuraja3a.com' },
    });
    if (!src.ok) throw new Error(`source HTTP ${src.status}`);
    const data = await src.json();
    const rawHtml: string = data?.tafsir?.text ?? '';
    const verses = Object.keys(data?.tafsir?.verses ?? {});
    const english = htmlToText(rawHtml);

    if (!english) {
      return Response.json(
        { verses, text: null },
        { headers: { 'Cache-Control': 'public, s-maxage=31536000, max-age=86400' } }
      );
    }

    const text = await translateToFrench(english);
    return Response.json(
      { verses, text },
      { headers: { 'Cache-Control': 'public, s-maxage=31536000, max-age=86400' } }
    );
  } catch {
    return new Response('Tafsir indisponible', { status: 502 });
  }
}
