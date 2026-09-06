// Vérification du moteur de récitation contre les exemples EXACTS du brief
// (widget/Prompt_Claude_Code_Recitation_Adaptative.md).
// Lancer : npx tsx scripts/check-recitation-engine.ts

import { perimeterPages, perimeterSummary } from '../src/lib/recitation/perimeter';
import {
  buildCycleDays,
  carryOverPages,
  checkFeasibility,
  splitPagesAcrossSlots,
} from '../src/lib/recitation/planner';
import {
  cycleDayDates,
  currentSlot,
  formatTime,
  nextSlot,
  parseTime,
  slotsForWeekday,
} from '../src/lib/recitation/schedule';
import {
  currentLevel,
  masteryBreakdown,
  reinforcementDuePages,
} from '../src/lib/recitation/mastery';
import {
  learningPagesForDay,
  learningProgress,
  learningSlot,
  learningSpan,
} from '../src/lib/recitation/learning';
import { pageRefLabel, pagesLabel } from '../src/lib/recitation/labels';
import { duePages, pendingOverdue } from '../src/lib/recitation/dayEngine';
import { buildNotificationPlan } from '../src/lib/recitation/notifications';
import type {
  DayState,
  LearningConfig,
  PageEvaluation,
  PlannedSlot,
  Program,
  ScheduleConfig,
} from '../src/lib/recitation/types';

function mkProgram(carryOver: Program['carryOver']): Program {
  return {
    selections: [],
    perimeterPages: [3, 4, 5, 6],
    objective: { kind: 'pagesPerDay', pages: 4 },
    schedule: {
      activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
      hours: { startMin: 600, endMin: 720, frequencyMin: 60 },
      remindersEnabled: true,
    },
    slotSplit: { mode: 'auto' },
    carryOver,
    reinforcementEnabled: false,
    endReminderMin: 15,
    learning: null,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
  };
}

