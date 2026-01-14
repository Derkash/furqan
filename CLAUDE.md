# Projet FOURQAN - Application de Révision du Coran

## Objectif
Application de révision/mémorisation du Coran utilisant les **images PNG du Mushaf Medina Old (1405H)** avec audio **Mahmoud Khalil Al-Husary** et un système de **flou + masquage par overlay**.

---

## ARCHITECTURE : FLOU + MASQUAGE D'IMAGES PNG

### Principe fondamental
Les images PNG dans `public/mushaf-pages/` (page-001.png à page-604.png) contiennent **DÉJÀ** le texte arabe parfaitement rendu. On ne réécrit **JAMAIS** le texte. On utilise :
1. **FLOU** pendant l'écoute (impossible de lire)
2. **MASQUAGE** par overlays colorés pour révéler/cacher des versets

### Avantages
- Rendu pixel-perfect garanti (identique au Mushaf imprimé)
- Pas de problème de polices arabes
- Performance optimale
- Le flou empêche totalement la lecture pendant l'écoute

---

## Mode d'affichage

### TOUJOURS en double page
- **Mode portrait** : 2 pages empilées verticalement
- **Mode paysage** : 2 pages côte à côte
- Pages impaires à droite, pages paires à gauche (lecture arabe RTL)

```
┌─────────────────────────────────────────────────────┐
│  ┌──────────────────┐  ┌──────────────────┐        │
│  │                  │  │                  │        │
│  │    Page 80      │  │     Page 79      │        │
│  │    (gauche)     │  │     (droite)     │        │
│  │                  │  │                  │        │
│  └──────────────────┘  └──────────────────┘        │
│              ٨٠                    ٧٩               │
└─────────────────────────────────────────────────────┘
```

---

## Flux de l'application (User Flow)

### Étape 1 : Configuration
```
┌─────────────────────────────────────────┐
│         Configuration Révision          │
│                                         │
│      Page de début : [___]              │
│      Page de fin :   [___]              │
│                                         │
│            [Commencer]                  │
└─────────────────────────────────────────┘
```

### Étape 2 : Récitation (écran FLOUTÉ)
```
┌─────────────────────────────────────────┐
│  ┌─────────────┐  ┌─────────────┐       │
│  │ ░░░░░░░░░░░ │  │ ░░░░░░░░░░░ │       │  ← TOUT EST FLOUTÉ
│  │ ░░░FLOU░░░░ │  │ ░░░FLOU░░░░ │       │    (backdrop-filter: blur)
│  │ ░░░░░░░░░░░ │  │ ░░░░░░░░░░░ │       │
│  └─────────────┘  └─────────────┘       │
│                                         │
│     🔊 [Audio du verset aléatoire]      │
│                                         │
│       "Où se trouve ce verset ?"        │
│      [Tapez l'écran quand prêt]         │
└─────────────────────────────────────────┘
```

### Étape 3 : Révélation du verset récité (1er clic)
→ Flou RETIRÉ, tout masqué SAUF le verset récité (surligné en doré)

### Étape 4 : Test premier verset (2ème clic)
→ Question : "Récitez le 1er verset de cette page"
→ TOUT masqué, pas de surbrillance

### Étape 5 : Révélation premier verset (3ème clic)
→ Premier verset visible avec surbrillance dorée

### Étape 6 : Test dernier verset (4ème clic)
→ Question : "Récitez le dernier verset de cette page"
→ TOUT masqué

### Étape 7 : Révélation dernier verset (5ème clic)
→ Dernier verset visible avec surbrillance dorée

### Étape 8 : Prochain tour
→ Retour à l'étape 2 avec un nouveau verset aléatoire

---

## Machine à états

```
[config]
    │ (clic "Commencer")
    ▼
[listening] ←─────────────────────┐  ← FLOU ACTIF
    │ (clic écran)                │
    ▼                             │
[reveal_recited]                  │  ← Flou retiré, masquage actif
    │ (clic)                      │
    ▼                             │
[ask_first]                       │  ← Tout masqué
    │ (clic)                      │
    ▼                             │
[reveal_first]                    │  ← 1er verset visible
    │ (clic)                      │
    ▼                             │
[ask_last]                        │  ← Tout masqué
    │ (clic)                      │
    ▼                             │
[reveal_last]                     │  ← Dernier verset visible
    │ (clic = nouveau tour)       │
    └─────────────────────────────┘
```

---

## Système de flou et masquage (CŒUR de l'application)

### BlurOverlay (pendant listening)
Composant qui applique un flou total sur l'image :
```css
.blur-overlay {
  position: absolute;
  inset: 0;
  backdrop-filter: blur(8px);
  background: rgba(253, 250, 243, 0.7);
  z-index: 15;
}
```
→ Empêche totalement la lecture du texte pendant l'écoute audio

### Cartographie précise des versets (verse-map.json)

