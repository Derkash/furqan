#!/usr/bin/env node

/**
 * Script de génération de cartographie des versets
 *
 * Analyse les données de layout JSON et génère une carte précise
 * des positions de chaque verset sur chaque page du Mushaf.
 *
 * Format de sortie: verse-map.json
 * {
 *   "pageNumber": {
 *     "verseKey": {
 *       "surah": number,
 *       "verse": number,
 *       "segments": [
 *         { "line": number, "startWord": number, "endWord": number, "totalWordsOnLine": number }
 *       ]
 *     }
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');

const LAYOUT_BASE_URL = 'https://raw.githubusercontent.com/zonetecde/mushaf-layout/refs/heads/main/mushaf';
const TOTAL_PAGES = 604;
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'verse-map.json');

// Constantes de positionnement (en pourcentage de l'image)
const PAGE_LAYOUT = {
  marginTop: 11.5,      // % depuis le haut où commence le texte
  marginBottom: 6,      // % depuis le bas
  marginLeft: 7,        // % depuis la gauche
  marginRight: 7,       // % depuis la droite
  linesPerPage: 15,
  lineHeight: 5.5,      // % de hauteur par ligne
};

/**
 * Récupère les données JSON d'une page
 */
async function fetchPageLayout(pageNumber) {
  const paddedPage = pageNumber.toString().padStart(3, '0');
  const url = `${LAYOUT_BASE_URL}/page-${paddedPage}.json`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Erreur page ${pageNumber}: ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`Erreur fetch page ${pageNumber}:`, error.message);
    return null;
  }
}

/**
 * Parse la location d'un mot "sourate:verset:position"
 */
function parseLocation(location) {
  const parts = location.split(':').map(Number);
  return {
    surah: parts[0],
    verse: parts[1],
    wordPosition: parts[2]
  };
}

/**
 * Analyse une page et extrait les positions des versets
 */
function analyzePageVerses(pageData) {
  const verses = {};

  for (const line of pageData.lines) {
    // Ignorer les en-têtes de sourate et basmala sans mots
    if (line.type === 'surah-header' || !line.words || line.words.length === 0) {
      continue;
    }

    const lineNumber = line.line;
    const totalWordsOnLine = line.words.length;

    // Grouper les mots par verset sur cette ligne
    const verseWordsOnLine = {};

    line.words.forEach((word, index) => {
      const { surah, verse, wordPosition } = parseLocation(word.location);
      const verseKey = `${surah}:${verse}`;

      if (!verseWordsOnLine[verseKey]) {
        verseWordsOnLine[verseKey] = {
          surah,
          verse,
          startWordIndex: index,
          endWordIndex: index,
          wordPositions: [wordPosition]
        };
      } else {
        verseWordsOnLine[verseKey].endWordIndex = index;
        verseWordsOnLine[verseKey].wordPositions.push(wordPosition);
      }
    });

    // Ajouter les segments de chaque verset
    for (const [verseKey, data] of Object.entries(verseWordsOnLine)) {
      if (!verses[verseKey]) {
        verses[verseKey] = {
          surah: data.surah,
          verse: data.verse,
          segments: []
        };
      }

      verses[verseKey].segments.push({
        line: lineNumber,
        startWord: data.startWordIndex,      // Index 0-based du premier mot du verset sur cette ligne
        endWord: data.endWordIndex,           // Index 0-based du dernier mot du verset sur cette ligne
        totalWordsOnLine: totalWordsOnLine    // Nombre total de mots sur la ligne
      });
    }
  }

  return verses;
}

/**
 * Calcule les bounding boxes en pourcentage pour un verset
 */
function calculateBoundingBoxes(verseData) {
  const boxes = [];

  for (const segment of verseData.segments) {
    const { line, startWord, endWord, totalWordsOnLine } = segment;

    // Calcul de la position verticale
    const top = PAGE_LAYOUT.marginTop + (line - 1) * PAGE_LAYOUT.lineHeight;
    const height = PAGE_LAYOUT.lineHeight;

    // Calcul de la position horizontale (RTL: le premier mot est à droite)
    const lineWidth = 100 - PAGE_LAYOUT.marginLeft - PAGE_LAYOUT.marginRight;
    const wordWidth = lineWidth / totalWordsOnLine;

    // En RTL, le mot 0 est à droite, le dernier mot est à gauche
    // right = marginRight + (startWord * wordWidth)
    // left = marginLeft + ((totalWordsOnLine - 1 - endWord) * wordWidth)
    const right = PAGE_LAYOUT.marginRight + (startWord * wordWidth);
    const left = PAGE_LAYOUT.marginLeft + ((totalWordsOnLine - 1 - endWord) * wordWidth);

    boxes.push({
      line,
      top,
      height,
      left,
      right,
      width: 100 - left - right
    });
  }

  return boxes;
}

/**
 * Génère la cartographie complète
 */
async function generateVerseMap() {
  console.log('🔄 Génération de la cartographie des versets...\n');

  const verseMap = {
    metadata: {
      generatedAt: new Date().toISOString(),
      totalPages: TOTAL_PAGES,
      layout: PAGE_LAYOUT
    },
    pages: {}
  };

  let processedPages = 0;
  let totalVerses = 0;

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const pageData = await fetchPageLayout(page);

    if (!pageData) {
      console.log(`⚠️  Page ${page}: échec du chargement`);
      continue;
    }

    const verses = analyzePageVerses(pageData);
    const versesWithBoxes = {};

    for (const [verseKey, verseData] of Object.entries(verses)) {
      versesWithBoxes[verseKey] = {
        ...verseData,
        boxes: calculateBoundingBoxes(verseData)
      };
      totalVerses++;
    }

    verseMap.pages[page] = versesWithBoxes;
    processedPages++;

    // Afficher la progression
    if (page % 50 === 0 || page === TOTAL_PAGES) {
      const percent = Math.round((page / TOTAL_PAGES) * 100);
      console.log(`📄 Progression: ${page}/${TOTAL_PAGES} pages (${percent}%)`);
    }

    // Petite pause pour ne pas surcharger le serveur
    if (page % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Sauvegarder le fichier
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(verseMap, null, 2));

  console.log(`\n✅ Cartographie générée avec succès!`);
  console.log(`   📁 Fichier: ${OUTPUT_FILE}`);
  console.log(`   📄 Pages traitées: ${processedPages}`);
  console.log(`   📝 Versets cartographiés: ${totalVerses}`);
}

// Lancer le script
generateVerseMap().catch(console.error);
