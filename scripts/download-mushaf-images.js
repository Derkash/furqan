const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'mushaf-pages');
const BASE_URL = 'https://app.quranflash.com/book/MedinaOld/epub/EPUB/imgs';
const TOTAL_PAGES = 604;
const DELAY_MS = 200;

// Créer le dossier si nécessaire
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`📁 Dossier créé : ${OUTPUT_DIR}\n`);
}

/**
 * Convertit un numéro de page Coran (1-604) en numéro d'image (4-607)
 */
function pageToImageNumber(page) {
  return page + 3;
}

/**
 * Télécharge une image avec gestion des redirections
 */
function downloadImage(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    const request = https.get(url, (response) => {
      // Gérer les redirections
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(outputPath);
        downloadImage(response.headers.location, outputPath)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(outputPath);
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      reject(err);
    });

    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Timeout'));
    });
  });
}

/**
 * Télécharge une page du Mushaf
 */
async function downloadPage(page) {
  const imageNum = pageToImageNumber(page);
  const paddedImageNum = String(imageNum).padStart(4, '0');
  const paddedPage = String(page).padStart(3, '0');

  const url = `${BASE_URL}/${paddedImageNum}.png`;
  const outputPath = path.join(OUTPUT_DIR, `page-${paddedPage}.png`);

  // Vérifier si le fichier existe déjà
  if (fs.existsSync(outputPath)) {
    const stats = fs.statSync(outputPath);
    if (stats.size > 10000) { // Au moins 10KB
      return { page, status: 'skipped', size: stats.size };
    }
  }

  await downloadImage(url, outputPath);
  const stats = fs.statSync(outputPath);
  return { page, status: 'downloaded', size: stats.size };
}

/**
 * Affiche une barre de progression
 */
function showProgress(current, total, status) {
  const percent = Math.round((current / total) * 100);
  const filled = Math.round(percent / 2);
  const empty = 50 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  process.stdout.write(`\r[${bar}] ${percent}% (${current}/${total}) - ${status}    `);
}

/**
 * Pause
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Télécharge toutes les pages
 */
async function downloadAllPages() {
  console.log('🕌 Téléchargement des pages du Mushaf Medina Old (1405H)');
  console.log(`📥 Source : ${BASE_URL}`);
  console.log(`📁 Destination : ${OUTPUT_DIR}`);
  console.log(`📄 Pages : 1 à ${TOTAL_PAGES}`);
  console.log('');

  const startTime = Date.now();
  let downloaded = 0;
  let skipped = 0;
  let errors = 0;
  const errorPages = [];

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    try {
      const result = await downloadPage(page);

      if (result.status === 'downloaded') {
        downloaded++;
        showProgress(page, TOTAL_PAGES, `Page ${page} ✓ (${Math.round(result.size / 1024)}KB)`);
      } else {
        skipped++;
        showProgress(page, TOTAL_PAGES, `Page ${page} (déjà téléchargée)`);
      }

      // Délai entre les téléchargements
      if (page < TOTAL_PAGES) {
        await sleep(DELAY_MS);
      }
    } catch (err) {
      errors++;
      errorPages.push(page);
      showProgress(page, TOTAL_PAGES, `Page ${page} ✗ (${err.message})`);
      await sleep(DELAY_MS);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  console.log('\n\n');
  console.log('═'.repeat(60));
  console.log('📊 RÉSUMÉ');
  console.log('═'.repeat(60));
  console.log(`✅ Téléchargées : ${downloaded}`);
  console.log(`⏭️  Ignorées (déjà présentes) : ${skipped}`);
  console.log(`❌ Erreurs : ${errors}`);
  console.log(`⏱️  Durée : ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);

  if (errorPages.length > 0) {
    console.log(`\n⚠️  Pages en erreur : ${errorPages.join(', ')}`);
  }

  console.log('═'.repeat(60));
  console.log('\n✨ Terminé !');
}

// Exécuter
downloadAllPages().catch(console.error);
