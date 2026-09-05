# Prompt Claude Code — Programme de récitation adaptatif

Je veux que tu développes dans mon application **Al Muraja3a** une fonctionnalité complète de planification et de suivi de la récitation du Coran.

La fonctionnalité doit permettre à l’utilisateur de déclarer ce qu’il connaît, de choisir un rythme de récitation, puis de laisser l’application construire automatiquement un programme cohérent sur plusieurs jours. L’application doit ensuite répartir l’objectif de chaque journée entre les différents créneaux horaires définis par l’utilisateur et adapter progressivement les révisions selon le niveau de maîtrise déclaré pour chaque page.

Il ne s’agit donc pas seulement d’ajouter des rappels horaires, mais de créer un véritable programme personnel de récitation et de révision.

L’ensemble doit respecter l’identité visuelle et les habitudes de navigation actuelles de l’application : fond clair, vert profond, touches dorées, cartes arrondies, interface calme, lisible et non culpabilisante.

## 1. Déclarer ce que l’utilisateur connaît

Créer un écran intitulé **« Ce que je connais »**.

L’utilisateur doit pouvoir déclarer son périmètre mémorisé de plusieurs manières :

- sélectionner une plage continue de sourates, par exemple de la sourate Al-Baqara à la sourate An-Nisa ;
- sélectionner une ou plusieurs sourates entières ;
- sélectionner un ou plusieurs juz’ entiers ;
- sélectionner une plage continue de pages ;
- cocher des pages individuellement ;
- combiner plusieurs de ces méthodes.

Pour une plage de sourates, proposer deux sélecteurs :

- « De la sourate… » ;
- « Jusqu’à la sourate… ».

Pour les juz’, afficher les 30 juz’ avec une case à cocher.

Pour les sourates, afficher les 114 sourates avec leur numéro, leur nom et une case permettant de sélectionner toute la sourate. Prévoir une recherche par nom ou numéro.

Pour les pages, permettre :

- de cocher chaque page ;
- de sélectionner rapidement une plage, par exemple des pages 3 à 62 ;
- de tout sélectionner ou tout désélectionner ;
- de voir les sourates et les versets contenus dans chaque page.

Si une page est comprise dans plusieurs sélections, elle ne doit être comptée qu’une seule fois.

Avant validation, afficher un résumé clair :

- sourates concernées ;
- juz’ concernés ;
- nombre total de pages mémorisées ;
- première et dernière page du périmètre ;
- estimation de la durée d’un cycle complet selon le rythme choisi.

Le périmètre mémorisé doit pouvoir évoluer. L’utilisateur peut ajouter de nouvelles pages ou de nouvelles sourates sans perdre son historique précédent.

## 2. Créer un objectif de récitation sur plusieurs jours

À partir du périmètre mémorisé, l’utilisateur doit pouvoir choisir son objectif.

Proposer notamment :

- un demi-juz’ par jour ;
- un juz’ par jour ;
- deux juz’ par jour ;
- un nombre personnalisé de pages par jour ;
- terminer tout le périmètre en un nombre choisi de jours ;
- un objectif entièrement personnalisé.

L’application doit construire automatiquement un cycle de récitation sur plusieurs jours.

Exemple : si l’utilisateur connaît trois juz’ et choisit de réciter un juz’ par jour :

- Jour 1 : premier juz’ ;
- Jour 2 : deuxième juz’ ;
- Jour 3 : troisième juz’ ;
- Jour 4 : début d’un nouveau cycle avec le premier juz’.

Autre exemple : si l’utilisateur connaît deux juz’ et souhaite terminer un cycle en quatre jours, l’application répartit le périmètre sur quatre journées, soit environ un demi-juz’ par jour.

L’application doit toujours respecter l’ordre du mushaf, sauf si l’utilisateur choisit volontairement un ordre personnalisé.

Avant d’enregistrer le programme, présenter un aperçu :