function mkState(slots: PlannedSlot[]): DayState {
  return {
    date: '2026-09-06',
    cycleDayIndex: 0,
    slots,
    recitedPages: [],
    learningRecited: [],
    pendingEvaluations: [],
    closedSlots: [],
    overdueDecision: null,
    reinforcementPages: [],
    pendingCatchUp: [],
  };
}

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}\n      attendu : ${e}\n      obtenu  : ${a}`);
  }
}

// ---------------------------------------------------------------------------
console.log('§1 Périmètre : déduplication et résumé');
// Juz' 1 (pages 1-21) + sourate Al-Fatihah (page 1) + pages 3 à 5 : recouvrements.
{
  const pages = perimeterPages([
    { kind: 'juz', juz: 1 },
    { kind: 'surah', surah: 1 },
    { kind: 'page-range', fromPage: 3, toPage: 5 },
  ]);
  check('pages uniques (juz 1 = 21 pages, recouvrements ignorés)', pages.length, 21);
  check('triées, de 1 à 21', [pages[0], pages[pages.length - 1]], [1, 21]);
  const s = perimeterSummary(pages);
  check('résumé : juz 1 complet', s.completeJuzs, [1]);
  check('résumé : sourates 1 et 2 touchées', s.surahs, [1, 2]);
}

// ---------------------------------------------------------------------------
console.log('§2 Cycle : « 3 juz\' connus, 1 juz\'/jour » → un juz\' entier par jour');
{
  const pages = perimeterPages([
    { kind: 'juz', juz: 1 },
    { kind: 'juz', juz: 2 },
    { kind: 'juz', juz: 3 },
  ]);
  const days = buildCycleDays(pages, { kind: 'juzPerDay', amount: 1 });
  check('3 jours', days.length, 3);
  check('jour 1 = juz 1 (pages 1-21)', [days[0].pages[0], days[0].pages.at(-1)], [1, 21]);
  check('jour 2 = juz 2 (pages 22-41)', [days[1].pages[0], days[1].pages.at(-1)], [22, 41]);
  check('jour 3 = juz 3 (pages 42-61)', [days[2].pages[0], days[2].pages.at(-1)], [42, 61]);
}

console.log('§2 Cycle : « 2 juz\', terminer en 4 jours » → ≈ ½ juz\'/jour équilibré');
{
  const pages = perimeterPages([{ kind: 'juz', juz: 1 }, { kind: 'juz', juz: 2 }]); // 41 pages
  const days = buildCycleDays(pages, { kind: 'totalDays', days: 4 });
  check('4 jours', days.length, 4);
  check('répartition équilibrée 11/10/10/10', days.map((d) => d.pages.length), [11, 10, 10, 10]);
  check('ordre du mushaf conservé', days.flatMap((d) => d.pages), pages);
}

console.log('§2 Cycle : N pages/jour (7 pages/j sur 20 pages) → 7/7/6');
{
  const pages = Array.from({ length: 20 }, (_, i) => i + 3); // pages 3-22
  const days = buildCycleDays(pages, { kind: 'pagesPerDay', pages: 7 });
  check('3 jours de 7/7/6', days.map((d) => d.pages.length), [7, 7, 6]);
}

console.log('§2 Cycle : ½ juz\'/jour = frontières de hizb');
{
  const pages = perimeterPages([{ kind: 'juz', juz: 1 }]);
  const days = buildCycleDays(pages, { kind: 'juzPerDay', amount: 0.5 });
  check('juz 1 seul → 2 demi-journées (hizb 1 et 2)', days.length, 2);
}

// ---------------------------------------------------------------------------
console.log('§3 Horaires : 8 h → 20 h toutes les 2 h → 6 créneaux');
const config: ScheduleConfig = {
  activeWeekdays: [1, 2, 3, 4, 5], // lundi → vendredi
  hours: { startMin: parseTime('08:00')!, endMin: parseTime('20:00')!, frequencyMin: 120 },
  remindersEnabled: true,
};
const config2Schedule = config;
{
  const slots = slotsForWeekday(config, 1);
  check('6 créneaux', slots.length, 6);
  check('premier = 8 h-10 h', [slots[0].startMin, slots[0].endMin], [480, 600]);
  check('dernier = 18 h-20 h', [slots[5].startMin, slots[5].endMin], [1080, 1200]);
  check('jour inactif (dimanche) → aucun créneau', slotsForWeekday(config, 0), []);
  check('créneau courant à 18 h 24', currentSlot(slots, 18 * 60 + 24), { startMin: 1080, endMin: 1200 });
  check('prochain créneau à 9 h', nextSlot(slots, 9 * 60), { startMin: 600, endMin: 720 });
  check('formatTime', [formatTime(480), formatTime(510)], ['8 h', '8 h 30']);
}

console.log('§3 Calendrier : les jours inactifs sont sautés');
{
  // 2026-09-04 = vendredi. Cycle de 3 jours, actifs lun-ven → ven 4, lun 7, mar 8.
  const dates = cycleDayDates(config, '2026-09-04', 3);
  check('ven 4 / lun 7 / mar 8', dates, ['2026-09-04', '2026-09-07', '2026-09-08']);
}

// ---------------------------------------------------------------------------
console.log('§4 Répartition : 20 pages sur 6 créneaux → 4/4/3/3/3/3');
{
  const slots = slotsForWeekday(config, 1);
  const pages = Array.from({ length: 20 }, (_, i) => i + 1);
  const planned = splitPagesAcrossSlots(pages, slots);
  check('4/4/3/3/3/3', planned.map((s) => s.pages.length), [4, 4, 3, 3, 3, 3]);
  check('ordre préservé', planned.flatMap((s) => s.pages), pages);
  const feas = checkFeasibility(20, slots);
  check('faisable (100 min nécessaires / 720 disponibles)', [feas.ok, feas.neededMin, feas.availableMin], [true, 100, 720]);
  const feasBad = checkFeasibility(200, slots);
  check('200 pages → alerte', feasBad.ok, false);
}

// ---------------------------------------------------------------------------
console.log('§15 Report : pages restantes AVANT les nouvelles, sans doublon');
{
  check('report [5,6] + prévu [7,8] → [5,6,7,8]', carryOverPages([5, 6], [7, 8]), [5, 6, 7, 8]);
  check('doublon éliminé', carryOverPages([5, 6], [6, 7]), [5, 6, 7]);
}

// ---------------------------------------------------------------------------
console.log('§8 Maîtrise : une seule bonne récitation ne suffit pas');
{
  const one: PageEvaluation[] = [{ page: 3, level: 'maitrisee', at: '2026-09-01T10:00:00Z' }];
  check('1× maîtrisée → affichée « plutôt maîtrisée »', currentLevel(one), 'plutot-maitrisee');
  const two: PageEvaluation[] = [...one, { page: 3, level: 'maitrisee', at: '2026-09-03T10:00:00Z' }];
  check('2× maîtrisée consécutives → maîtrisée', currentLevel(two), 'maitrisee');
  const relapse: PageEvaluation[] = [...two, { page: 3, level: 'fragile', at: '2026-09-05T10:00:00Z' }];
  check('rechute fragile → fragile', currentLevel(relapse), 'fragile');
  check('jamais évaluée → null', currentLevel([]), null);
}

console.log('§9 Renforcement : fragile → 2 jours, à retravailler → lendemain');
{
  const byPage = new Map<number, PageEvaluation[]>([
    [10, [{ page: 10, level: 'fragile', at: '2026-09-03T10:00:00Z' }]],        // il y a 2 j
    [11, [{ page: 11, level: 'fragile', at: '2026-09-04T10:00:00Z' }]],        // il y a 1 j → pas due
    [12, [{ page: 12, level: 'a-retravailler', at: '2026-09-04T10:00:00Z' }]], // hier → due
    [13, [{ page: 13, level: 'maitrisee', at: '2026-09-01T10:00:00Z' }]],      // jamais due
    [14, [{ page: 14, level: 'a-retravailler', at: '2026-09-04T10:00:00Z' }]], // due mais déjà récitée
  ]);
  const due = reinforcementDuePages(byPage, '2026-09-05', new Set([14]));
  check('dues aujourd\'hui : 10 et 12', due, [10, 12]);
}

console.log('§10 Agrégats : ventilation + pourcentage');
{
  const byPage = new Map<number, PageEvaluation[]>([
    [1, [{ page: 1, level: 'maitrisee', at: '2026-09-01T10:00:00Z' }, { page: 1, level: 'maitrisee', at: '2026-09-03T10:00:00Z' }]],
    [2, [{ page: 2, level: 'fragile', at: '2026-09-03T10:00:00Z' }]],
  ]);
  const b = masteryBreakdown([1, 2, 3, 4], byPage);
  check('2 évaluées / 2 jamais', [b.evaluated, b.neverEvaluated], [2, 2]);
  check('% = (100+40)/2 = 70', b.percent, 70);
  check('comptes', b.counts, { 'maitrisee': 1, 'plutot-maitrisee': 0, 'fragile': 1, 'a-retravailler': 0 });
}

// ---------------------------------------------------------------------------
console.log('Sourate en cours (lâhiq) : séance quotidienne dédiée');
{
  // Al-Ma'idah = pages 106 à 127. Mémorisé jusqu'à la page 110.
  const config: LearningConfig = { surah: 5, currentPage: 110, placement: 'end', dailyCap: null };
  check('parcours = pages 106 à 110', learningSpan(config), [106, 107, 108, 109, 110]);
  check('sans plafond, tout est récité chaque jour', learningPagesForDay(config, 0).length, 5);

  const prog = learningProgress(config)!;
  check('progression : 5 pages sur 22', [prog.done, prog.total], [5, 22]);
  check('pas encore terminée', prog.complete, false);
  check('terminée à la dernière page', learningProgress({ ...config, currentPage: 127 })!.complete, true);
}

console.log('Plafond : les pages récentes restent, le début tourne');
{
  // 12 pages mémorisées, plafond à 6 → 3 récentes fixes + fenêtre de 3.
  const config: LearningConfig = { surah: 5, currentPage: 117, placement: 'end', dailyCap: 6 };
  check('parcours complet = 12 pages', learningSpan(config).length, 12);
  const d0 = learningPagesForDay(config, 0);
  const d1 = learningPagesForDay(config, 1);
  const d2 = learningPagesForDay(config, 2);
  check('jour 0 : 6 pages', d0.length, 6);
  check('les 3 dernières pages sont toujours là', d0.slice(-3), [115, 116, 117]);
  check('jour 1 : fenêtre avancée', d1.slice(0, 3), [109, 110, 111]);
  check('jour 2 : fenêtre suivante', d2.slice(0, 3), [112, 113, 114]);
  check('rotation bouclée au jour 3', learningPagesForDay(config, 3).slice(0, 3), [106, 107, 108]);
  const couvert = new Set([...d0, ...d1, ...d2]);
  check('3 jours couvrent toute la sourate mémorisée', couvert.size, 12);
}

console.log('Placement de la séance hors des créneaux de révision');
{
  const config: LearningConfig = { surah: 5, currentPage: 108, placement: 'end', dailyCap: null };
  const slotEnd = learningSlot(config, config2Schedule, 3)!;
  check('fin de journée : commence à 20 h', slotEnd.startMin, 1200);
  check('durée = 3 pages × 5 min', slotEnd.endMin - slotEnd.startMin, 15);
  const slotStart = learningSlot({ ...config, placement: 'start' }, config2Schedule, 4)!;
  check('début de journée : finit à 8 h', slotStart.endMin, 480);
  check('commence 20 min avant', slotStart.startMin, 460);
}

console.log('Numérotation par sourate (02/page 1)');
{
  check('page 2 du mushaf = 02/page 1', pageRefLabel(2), '02/page 1');
  check('page 106 avec préférence Al-Ma\'idah', pageRefLabel(106, 5), '05/page 1');
  check('plage dans une sourate', pagesLabel([106, 107, 108], 5), '05/pages 1 à 3');
  check('page unique', pagesLabel([3]), '02/page 2');
}

// ---------------------------------------------------------------------------
console.log('Le dû : une page manquée ne disparaît JAMAIS (bug du 6 sept.)');
{
  // Scénario réel du bug : créneaux 10-11 h et 11-12 h (2 pages chacun),
  // rien récité, il est 14 h. L'ancien report jetait les pages du dernier
  // créneau ; le dû doit les garder TOUTES.
  const state = mkState([
    { startMin: 600, endMin: 660, pages: [3, 4], kind: 'cycle' },
    { startMin: 660, endMin: 720, pages: [5, 6], kind: 'cycle' },
  ]);
  const due = duePages(mkProgram('auto'), state, 14 * 60, 'cycle');
  check('les 4 pages restent dues à 14 h', due.all, [3, 4, 5, 6]);
  check('toutes en retard (créneaux passés)', due.overdue, [3, 4, 5, 6]);

  // À 11 h 30 : créneau 2 en cours, créneau 1 passé.
  const due2 = duePages(mkProgram('auto'), state, 11 * 60 + 30, 'cycle');
  check('11 h 30 : dû = retard [3,4] + courant [5,6]', [due2.overdue, due2.current], [[3, 4], [5, 6]]);

  // Pages récitées : sorties du dû.
  const done = { ...state, recitedPages: [3, 5] };
  const due3 = duePages(mkProgram('auto'), done, 14 * 60, 'cycle');
  check('récitées 3 et 5 → dû [4,6]', due3.all, [4, 6]);
}

console.log('Préférence de report : auto / jamais / demander');
{
  const state = mkState([{ startMin: 600, endMin: 660, pages: [3, 4], kind: 'cycle' }]);
  check('« jamais » : rien de dû après le créneau', duePages(mkProgram('never'), state, 800, 'cycle').all, []);
  check('« demander », sans réponse : pas dû', duePages(mkProgram('ask'), state, 800, 'cycle').all, []);
  check('« demander », en attente de décision', pendingOverdue(mkProgram('ask'), state, 800), [3, 4]);
  const accepted = { ...state, overdueDecision: 'accepted' as const };
  check('« demander », accepté : dû', duePages(mkProgram('ask'), accepted, 800, 'cycle').all, [3, 4]);
  const declined = { ...state, overdueDecision: 'declined' as const };
  check('« demander », refusé : plus demandé', pendingOverdue(mkProgram('ask'), declined, 800), []);
}

console.log('Le dû sépare cycle et sourate en cours');
{
  const state = mkState([
    { startMin: 600, endMin: 660, pages: [3, 4], kind: 'cycle' },
    { startMin: 1200, endMin: 1230, pages: [106, 107], kind: 'learning' },
  ]);
  const mixed = { ...state, recitedPages: [3], learningRecited: [106] };
  const cycle = duePages(mkProgram('auto'), mixed, 21 * 60, 'cycle');
  const learning = duePages(mkProgram('auto'), mixed, 21 * 60, 'learning');
  check('cycle : page 4 due', cycle.all, [4]);
  check('sourate : page 107 due (106 validée côté learning seulement)', learning.all, [107]);
  check('la sourate reste due même en mode « jamais »', duePages(mkProgram('never'), mixed, 21 * 60, 'learning').all, [107]);
}

console.log('Plan de notifications : pur, trié, plafonné');
{
  const program = mkProgram('auto');
  const cycle = { number: 1, startDate: '2026-09-07', days: [{ index: 0, pages: [3, 4, 5, 6] }] };
  const now = new Date(2026, 8, 7, 9, 30); // lundi 7 sept, 9 h 30
  const plan = buildNotificationPlan(program, cycle, now, null);
  check('un plan non vide', plan.length > 0, true);
  check('trié par date', plan.every((n, i) => i === 0 || plan[i - 1].at <= n.at), true);
  check('jamais plus de 60 (limite iOS 64)', plan.length <= 60, true);
  const kinds = new Set(plan.map((n) => n.id % 10));
  check('les trois moments présents (début, rappel, relance)', [...kinds].sort(), [0, 1, 2]);
  const first = plan[0];
  check('la première est à venir', first.at > now, true);
  // Rappels désactivés → plan vide
  const off = { ...program, schedule: { ...program.schedule, remindersEnabled: false } };
  check('rappels désactivés → aucun', buildNotificationPlan(off, cycle, now, null).length, 0);
}

// ---------------------------------------------------------------------------
console.log('');
if (failures) {
  console.error(`✗ ${failures} vérification(s) en échec`);
  process.exit(1);
}
console.log('✓ Toutes les vérifications passent');
