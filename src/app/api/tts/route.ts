import { NextRequest } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// Synthèse vocale française de qualité (voix neurale Microsoft Edge).
// Utilisée pour écouter la traduction et le tafsir — jamais le texte coranique
// (la récitation Husary reste la seule source audio du Coran).

export const runtime = 'nodejs';
export const maxDuration = 60;

const VOICE = 'fr-FR-DeniseNeural';
const MAX_CHARS = 6000;

/** Nettoie le texte pour la voix française : retire l'écriture arabe,
 *  les backticks de translittération et les espaces superflus. */
function cleanForSpeech(text: string): string {
  return text
    .replace(/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+/g, ' ')
    .replace(/[`ـ]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function POST(req: NextRequest) {
  let text: unknown;
  try {
    ({ text } = await req.json());
  } catch {
    return new Response('Corps JSON invalide', { status: 400 });
  }
  if (typeof text !== 'string' || !text.trim()) {
    return new Response('Texte requis', { status: 400 });
  }

  const clean = cleanForSpeech(text).slice(0, MAX_CHARS);
  if (!clean) return new Response('Texte vide après nettoyage', { status: 400 });

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(clean);

    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk as Buffer);
    }
    const audio = Buffer.concat(chunks);
    if (audio.length === 0) throw new Error('audio vide');

    return new Response(new Uint8Array(audio), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch {
    return new Response('Synthèse vocale indisponible', { status: 502 });
  }
}