- Jour 1 — contenu prévu — pages X à Y ;
- Jour 2 — contenu prévu — pages X à Y ;
- Jour 3 — contenu prévu — pages X à Y ;
- date estimée de fin du cycle ;
- date estimée de début du cycle suivant.

Si une journée commence ou se termine au milieu d’un juz’ ou d’une sourate, afficher les pages réellement prévues et non uniquement le nom du juz’.

## 3. Configurer les jours et les horaires

Créer dans le programme une partie **« Jours et horaires »**.

L’utilisateur doit pouvoir définir :

- les jours actifs de la semaine ;
- l’heure de début de sa journée de récitation ;
- l’heure de fin ;
- la fréquence des créneaux ;
- éventuellement des horaires différents selon les jours.

Fréquences proposées :

- toutes les heures ;
- toutes les 2 heures ;
- toutes les 3 heures ;
- toutes les 4 heures ;
- fréquence personnalisée ;
- créneaux saisis manuellement.

Exemple : pour une plage active de 8 h à 20 h avec une fréquence de 2 heures :

- 8 h–10 h ;
- 10 h–12 h ;
- 12 h–14 h ;
- 14 h–16 h ;
- 16 h–18 h ;
- 18 h–20 h.

L’utilisateur doit pouvoir activer ou désactiver les rappels de récitation.

## 4. Répartir automatiquement l’objectif quotidien

L’application doit répartir l’objectif du jour entre les créneaux disponibles.

Exemple : si l’objectif quotidien est de 20 pages et que six créneaux sont disponibles, l’application peut proposer :

- 8 h–10 h : 4 pages ;
- 10 h–12 h : 4 pages ;
- 12 h–14 h : 3 pages ;
- 14 h–16 h : 3 pages ;
- 16 h–18 h : 3 pages ;
- 18 h–20 h : 3 pages.

La répartition doit être aussi équilibrée que possible tout en respectant l’ordre des pages.

Proposer deux modes :

### Répartition automatique

L’application calcule le nombre de pages de chaque créneau.

### Répartition personnalisée

L’utilisateur décide lui-même du nombre de pages à réciter pour chaque créneau.

Si les horaires choisis ne permettent pas raisonnablement d’atteindre l’objectif, l’application doit prévenir l’utilisateur et lui proposer :

- d’augmenter le nombre de pages par créneau ;
- d’ajouter des créneaux ;
- d’élargir la plage horaire ;
- de prolonger le cycle sur davantage de jours.

## 5. Écran « Mon programme »

Créer une page permettant de consulter le programme global.

Elle doit afficher :

- la position actuelle dans le cycle, par exemple « Cycle de 3 jours — Jour 2 sur 3 » ;
- l’objectif du jour ;
- le nombre de pages déjà récitées ;
- les créneaux de la journée ;
- le contenu prévu pour chaque créneau ;
- les prochains jours du programme ;
- la date estimée de fin du cycle.

Exemple :

- 8 h–10 h — Pages 22 à 25 — Terminée ;
- 10 h–12 h — Pages 26 à 29 — En cours ;
- 12 h–14 h — Pages 30 à 32 — À venir.

Afficher également un résumé du type :

- « Aujourd’hui : 7 pages sur 20 récitées » ;
- « Cycle complet : 27 pages sur 60 récitées » ;
- « Prochaine récitation à 12 h ».

L’utilisateur doit pouvoir consulter les journées précédentes et les journées à venir.

## 6. Page dédiée « Récitation en cours »

Créer une véritable page dédiée à la récitation du créneau actuel. Il ne faut pas remplacer la page d’accueil par cette page.

Cette page doit indiquer immédiatement :

- le créneau en cours, par exemple « Votre objectif de 18 h à 19 h » ;
- le temps restant avant la fin du créneau ;
- les pages à réciter ;
- le nombre de pages déjà récitées ;
- le nombre de pages restantes ;
- la prochaine page à réciter ;
- la ou les sourates concernées.

