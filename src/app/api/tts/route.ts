import { NextRequest } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// Synthèse vocale française de qualité (voix neurale Microsoft Edge).
// Utilisée pour écouter la traduction et le tafsir — jamais le texte coranique
// (la récitation Husary reste la seule source audio du Coran).

export const runtime = 'nodejs';
export const maxDuration = 60;

// Voix masculine : Henri (neurale standard — rapide). Rémy « Multilingual »
// était plus naturelle mais 2-4x plus lente à synthétiser (modèle lourd),
// ce qui rendait l'attente pénible.
const VOICES = ['fr-FR-HenriNeural', 'fr-FR-RemyMultilingualNeural'];
const MAX_CHARS = 6000;

/** Nettoie le texte pour la voix française : convertit les références de versets,
 *  supprime les émoticônes, normalise « Quran »→« Coran », retire l'écriture arabe,
 *  les backticks de translittération et les espaces superflus. */
function cleanForSpeech(text: string): string {
  return text
    // « Quran » / « Qur'an » / « Qurʾan » (venu de l'anglais) → « Coran ».
    .replace(/\bqur['’ʾʼ`]?[aâā]n\b/gi, 'Coran')
    .replace(/\bkoran\b/gi, 'Coran')
    // Références de versets : « 2:245 » lu comme une heure → « sourate 2 verset 245 ».
    // Plages d'abord (« 2:245-246 » → « sourate 2 versets 245 à 246 »).
    .replace(/\b(\d{1,3}):(\d{1,3})\s*[-–]\s*(\d{1,3})\b/g, 'sourate $1 versets $2 à $3')
    .replace(/\b(\d{1,3}):(\d{1,3})\b/g, 'sourate $1 verset $2')
    // Émoticônes (« ;) » lu « émoticône clin d'œil ») : on les retire.
    .replace(/[;:]-?[)(]/g, ' ')
    // Marqueurs éditoriaux / markup (crochets, accolades, etc.) lus à voix haute.
    .replace(/[[\]{}<>*_#]+/g, ' ')
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
    let audio: Buffer | null = null;
    for (const voice of VOICES) {
      try {
        const tts = new MsEdgeTTS();
        await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
        const { audioStream } = tts.toStream(clean);
        const chunks: Buffer[] = [];
        for await (const chunk of audioStream) {
          chunks.push(chunk as Buffer);
        }
        if (chunks.length > 0) {
          audio = Buffer.concat(chunks);
          break;
        }
      } catch {
        // voix indisponible → suivante
      }
    }
    if (!audio || audio.length === 0) throw new Error('audio vide');

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
