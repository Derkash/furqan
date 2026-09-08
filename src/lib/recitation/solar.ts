// Éphémérides solaires locales — lever, midi solaire (zénith), coucher — pour
// les rappels d'adhkar. Algorithme « sunrise equation » (NOAA/Meeus simplifié),
// précision ±2 minutes : largement suffisante pour des rappels.
//
// La position par défaut est Aulnay-sous-Bois (la ville de l'utilisateur) ;
// la rendre réglable ne demandera qu'un écran, pas un autre calcul.

export const DEFAULT_COORDS = { lat: 48.9385, lon: 2.4936 }; // Aulnay-sous-Bois

const RAD = Math.PI / 180;

export interface SolarEvents {
  sunrise: Date;
  solarNoon: Date;
  sunset: Date;
}

/**
 * Événements solaires d'une date locale (YYYY-MM-DD) à une position donnée.
 * Renvoie null aux latitudes/dates sans lever ni coucher (jour/nuit polaire).
 */
export function solarEvents(
  dateKey: string,
  lat: number = DEFAULT_COORDS.lat,
  lon: number = DEFAULT_COORDS.lon
): SolarEvents | null {
  const [y, m, d] = dateKey.split('-').map(Number);
  // Jours entiers depuis J2000 (1er janvier 2000, 12 h UT).
  const n = Math.round((Date.UTC(y, m - 1, d, 12) - Date.UTC(2000, 0, 1, 12)) / 86400000);
  // Midi solaire moyen au méridien local (longitude EST positive → plus tôt).
  const jStar = n - lon / 360;
  // Anomalie moyenne, équation du centre, longitude écliptique.
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const L = (M + C + 180 + 102.9372) % 360;
  // Transit (midi solaire vrai), en jour julien.
  const jTransit = 2451545.0 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * L * RAD);
  // Déclinaison du Soleil.
  const sinDelta = Math.sin(L * RAD) * Math.sin(23.4397 * RAD);
  const cosDelta = Math.cos(Math.asin(sinDelta));
  // Angle horaire du lever/coucher (zénith 90.833° : réfraction + demi-disque).
  const cosH =
    (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDelta) / (Math.cos(lat * RAD) * cosDelta);
  if (cosH < -1 || cosH > 1) return null; // pas de lever/coucher ce jour-là
  const H = Math.acos(cosH) / RAD; // en degrés

  const toDate = (j: number) => new Date((j - 2440587.5) * 86400000);
  return {
    sunrise: toDate(jTransit - H / 360),
    solarNoon: toDate(jTransit),
    sunset: toDate(jTransit + H / 360),
  };
}