Exemple :

- « Pages 3 à 6 » ;
- « 2 pages sur 4 récitées » ;
- « Reprendre à la page 5 » ;
- « 37 minutes restantes ».

Afficher le parcours page par page :

- Page 3 — Récitée ;
- Page 4 — Récitée ;
- Page 5 — À réciter maintenant ;
- Page 6 — À suivre.

Chaque page doit pouvoir être cochée ou décochée individuellement.

Prévoir une action principale :

**« Marquer la page comme récitée »**

Lorsque la page est validée, l’application met à jour l’avancement et sélectionne automatiquement la prochaine page.

## 7. Afficher précisément le début et la fin du passage

Dans la page « Récitation en cours », afficher une carte **« Votre passage »**.

Pour le début, afficher :

- « DÉBUT · PAGE X » ;
- « Commencez ici » ;
- le début exact du premier verset à réciter sur la première page du créneau.

Pour la fin, afficher :

- « FIN · PAGE Y » ;
- « Terminez ici » ;
- la fin exacte du dernier verset à réciter sur la dernière page du créneau.

Le texte coranique doit toujours provenir du contenu fiable déjà utilisé par l’application. Il ne doit jamais être généré ou reconstitué approximativement.

Respecter le sens de lecture de droite à gauche, les signes diacritiques et la présentation actuelle du texte arabe.

Ajouter un bouton :

**« Reprendre à la page X »**

Ce bouton ouvre la récitation directement sur la première page non terminée.

## 8. Évaluer simplement la maîtrise d’une page

Après avoir récité une page, l’utilisateur doit pouvoir indiquer son niveau global de maîtrise sans déclarer toutes les fautes commises.

Proposer quatre niveaux :

### Maîtrisée

Récitation fluide, sans blocage significatif.

### Plutôt maîtrisée

Quelques hésitations, mais récitation globalement correcte.

### Fragile

Plusieurs hésitations ou rappels nécessaires. La page doit être revue prochainement.

### À retravailler

Récitation difficile. La page nécessite un renforcement rapproché.

Ces quatre choix doivent être simples, rapides et visuellement graduels.

L’utilisateur doit aussi pouvoir :

- ajouter une courte note facultative ;
- modifier son évaluation ;
- passer l’évaluation et la renseigner plus tard.

Une seule bonne récitation ne doit pas suffire à considérer définitivement une page comme maîtrisée. L’application doit observer l’évolution de plusieurs récitations.

## 9. Révision normale et renforcement adaptatif

Séparer clairement deux mécanismes.

### Cycle principal

Il garantit que toutes les pages mémorisées sont récitées dans l’ordre et dans la durée prévue.

### Renforcement

Il permet de revoir plus fréquemment les pages fragiles ou à retravailler.

Une page difficile peut être ajoutée :

- au début d’un prochain créneau ;
- dans une courte session supplémentaire ;
- dans un bloc spécial « Pages à renforcer ».

Le renforcement ne doit pas désorganiser entièrement le cycle normal ni empêcher l’utilisateur d’avancer.

Règles fonctionnelles proposées :

- une page « Maîtrisée » revient normalement au cycle suivant ;
- une page « Plutôt maîtrisée » suit le cycle normal ;
- une page « Fragile » est reproposée dans les 2 ou 3 jours ;
- une page « À retravailler » est reproposée le lendemain ou dans le prochain créneau de renforcement disponible.

L’utilisateur doit pouvoir activer ou désactiver le renforcement adaptatif.

L’application doit pouvoir expliquer simplement pourquoi une page est reproposée, par exemple :

« Cette page vous est proposée aujourd’hui car elle a été évaluée “Fragile” lors de votre dernière récitation. »

## 10. Visualiser la maîtrise

Créer une page **« Maîtrise »**.

Permettre une consultation :

