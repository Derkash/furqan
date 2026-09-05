# Récitation adaptative — plan d'implémentation

Source : `Prompt_Claude_Code_Recitation_Adaptative.md` (20 sections) + 3 maquettes.
Arbitrages validés le 2026-09-05 :

- **Priorité iPhone**, puis web. Widget + Live Activity font partie du périmètre principal.
- Texte arabe de la carte « Votre passage » : **découpe de l'image du mushaf** (jamais de texte régénéré).
- Stockage : **Supabase (schéma `app` + RPC) avec miroir local** pour l'hors-ligne.

---

## 1. État du projet — ce qui est déjà là, ce qui manque

| Élément | État | Action |
|---|---|---|
| Target iPhone | ✅ `TARGETED_DEVICE_FAMILY = "1,2"` | Rien |
| Équipe de signature | ✅ `DEVELOPMENT_TEAM = 3ZPRX5D49W`, signature automatique | Rien |
| Deployment target | ⚠️ `IPHONEOS_DEPLOYMENT_TARGET = 15.0` | Le Live Activity exige **iOS 16.2+** → l'extension aura sa propre cible 16.2, l'app reste en 15.0 avec `if #available` |
| Extension WidgetKit | ❌ absente | Nouveau target `Recitation` (widget + Live Activity dans la même extension) |
| App Group | ❌ absent | `group.com.almuraja3a.app` sur les 2 targets — c'est le seul canal de données WebView → widget |
| Pont Capacitor | ❌ absent | Plugin Swift local `RecitationBridge` |
| Notifications locales | ❌ dépendance absente | `@capacitor/local-notifications` |
| Moteur de planification | ❌ | Module TypeScript pur, partagé web + iPhone |
| Persistance | Partielle (`0001_init_progress.sql`) | Migration `0004_recitation.sql`, même patron RPC `SECURITY DEFINER` |

## 2. Architecture

Un seul moteur, trois surfaces.

```
                    ┌───────────────────────────────┐
                    │  Moteur TypeScript (pur)      │
                    │  périmètre → cycle → jours    │
                    │  → créneaux → pages           │
                    │  + renforcement + reports     │
                    └───────────────┬───────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
      Écrans Next.js       Supabase + miroir        RecitationBridge
      (WebView iPhone       localStorage            (plugin Capacitor Swift)
       + iPad + web)                                       │
                                                  App Group partagé
                                                  (JSON d'état de session)
                                                           │
                                            ┌──────────────┴──────────────┐
                                     Widget écran d'accueil        Live Activity
                                        (WidgetKit)                 (ActivityKit)
```

**Point de conception important — le compte à rebours.** Un widget iOS ne peut pas se
rafraîchir chaque minute (budget de recharges limité par le système). Le temps restant
sera donc rendu avec `Text(timerInterval:)` : le décompte s'anime tout seul, sans aucune
recharge. On ne pousse un `WidgetCenter.reloadAllTimelines()` que sur un vrai événement :
page cochée, créneau démarré, session terminée. Même principe pour le Live Activity —
`update` seulement quand la progression change.

### API du pont

```swift
RecitationBridge.syncState(json)      // écrit l'état dans l'App Group + recharge le widget
RecitationBridge.startLiveActivity()  // au démarrage d'un créneau
RecitationBridge.updateLiveActivity() // à chaque page cochée
RecitationBridge.endLiveActivity()    // fin de créneau ou session terminée
```

Deep link : `widgetURL(URL(string: "almuraja3a://recitation/current"))` → intercepté par
`appUrlOpen` côté Capacitor → `router.push('/recitation/en-cours')`.

## 3. Écrans

| # | Écran | Route | Sections du brief |
|---|---|---|---|
| 1 | Ce que je connais | `/recitation/perimetre` | 1 |
| 2 | Mon objectif | `/recitation/objectif` | 2 |
| 3 | Jours & horaires | `/recitation/horaires` | 3 |
| 4 | Répartition par créneau | `/recitation/repartition` | 4 |
| 5 | Mon programme | `/recitation` | 5 |
| 6 | **Récitation en cours** (maquette 1) | `/recitation/en-cours` | 6, 7 |
| 7 | Évaluation (feuille modale) | — | 8 |
| 8 | Maîtrise | `/recitation/maitrise` | 10 |
| 9 | Bilan de cycle | `/recitation/bilan` | 17 |
| 10 | Historique | `/recitation/historique` | 18 |
| — | Carte d'accueil | `/exercises` (ajout) | 11 |
| — | Widget iPhone (maquette 2) | extension | 12 |
| — | Live Activity (maquette 3) | extension | 13 |