Le fichier `public/verse-map.json` contient les bounding boxes précises de chaque verset sur chaque page.
Généré par `scripts/generate-verse-map.js` à partir des données de layout de zonetecde/mushaf-layout.

```typescript
interface VerseBox {
  line: number;      // Numéro de ligne (1-15)
  top: number;       // Position depuis le haut (%)
  height: number;    // Hauteur (%)
  left: number;      // Position depuis la gauche (%)
  right: number;     // Position depuis la droite (%)
  width: number;     // Largeur calculée (%)
}

interface VerseMapEntry {
  surah: number;
  verse: number;
  segments: Array<{
    line: number;
    startWord: number;    // Index du premier mot sur cette ligne
    endWord: number;      // Index du dernier mot sur cette ligne
    totalWordsOnLine: number;
  }>;
  boxes: VerseBox[];      // Bounding boxes précises pour le masquage
}
```

### Constantes de positionnement
```typescript
const PAGE_LAYOUT = {
  marginTop: 11.5,      // % depuis le haut où commence le texte
  marginBottom: 6,      // % depuis le bas
  marginLeft: 7,        // % depuis la gauche
  marginRight: 7,       // % depuis la droite
  linesPerPage: 15,
  lineHeight: 5.5,      // % de hauteur par ligne
};
```

### Hook useVerseMap
```typescript
import { useVerseMap } from '@/hooks/useVerseMap';

const { getVerseOnPage, getMasksExcludingVerse, layout, loading } = useVerseMap();

// Récupère les boxes d'un verset spécifique
const verseData = getVerseOnPage(pageNumber, '2:255');

// Récupère les boxes de TOUS les versets SAUF le visible (pour masquage)
const masks = getMasksExcludingVerse(pageNumber, highlightedVerseKey);
```

### Logique de visibilité par état

| État | Flou | Masquage | Verset visible | Surbrillance |
|------|------|----------|----------------|--------------|
| `listening` | OUI | Non (inutile) | Aucun | Non |
| `reveal_recited` | Non | Tous SAUF target | targetVerse | Oui (doré) |
| `ask_first` | Non | TOUS | Aucun | Non |
| `reveal_first` | Non | Tous SAUF first | firstVerse | Oui (doré) |
| `ask_last` | Non | TOUS | Aucun | Non |
| `reveal_last` | Non | Tous SAUF last | lastVerse | Oui (doré) |

---

## Sources de données

### 1. Images des pages Mushaf
```
public/mushaf-pages/page-{XXX}.png
```
- `{XXX}` = numéro sur 3 chiffres (001-604)
- Images téléchargées depuis QuranFlash Medina Old

### 2. Cartographie des versets (LOCALE)
```
public/verse-map.json
```
- Fichier généré par `scripts/generate-verse-map.js`
- Contient les bounding boxes précises de tous les 6236 versets sur 604 pages
- Structure: `{ metadata: {...}, pages: { "1": { "1:1": { boxes: [...] } } } }`
- Utilisé par `useVerseMap` hook pour le masquage précis au niveau des mots

### 3. Layout source (externe - utilisé pour générer verse-map.json)
```
https://raw.githubusercontent.com/zonetecde/mushaf-layout/refs/heads/main/mushaf/page-{XXX}.json
```
- Fournit la correspondance verset ↔ mots ↔ lignes
- Structure : `{ page, lines: [{ line, type, words: [{ location, ... }] }] }`

### 4. Audio Mahmoud Al-Husary
```
https://cdn.islamic.network/quran/audio/128/ar.husary/{AYAH_NUMBER}.mp3
```
- `AYAH_NUMBER` = numéro global (1-6236)

---

## Mapping Sourate:Verset ↔ Numéro Global

```typescript
const SURAH_START_AYAH = [
  0, 1, 8, 293, 493, 669, 789, 955, 1160, 1235, 1364, 1473, 1596, 1639, 1691, 1750,
  1802, 1901, 2029, 2140, 2250, 2348, 2483, 2595, 2673, 2791, 2855, 2932, 3020, 3089,
  3159, 3217, 3252, 3340, 3409, 3469, 3503, 3585, 3674, 3748, 3802, 3856, 3910, 3963,
  4016, 4053, 4089, 4157, 4186, 4256, 4301, 4358, 4408, 4468, 4510, 4565, 4634, 4698,
  4751, 4776, 4800, 4814, 4825, 4836, 4855, 4867, 4879, 4909, 4961, 5013, 5057, 5085,
  5113, 5156, 5186, 5226, 5263, 5313, 5353, 5399, 5439, 5468, 5494, 5530, 5555, 5580,
  5597, 5617, 5643, 5673, 5703, 5718, 5739, 5754, 5762, 5770, 5789, 5797, 5805, 5816,
  5827, 5838, 5849, 5857, 5866, 5872, 5879, 5886, 5891, 5898, 5904, 5911, 5917, 5923, 5929
];

function toGlobalAyahNumber(surah: number, verse: number): number {
  return SURAH_START_AYAH[surah] + verse;
}

function fromGlobalAyahNumber(globalNumber: number): { surah: number; verse: number } {
  for (let surah = 114; surah >= 1; surah--) {
    if (globalNumber >= SURAH_START_AYAH[surah]) {
      return { surah, verse: globalNumber - SURAH_START_AYAH[surah] };
    }
  }
  return { surah: 1, verse: 1 };
}
```