- par page ;
- par sourate ;
- par hizb ;
- par juz’ ;
- sur l’ensemble du périmètre mémorisé.

Pour chaque élément, distinguer :

- le niveau de maîtrise ;
- le nombre de pages déjà évaluées ;
- les pages jamais évaluées ;
- la date de dernière récitation ;
- la prochaine révision prévue.

Exemple :

« Juz’ 1 — Maîtrise : 82 % — 18 pages évaluées sur 20 »

La représentation doit rester graduelle :

- maîtrisée ;
- plutôt maîtrisée ;
- fragile ;
- à retravailler ;
- jamais évaluée.

Ne pas utiliser uniquement des couleurs : toujours accompagner la couleur d’un libellé ou d’une icône.

En ouvrant une page, l’utilisateur doit pouvoir consulter :

- son niveau actuel ;
- ses dernières évaluations ;
- sa dernière récitation ;
- sa prochaine révision ;
- la raison de cette prochaine révision ;
- ses notes éventuelles ;
- une action « Réciter cette page ».

## 11. Carte sur l’écran d’accueil

L’écran d’accueil actuel doit être conservé.

Ajouter uniquement une carte de synthèse ouvrant la page dédiée.

Lorsqu’une récitation est en cours, afficher par exemple :

- « Récitation en cours » ;
- « 2 pages sur 4 » ;
- « Pages 3 à 6 » ;
- « 37 minutes restantes » ;
- bouton « Continuer ».

Lorsqu’aucune récitation n’est en cours, afficher la prochaine session :

« Prochaine récitation à 20 h — pages 7 à 10 »

## 12. Widget de l’écran d’accueil du téléphone

Créer un widget permettant de voir sans ouvrir l’application :

- le créneau actuel ;
- les pages prévues ;
- le nombre de pages récitées ;
- le nombre de pages restantes ;
- une progression visuelle ;
- le temps restant avant la fin du créneau.

Exemple :

- « Récitation en cours » ;
- « 2 / 4 pages récitées » ;
- « Encore 2 pages avant 19 h » ;
- « 37 minutes restantes ».

Un appui sur le widget doit ouvrir directement la page « Récitation en cours ».

## 13. Écran verrouillé

Afficher la récitation active sur l’écran verrouillé sous la forme d’une activité en direct, dans le même esprit qu’un suivi d’exercice.

Elle doit afficher :

- « Al Muraja3a » ;
- « 2 / 4 pages » ;
- une progression visuelle ;
- le compte à rebours jusqu’à la fin du créneau ;
- un accès direct à la session.

L’affichage doit évoluer lorsque l’utilisateur valide une page et disparaître lorsque la session est terminée.

## 14. Notifications

Au début d’un créneau, prévenir l’utilisateur :

« Votre récitation de 18 h à 19 h est prête : pages 3 à 6. »

Permettre un rappel avant la fin du créneau, par exemple :

« Il vous reste 15 minutes et 2 pages à réciter. »

L’utilisateur doit pouvoir choisir :

- d’activer ou désactiver les notifications ;
- combien de temps avant la fin il souhaite être rappelé ;
- s’il souhaite un rappel supplémentaire en cas de session non commencée.

Un appui sur une notification doit ouvrir directement la session concernée.

## 15. Sessions incomplètes et reports

Si le créneau se termine avant que toutes les pages soient récitées, proposer :

- « Reporter les pages restantes » ;
- « Continuer sans modifier la suite » ;
- « Replanifier » ;
- « Marquer la session comme non réalisée ».

L’utilisateur doit pouvoir définir un comportement préféré :

- reporter automatiquement ;
- ne jamais reporter ;
- toujours demander.

En cas de report, les pages restantes doivent être placées avant les nouvelles pages, sans créer de doublons.

## 16. Journée manquée ou retard important

Si une session ou une journée entière n’a pas été réalisée, ne pas surcharger automatiquement toute la journée suivante.

