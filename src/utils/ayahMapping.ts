/**
 * Numéro global de ayah au début de chaque sourate
 * Index 0 = non utilisé, Index 1 = Sourate 1 (Al-Fatiha), etc.
 */
export const SURAH_START_AYAH: readonly number[] = [
  0,    // Index 0 - non utilisé
  1,    // 1 - Al-Fatiha
  8,    // 2 - Al-Baqarah
  294,  // 3 - Aal-Imran
  494,  // 4 - An-Nisa
  670,  // 5 - Al-Ma'idah
  790,  // 6 - Al-An'am
  955,  // 7 - Al-A'raf
  1161, // 8 - Al-Anfal
  1236, // 9 - At-Tawbah
  1365, // 10 - Yunus
  1474, // 11 - Hud
  1597, // 12 - Yusuf
  1708, // 13 - Ar-Ra'd
  1751, // 14 - Ibrahim
  1803, // 15 - Al-Hijr
  1902, // 16 - An-Nahl
  2030, // 17 - Al-Isra
  2141, // 18 - Al-Kahf
  2251, // 19 - Maryam
  2349, // 20 - Ta-Ha
  2484, // 21 - Al-Anbiya
  2596, // 22 - Al-Hajj
  2674, // 23 - Al-Mu'minun
  2792, // 24 - An-Nur
  2856, // 25 - Al-Furqan
  2933, // 26 - Ash-Shu'ara
  3160, // 27 - An-Naml
  3253, // 28 - Al-Qasas
  3341, // 29 - Al-Ankabut
  3410, // 30 - Ar-Rum
  3470, // 31 - Luqman
  3504, // 32 - As-Sajdah
  3534, // 33 - Al-Ahzab
  3607, // 34 - Saba
  3661, // 35 - Fatir
  3706, // 36 - Ya-Sin
  3789, // 37 - As-Saffat
  3971, // 38 - Sad
  4059, // 39 - Az-Zumar
  4134, // 40 - Ghafir
  4219, // 41 - Fussilat
  4273, // 42 - Ash-Shura
  4326, // 43 - Az-Zukhruf
  4415, // 44 - Ad-Dukhan
  4474, // 45 - Al-Jathiyah
  4511, // 46 - Al-Ahqaf
  4546, // 47 - Muhammad
  4584, // 48 - Al-Fath
  4613, // 49 - Al-Hujurat
  4631, // 50 - Qaf
  4676, // 51 - Adh-Dhariyat
  4736, // 52 - At-Tur
  4785, // 53 - An-Najm
  4847, // 54 - Al-Qamar
  4902, // 55 - Ar-Rahman
  4980, // 56 - Al-Waqi'ah
  5076, // 57 - Al-Hadid
  5105, // 58 - Al-Mujadila
  5127, // 59 - Al-Hashr
  5151, // 60 - Al-Mumtahanah
  5164, // 61 - As-Saff
  5178, // 62 - Al-Jumu'ah
  5189, // 63 - Al-Munafiqun
  5200, // 64 - At-Taghabun
  5218, // 65 - At-Talaq
  5230, // 66 - At-Tahrim
  5242, // 67 - Al-Mulk
  5272, // 68 - Al-Qalam
  5324, // 69 - Al-Haqqah
  5376, // 70 - Al-Ma'arij
  5420, // 71 - Nuh
  5448, // 72 - Al-Jinn
  5476, // 73 - Al-Muzzammil
  5496, // 74 - Al-Muddaththir
  5552, // 75 - Al-Qiyamah
  5592, // 76 - Al-Insan
  5623, // 77 - Al-Mursalat
  5673, // 78 - An-Naba
  5713, // 79 - An-Nazi'at
  5759, // 80 - Abasa
  5801, // 81 - At-Takwir
  5830, // 82 - Al-Infitar
  5849, // 83 - Al-Mutaffifin
  5885, // 84 - Al-Inshiqaq
  5910, // 85 - Al-Buruj
  5932, // 86 - At-Tariq
  5949, // 87 - Al-A'la
  5968, // 88 - Al-Ghashiyah
  5994, // 89 - Al-Fajr
  6024, // 90 - Al-Balad
  6044, // 91 - Ash-Shams
  6059, // 92 - Al-Layl
  6080, // 93 - Ad-Duhaa
  6091, // 94 - Ash-Sharh
  6099, // 95 - At-Tin
  6107, // 96 - Al-Alaq
  6126, // 97 - Al-Qadr
  6131, // 98 - Al-Bayyinah
  6139, // 99 - Az-Zalzalah
  6147, // 100 - Al-Adiyat
  6158, // 101 - Al-Qari'ah
  6169, // 102 - At-Takathur
  6177, // 103 - Al-Asr
  6180, // 104 - Al-Humazah
  6189, // 105 - Al-Fil
  6194, // 106 - Quraysh
  6198, // 107 - Al-Ma'un
  6205, // 108 - Al-Kawthar
  6208, // 109 - Al-Kafirun
  6214, // 110 - An-Nasr
  6217, // 111 - Al-Masad
  6222, // 112 - Al-Ikhlas
  6226, // 113 - Al-Falaq
  6231, // 114 - An-Nas
] as const;

/**
 * Nombre total de versets dans le Coran
 */
export const TOTAL_AYAHS = 6236;

/**
 * Convertit sourate:verset en numéro global (1-6236)
 * @param surah - Numéro de sourate (1-114)
 * @param verse - Numéro de verset dans la sourate
 * @returns Numéro global du verset
 *
 * Exemples:
 * - Al-Fatiha 1:1 → global 1
 * - Al-Fatiha 1:7 → global 7
 * - Al-Baqarah 2:1 → global 8
 */
export function toGlobalAyahNumber(surah: number, verse: number): number {
  if (surah < 1 || surah > 114) return 1;
  // SURAH_START_AYAH[surah] contient le numéro du premier verset de la sourate
  // Donc pour le verset N, le global est: START + (verse - 1)
  return SURAH_START_AYAH[surah] + verse - 1;
}

/**
 * Convertit un numéro global en sourate:verset
 * @param globalNumber - Numéro global (1-6236)
 * @returns Objet avec sourate et verset
 *
 * Exemples:
 * - global 1 → Al-Fatiha 1:1
 * - global 7 → Al-Fatiha 1:7
 * - global 8 → Al-Baqarah 2:1
 */
export function fromGlobalAyahNumber(globalNumber: number): {
  surah: number;
  verse: number;
} {
  for (let surah = 114; surah >= 1; surah--) {
    if (globalNumber >= SURAH_START_AYAH[surah]) {
      // verse = globalNumber - START + 1
      return { surah, verse: globalNumber - SURAH_START_AYAH[surah] + 1 };
    }
  }
  return { surah: 1, verse: 1 };
}

/**
 * Parse une location de mot "sourate:verset:position"
 * @param location - La location au format "4:15:3"
 * @returns Les composants parsés
 */
export function parseWordLocation(location: string): {
  surah: number;
  verse: number;
  position: number;
} {
  const parts = location.split(':').map(Number);
  return {
    surah: parts[0] || 1,
    verse: parts[1] || 1,
    position: parts[2] || 1,
  };
}

/**
 * Génère une clé de verset "surah:verse"
 */
export function getVerseKey(surah: number, verse: number): string {
  return `${surah}:${verse}`;
}

/**
 * Retourne l'URL audio pour un verset (Al-Husary)
 * @param globalAyahNumber - Numéro global du verset (1-6236)
 */
export function getAudioUrl(globalAyahNumber: number): string {
  return `https://cdn.islamic.network/quran/audio/128/ar.husary/${globalAyahNumber}.mp3`;
}
