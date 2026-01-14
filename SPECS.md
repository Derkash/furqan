# Fourqan - Spécifications

## Description
Application web de révision/mémorisation du Coran utilisant les images PNG du Mushaf Medina Old (1405H) avec audio Mahmoud Khalil Al-Husary et un système de masquage par overlay.

---

## Stack Technique
- **Framework**: Next.js 14+ avec App Router
- **Langage**: TypeScript
- **Styles**: Tailwind CSS

---

## Architecture : Masquage d'Images PNG

### Principe
Les images PNG contiennent déjà le texte arabe. On masque les versets avec des overlays de couleur `#fdfaf3`.

### Sources de données
- **Images** : `public/mushaf-pages/page-XXX.png` (604 images locales)
- **Layout** : `https://raw.githubusercontent.com/zonetecde/mushaf-layout/refs/heads/main/mushaf/page-XXX.json`
- **Audio** : `https://cdn.islamic.network/quran/audio/128/ar.husary/{AYAH_NUMBER}.mp3`

---

## Système de Masquage

### Constantes
```
PAGE_MARGIN_TOP = 12%
PAGE_MARGIN_BOTTOM = 5%
LINES_PER_PAGE = 15
LINE_HEIGHT = 5.53%
```

### États du Quiz
| État | Masquage |
|------|----------|
| `listening` | Tout masqué |
| `reveal_recited` | Verset cible visible (surligné) |
| `ask_first` | Tout masqué |
| `reveal_first` | Premier verset visible |
| `ask_last` | Tout masqué |
| `reveal_last` | Dernier verset visible |

---

## Structure des Composants

```
src/
├── components/
│   ├── MushafPage.tsx        # Image + overlays
│   ├── MushafDoublePage.tsx  # Double page RTL
│   ├── VerseMask.tsx         # Overlay de masquage
│   ├── ConfigScreen.tsx
│   └── QuizOverlay.tsx
├── hooks/
│   ├── useQuiz.ts            # Machine à états
│   ├── usePageVerses.ts      # Fetch layout JSON
│   ├── useAudio.ts
│   └── useOrientation.ts
├── utils/
│   ├── ayahMapping.ts        # Conversion sourate:verset ↔ global
│   └── maskCalculations.ts   # Calcul positions overlay
└── types/
    └── index.ts
```

---

## Changelog

### 2026-01-14
- Initialisation du projet
- **CHANGEMENT MAJEUR** : Architecture masquage d'images PNG
- Abandon de l'approche polices QCF
- Téléchargement des 604 images Mushaf (92 MB)
- Système de masquage par overlay coloré