Navigation : entrée **RÉCITATION** ajoutée dans la barre d'`AppShell`, comme sur la maquette 1.
L'accueil actuel n'est pas remplacé — on y ajoute seulement la carte de synthèse.

## 4. Parcours fonctionnel

**Mise en place (une fois)**
1. « Ce que je connais » — plages de sourates / sourates / juz' / plages de pages / pages
   à l'unité, cumulables. Dédoublonnage : une page comptée une seule fois. Résumé avant
   validation (sourates, juz', total de pages, première et dernière page, durée d'un cycle).
2. « Mon objectif » — ½ juz'/j, 1 juz'/j, 2 juz'/j, N pages/j, « tout en X jours », perso.
   Aperçu jour par jour **avec les pages réelles**, pas seulement le nom du juz'.
3. « Jours & horaires » — jours actifs, plage horaire, fréquence (1/2/3/4 h, perso, manuel).
4. « Répartition » — auto ou manuelle. Si l'objectif n'est pas tenable : alerte + les quatre
   issues (plus de pages par créneau, plus de créneaux, plage élargie, cycle allongé).

**Boucle quotidienne**
5. Notification à l'ouverture du créneau → « Votre récitation de 18 h à 19 h est prête :
   pages 3 à 6. »
6. Le widget et l'écran verrouillé affichent la progression sans ouvrir l'app.
7. « Récitation en cours » : parcours page par page, carte « Votre passage » (début exact /
   fin exacte), « Marquer la page comme récitée », « Reprendre à la page X ».
8. Après chaque page : évaluation en 4 niveaux (maîtrisée / plutôt maîtrisée / fragile /
   à retravailler), note facultative, possibilité de reporter l'évaluation.
9. Fin de créneau incomplet → report / continuer / replanifier / non réalisée, selon la
   préférence enregistrée.
10. Fin de cycle → bilan + proposition de rythme, **jamais appliquée sans accord explicite**.

## 5. Règles à ne pas casser

- Le texte arabe vient toujours du mushaf (images + `verse-map.json`), jamais régénéré.
- Lecture droite→gauche respectée partout.
- Jamais la couleur seule pour un niveau de maîtrise : toujours libellé ou icône.
- Ton non culpabilisant : pas de série à ne pas briser, pas de score de compétition.
- L'app ne modifie jamais l'objectif toute seule.
- Une seule bonne récitation ne suffit pas à déclarer une page maîtrisée.
- L'historique n'est jamais perdu quand le programme est modifié.

## 6. État d'avancement

- ✅ **Phase 1** — moteur + migration 0004 + 34 vérifications (commit 5c9e5e9)
- ✅ **Phases 2-3-5** — tous les écrans web (commit 6363bbe) : setup 4 étapes,
  Mon programme, Récitation en cours, Maîtrise, Bilan, Historique, carte
  d'accueil, entrée RÉCITATION, notifications locales, dayEngine (reports,
  rattrapage, bascule de cycle), pont widgetSync côté JS
- ✅ **Phase 4** — natif iPhone : plugin `RecitationBridge` (App Group +
  WidgetCenter + ActivityKit), extension `RecitationWidget` (widget accueil
  iOS 17+ ; Live Activity écran verrouillé + Dynamic Island), entitlements
  App Group des deux côtés, deep link `almuraja3a://recitation/en-cours`,
  orientation : verrou paysage restreint à l'iPad (iPhone libre/portrait),
  SceneDelegate corrigé pour instancier MainViewController
- ⚠️ **À faire côté utilisateur** :
  1. Portail développeur Apple : la signature automatique devrait créer
     l'App Group `group.com.almuraja3a.app` à la première build Xcode ;
     sinon le créer manuellement (Certificates → Identifiers → App Groups).
  2. Appliquer la migration : `supabase db push` (0004_recitation.sql).
  3. Builder sur l'iPhone physique : `npm run build:ipad` puis Xcode → cible
     App → son iPhone (widget + Live Activity ne se testent bien que sur
     appareil réel).

## 7. Découpage initial (mémoire)

**Phase 1 — Moteur + données** (prérequis de tout le reste)
Module de planification pur et testable, types, migration `0004_recitation.sql`, miroir local.

**Phase 2 — Écrans de mise en place** — périmètre, objectif, horaires, répartition (sections 1→4).

**Phase 3 — Récitation en cours** — maquette 1, carte « Votre passage » avec découpe
d'image, évaluation, « Mon programme » (sections 5→8, 11).

**Phase 4 — Natif iPhone** — App Group, plugin `RecitationBridge`, extension WidgetKit
(maquette 2), Live Activity (maquette 3), notifications locales (sections 12→14).

**Phase 5 — Adaptatif & bilan** — renforcement, reports, rattrapage, maîtrise, bilan,
historique (sections 9, 10, 15→19).