---

## Types TypeScript

```typescript
interface VersePosition {
  verseKey: string;      // "4:15"
  surah: number;
  verse: number;
  page: number;
  lines: number[];       // [3, 4] si le verset occupe les lignes 3 et 4
  globalNumber: number;
}

interface PageVerses {
  page: number;
  verses: VersePosition[];
  firstVerse: VersePosition | null;
  lastVerse: VersePosition | null;
}

type QuizStep =
  | 'config'
  | 'listening'      // FLOU ACTIF
  | 'reveal_recited'
  | 'ask_first'
  | 'reveal_first'
  | 'ask_last'
  | 'reveal_last';

interface QuizState {
  step: QuizStep;
  config: { startPage: number; endPage: number };
  targetVerse: VersePosition | null;
  currentPage: number;
  revealedVerses: Set<string>;  // verseKeys révélés
}
```

---

## Styles CSS

```css
:root {
  --page-bg: #fdfaf3;
  --highlight-verse: rgba(255, 215, 0, 0.35);
  --frame-green: #2d5016;
}

/* Overlay de flou (pendant listening) */
.blur-overlay {
  position: absolute;
  inset: 0;
  backdrop-filter: blur(8px);
  background: rgba(253, 250, 243, 0.7);
  z-index: 15;
  pointer-events: none;
}

/* Overlay de masquage (couleur fond) */
.verse-mask {
  position: absolute;
  left: 4%;
  right: 4%;
  background-color: var(--page-bg);
  z-index: 10;
  transition: opacity 0.3s ease;
}

/* Verset surligné (révélé) */
.verse-highlighted {
  background: var(--highlight-verse);
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.6);
  z-index: 5;
}
```

---

## Structure du projet

```
src/
├── app/
│   ├── page.tsx
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── MushafPage.tsx        # Image PNG + BlurOverlay + masquage précis via verse-map
│   ├── MushafDoublePage.tsx  # Paire de pages RTL
│   ├── BlurOverlay.tsx       # Filtre flou pendant listening
│   ├── ConfigScreen.tsx      # Écran de configuration
│   └── QuizOverlay.tsx       # Messages du quiz
├── hooks/
│   ├── useQuiz.ts            # Machine à états du quiz
│   ├── usePageVerses.ts      # Fetch layout JSON → positions versets
│   ├── useVerseMap.ts        # Chargement verse-map.json + calcul masques précis
│   ├── useAudio.ts           # Lecture audio
│   └── useOrientation.ts     # Détection orientation
├── utils/
│   ├── ayahMapping.ts        # SURAH_START_AYAH + conversions
│   └── maskCalculations.ts   # Constantes de positionnement
├── types/
│   └── index.ts
scripts/
└── generate-verse-map.js     # Script de génération de verse-map.json
public/
├── mushaf-pages/             # 604 images PNG (page-001.png à page-604.png)
└── verse-map.json            # Cartographie des 6236 versets (bounding boxes)
```

---

## Points critiques

1. **NE JAMAIS réécrire le texte arabe** - Utiliser uniquement les images PNG
2. **FLOU pendant listening** - backdrop-filter: blur(8px) + overlay semi-opaque
3. **Masquage précis** - Utiliser `verse-map.json` pour masquer au niveau des mots
4. **Double page OBLIGATOIRE** - Toujours 2 pages visibles
5. **RTL** - Page impaire à DROITE, page paire à GAUCHE
6. **useVerseMap hook** - Charger la cartographie et calculer les masques précis
7. **Surbrillance dorée** - Uniquement pour le verset révélé dans les états reveal_*

---

## Résumé du comportement visuel

1. **LISTENING** : Image totalement floutée + overlay semi-opaque → impossible de lire
2. **REVEAL_RECITED** : Flou retiré, tous versets masqués SAUF le verset récité (visible + doré)
3. **ASK_FIRST** : Tout masqué, pas de surbrillance
4. **REVEAL_FIRST** : Premier verset visible + doré, reste masqué
5. **ASK_LAST** : Tout masqué
6. **REVEAL_LAST** : Dernier verset visible + doré, reste masqué
7. Retour à 1 avec nouveau verset aléatoire

---

## Ressources

- **Layout JSON** : https://github.com/zonetecde/mushaf-layout
- **Audio Husary** : https://cdn.islamic.network/quran/audio/128/ar.husary/
- **Images Mushaf** : Stockées localement dans `public/mushaf-pages/`
