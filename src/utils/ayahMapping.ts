/**
 * Numéro global de ayah au début de chaque sourate
 * Index 0 = non utilisé, Index 1 = Sourate 1 (Al-Fatiha), etc.
 */
export const SURAH_START_AYAH: readonly number[] = [
  0, 1, 8, 293, 493, 669, 789, 955, 1160, 1235, 1364, 1473, 1596, 1639, 1691, 1750,
  1802, 1901, 2029, 2140, 2250, 2348, 2483, 2595, 2673, 2791, 2855, 2932, 3020, 3089,
  3159, 3217, 3252, 3340, 3409, 3469, 3503, 3585, 3674, 3748, 3802, 3856, 3910, 3963,
  4016, 4053, 4089, 4157, 4186, 4256, 4301, 4358, 4408, 4468, 4510, 4565, 4634, 4698,
  4751, 4776, 4800, 4814, 4825, 4836, 4855, 4867, 4879, 4909, 4961, 5013, 5057, 5085,
  5113, 5156, 5186, 5226, 5263, 5313, 5353, 5399, 5439, 5468, 5494, 5530, 5555, 5580,
  5597, 5617, 5643, 5673, 5703, 5718, 5739, 5754, 5762, 5770, 5789, 5797, 5805, 5816,
  5827, 5838, 5849, 5857, 5866, 5872, 5879, 5886, 5891, 5898, 5904, 5911, 5917, 5923, 5929,
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
