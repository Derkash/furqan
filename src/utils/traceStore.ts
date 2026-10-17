// Exercice « Écriture » : tracés au stylet enregistrés PAR PAGE du Mushaf.
// Les tracés sont vectoriels (points normalisés 0..1 sur la page), donc
// indépendants de la taille d'écran et de l'orientation. Volume possible
// important (une page entière écrite = des dizaines de milliers de points) →
// IndexedDB plutôt que localStorage.

export type TraceTool = 'calame' | 'pen' | 'erase';

export interface Stroke {
  t: TraceTool;
  c: string; // couleur
  w: number; // épaisseur de base, en fraction de la largeur de page
  p: number[]; // points à plat : x, y, pression (x, y en 0..1)
}

const DB = 'almuraja3a-ecriture';
const STORE = 'pages';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadStrokes(page: number): Promise<Stroke[]> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(page);
      r.onsuccess = () => resolve(Array.isArray(r.result?.strokes) ? r.result.strokes : []);
      r.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function saveStrokes(page: number, strokes: Stroke[]): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      if (strokes.length) st.put({ strokes, updatedAt: new Date().toISOString() }, page);
      else st.delete(page);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* stockage indisponible */
  }
}

/** Pages qui ont déjà des tracés (pour les repérer dans la navigation). */
export async function pagesWithStrokes(): Promise<number[]> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
      r.onsuccess = () => resolve((r.result as number[]).sort((a, b) => a - b));
      r.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}