Proposer :

- « Rattraper progressivement » ;
- « Décaler le cycle » ;
- « Reprendre aujourd’hui sans rattrapage » ;
- « Replanifier manuellement ».

En cas de rattrapage progressif, répartir les pages restantes sur plusieurs créneaux futurs en limitant la surcharge.

Dans tous les cas, conserver l’information indiquant que certaines pages du cycle n’ont pas été récitées.

## 17. Bilan du cycle et adaptation du rythme

À la fin de chaque cycle, afficher un bilan :

- pages prévues ;
- pages réellement récitées ;
- pages non récitées ;
- pages maîtrisées ;
- pages plutôt maîtrisées ;
- pages fragiles ;
- pages à retravailler ;
- pages jamais évaluées ;
- évolution par rapport au cycle précédent.

À partir de ce bilan, l’application peut proposer un ajustement.

Exemples :

- « Votre maîtrise est stable : vous pouvez conserver un juz’ par jour. » ;
- « Plusieurs pages restent fragiles : conservez ce rythme et ajoutez un temps de renforcement. » ;
- « Vos deux premiers juz’ sont bien maîtrisés : vous pouvez essayer de les réciter sur deux jours. »

L’application ne doit jamais modifier automatiquement l’objectif sans l’accord de l’utilisateur.

Proposer :

- « Appliquer cette proposition » ;
- « Garder mon programme » ;
- « Ajuster manuellement ».

## 18. Historique et statistiques

Permettre de consulter :

- les sessions terminées ;
- les sessions incomplètes ;
- les pages récitées ;
- les évaluations données ;
- les cycles terminés ;
- le nombre de pages récitées par jour, semaine et mois ;
- les pages non récitées depuis longtemps ;
- les pages régulièrement difficiles ;
- les juz’ les mieux maîtrisés ;
- les juz’ nécessitant le plus de renforcement.

Les statistiques doivent aider l’utilisateur à organiser sa révision. Elles ne doivent pas transformer l’application en compétition ni culpabiliser l’utilisateur.

## 19. Modification du programme

L’utilisateur doit pouvoir modifier à tout moment :

- son périmètre mémorisé ;
- son objectif quotidien ;
- la durée du cycle ;
- ses jours actifs ;
- ses horaires ;
- la fréquence des créneaux ;
- le mode de report ;
- le renforcement adaptatif ;
- les notifications.

Si une modification intervient pendant une session ou un cycle en cours, demander si elle doit s’appliquer :

- immédiatement ;
- à partir du prochain créneau ;
- à partir du lendemain ;
- au prochain cycle.

L’historique déjà enregistré ne doit pas être perdu.

## 20. Expérience utilisateur attendue

Le parcours final doit être le suivant :

1. L’utilisateur déclare ce qu’il connaît.
2. Il choisit un objectif, par exemple « un juz’ par jour ».
3. Il configure ses jours et ses horaires de récitation.
4. L’application construit automatiquement un cycle sur plusieurs jours.
5. Elle répartit l’objectif quotidien entre les créneaux disponibles.
6. À chaque créneau, elle indique précisément les pages à réciter, le point de départ et le point d’arrêt.
7. L’utilisateur valide les pages récitées et indique simplement leur niveau de maîtrise.
8. L’application poursuit le cycle principal tout en reproposant les pages difficiles dans des temps de renforcement.
9. Le widget, l’écran verrouillé et les notifications permettent de suivre la session sans devoir rechercher l’information dans l’application.
10. À la fin du cycle, l’application présente un bilan et propose éventuellement un rythme mieux adapté.

La fonctionnalité doit donner à l’utilisateur la sensation que l’application sait ce qu’il connaît, sait ce qu’il a déjà récité et lui présente au bon moment la prochaine partie à travailler.

Avant de commencer le développement, présente-moi les écrans et le parcours fonctionnel que tu proposes afin que je puisse les valider.
