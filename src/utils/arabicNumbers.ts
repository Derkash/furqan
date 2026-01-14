/**
 * Convertit un nombre en chiffres arabes orientaux
 * @param num - Le nombre à convertir
 * @returns Le nombre en chiffres arabes (٠١٢٣٤٥٦٧٨٩)
 */
export function toArabicNumbers(num: number): string {
  return num.toLocaleString('ar-EG', { useGrouping: false });
}

/**
 * Convertit des chiffres arabes en nombre
 * @param arabicNum - La chaîne en chiffres arabes
 * @returns Le nombre converti
 */
export function fromArabicNumbers(arabicNum: string): number {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  let result = '';

  for (const char of arabicNum) {
    const index = arabicDigits.indexOf(char);
    if (index !== -1) {
      result += index;
    }
  }

  return parseInt(result, 10) || 0;
}
