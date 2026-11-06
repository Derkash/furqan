import { NextRequest } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// Synthèse vocale de qualité (voix neurales Microsoft Edge).
// - fr : traduction et tafsir — jamais le texte coranique du mushaf
//   (la récitation Husary reste la seule source audio du Coran).
// - ar : invocations (adhkar) — voix arabe native (Hamed, Arabie saoudite),
//   qui respecte les harakat du texte.

export const runtime = 'nodejs';
export const maxDuration = 60;

// Voix masculine : Henri (neurale standard — rapide). Rémy « Multilingual »
// était plus naturelle mais 2-4x plus lente à synthétiser (modèle lourd),
// ce qui rendait l'attente pénible.
const VOICES: Record<Lang, string[]> = {
  fr: ['fr-FR-HenriNeural', 'fr-FR-RemyMultilingualNeural'],
  // Hamed (ar-SA) : voix masculine posée, diction coranique correcte des harakat.
  // Shakir (ar-EG) en secours.
  ar: ['ar-SA-HamedNeural', 'ar-EG-ShakirNeural'],
};
// Les invocations s'écoutent un peu plus lentement que la prose française.
const RATE: Record<Lang, string | undefined> = { fr: undefined, ar: '-10%' };
const MAX_CHARS = 6000;

type Lang = 'fr' | 'ar';

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

/** Prépare un texte arabe (adhkar, parfois en graphie uthmanienne) pour la voix :
 *  ramène l'orthographe coranique vers l'orthographe standard que la voix sait lire,
 *  en conservant toutes les harakat. */
function cleanArabicForSpeech(text: string): string {
  return (
    text
      // Alif wasla → alif simple.
      .replace(/ٱ/g, 'ا')
      // Hamza portée par un tatweel (« يَـُٔودُهُ ») → hamza sur waw, harakat conservées.
      .replace(/ـ([\u064B-\u0652]*)\u0654/g, 'ؤ$1')
      // Alif maqsura qui note un ya (précédée d'une kasra ou portant une haraka) → ya.
      .replace(/ِى/g, 'ِي')
      .replace(/ى(?=[\u064B-\u0652])/g, 'ي')
      // Petites lettres et signes de pause propres au mushaf (ۥ ۦ ۖ ۗ …).
      .replace(/[\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, '')
      // Tatweel, markup, parenthèses de numéros de versets.
      .replace(/ـ/g, '')
      .replace(/[[\]{}<>*_#`]+/g, ' ')
      .replace(/[﴾﴿]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

export async function POST(req: NextRequest) {
  let text: unknown;
  let langRaw: unknown;
  try {
    ({ text, lang: langRaw } = await req.json());
  } catch {
    return new Response('Corps JSON invalide', { status: 400 });
  }
  if (typeof text !== 'string' || !text.trim()) {
    return new Response('Texte requis', { status: 400 });
  }
  const lang: Lang = langRaw === 'ar' ? 'ar' : 'fr';

  const clean = (lang === 'ar' ? cleanArabicForSpeech(text) : cleanForSpeech(text)).slice(0, MAX_CHARS);
  if (!clean) return new Response('Texte vide après nettoyage', { status: 400 });

  try {
    let audio: Buffer | null = null;
    for (const voice of VOICES[lang]) {
      try {
        const tts = new MsEdgeTTS();
        await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
        const rate = RATE[lang];
        const { audioStream } = tts.toStream(clean, rate ? { rate } : undefined);
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
