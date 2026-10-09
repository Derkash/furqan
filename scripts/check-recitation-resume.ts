// Scénarios de bout en bout du moteur du jour (ensureToday) : journées
// manquées, journée à moitié faite, répétition de chaque portion, jours de
// repos. localStorage simulé en mémoire.
// Lancer : npx tsx scripts/check-recitation-resume.ts

const mem = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
};

import { ensureToday, setPagesRecited } from '../src/lib/recitation/dayEngine';
import { buildProgramCycleDays, repeatCycleDays, buildCycleDays } from '../src/lib/recitation/planner';
import { duePages } from '../src/lib/recitation/dayEngine';
import { pagesLabel } from '../src/lib/recitation/labels';
import { perimeterPages } from '../src/lib/recitation/perimeter';
import { saveCycle, saveProgram } from '../src/lib/recitation/store';
import type { Program } from '../src/lib/recitation/types';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}\n      attendu : ${e}\n      obtenu  : ${a}`);
  }
}

const at = (key: string) => new Date(`${key}T09:00:00`);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function setup(activeWeekdays: number[], repeatDays: number, start: string) {
  mem.clear();
  const pages = perimeterPages([1, 2, 3, 4].map((juz) => ({ kind: 'juz' as const, juz })));
  const program: Program = {
    selections: [],
    perimeterPages: pages,
    objective: { kind: 'juzPerDay', amount: 2 },
    schedule: { activeWeekdays, hours: { startMin: 480, endMin: 1200, frequencyMin: 120 }, remindersEnabled: false },
    slotSplit: { mode: 'auto' },
    carryOver: 'auto',
    reinforcementEnabled: false,
    endReminderMin: null,
    learning: null,
    repeatDays,
    createdAt: `${start}T08:00:00.000Z`,
    updatedAt: `${start}T08:00:00.000Z`,
  };
  saveProgram(program);
  saveCycle({ number: 1, startDate: start, days: buildProgramCycleDays(pages, program.objective, null, repeatDays) });
}

function day(key: string) {
  const ctx = ensureToday(at(key))!;
  const pages = ctx.dayState ? ctx.dayState.slots.flatMap((s) => s.pages) : [];
  return { ctx, pages, index: ctx.dayState?.cycleDayIndex ?? null };
}

function recite(key: string, pages: number[]) {
  const ctx = ensureToday(at(key))!;
  setPagesRecited(ctx.dayState!, pages, 'cycle');
}

console.log('Répétition ×2 inversée : J1 juz 1 puis 2, J2 juz 2 puis 1, J3 juz 3 puis 4, J4 juz 4 puis 3');
{
  setup([0, 1, 2, 3, 4, 5, 6], 2, '2026-10-01');
  let d = day('2026-10-01');
  check('jour 1 = juz 1-2 (p. 1-41)', [d.index, d.pages[0], d.pages.at(-1)], [0, 1, 41]);
  recite('2026-10-01', range(1, 41));

  d = day('2026-10-02');
  check('jour 2 = juz 2 (p. 22-41) PUIS juz 1 (p. 1-21)', [d.index, d.pages[0], d.pages[19], d.pages[20], d.pages.at(-1)], [1, 22, 41, 1, 21]);
  check('pas de reprise affichée', d.ctx.dayState!.resumed, false);
  {
    const due = duePages(d.ctx.program, d.ctx.dayState!, 23 * 60, 'cycle');
    check('le dû suit l\'ordre du plan (juz 2 d\'abord)', [due.all[0], due.all.at(-1)], [22, 21]);
    check('libellé « … puis … »', pagesLabel(d.pages).includes(' puis '), true);
  }
  recite('2026-10-02', range(22, 41)); // juz 2 seulement

  d = day('2026-10-03');
  check('journée inachevée → reprise du jour 2 : reste le juz 1', [d.index, d.pages[0], d.pages.at(-1), d.pages.length], [1, 1, 21, 21]);
  check('reprise signalée', d.ctx.dayState!.resumed, true);
  check('le cycle a glissé : demain = jour 3', d.ctx.dayDates[2], '2026-10-04');

  // L'app n'est pas ouverte les 4 et 5 : on reprend au même endroit le 6.
  d = day('2026-10-06');
  check('3 jours plus tard : toujours le reste du jour 2, rien d\'empilé', [d.index, d.pages[0], d.pages.length], [1, 1, 21]);
  recite('2026-10-06', range(1, 21));

  d = day('2026-10-07');
  check('jour 3 = juz 3-4 (p. 42-81)', [d.index, d.pages[0], d.pages.at(-1)], [2, 42, 81]);
  recite('2026-10-07', range(42, 81));
  d = day('2026-10-08');
  check('jour 4 = juz 4 puis juz 3', [d.index, d.pages[0], d.pages.at(-1)], [3, 62, 61]);
  recite('2026-10-08', range(42, 81));

  d = day('2026-10-09');
  check('cycle terminé → cycle 2, jour 1 = juz 1-2', [d.ctx.cycle.number, d.index, d.pages[0]], [2, 0, 1]);
  check('nouveau cycle daté du jour', d.ctx.cycle.startDate, '2026-10-09');
}

console.log('Cycle déjà enregistré sans inversion → réordonné sans perdre la position');
{
  setup([0, 1, 2, 3, 4, 5, 6], 2, '2026-10-01');
  const pages = perimeterPages([1, 2, 3, 4].map((juz) => ({ kind: 'juz' as const, juz })));
  // Ancien format : passages identiques.
  saveCycle({ number: 1, startDate: '2026-10-01', days: repeatCycleDays(buildCycleDays(pages, { kind: 'juzPerDay', amount: 2 }), 2, false) });
  let d = day('2026-10-02');
  recite('2026-10-02', range(1, 5)); // déjà récité avant la correction
  check('avant : jour 2 en ordre du mushaf', d.pages[0], 22);
  // (simulation : la journée a été construite avec l'ancien ordre)
  saveCycle({ number: 1, startDate: '2026-10-01', days: repeatCycleDays(buildCycleDays(pages, { kind: 'juzPerDay', amount: 2 }), 2, false) });
  d = day('2026-10-02');
  check('après : jour 2 = juz 2 puis juz 1', [d.index, d.pages[0], d.pages.at(-1)], [1, 22, 21]);
  check('pages déjà cochées conservées', d.ctx.dayState!.recitedPages, [1, 2, 3, 4, 5]);
}

console.log('Jour de repos entre une journée inachevée et la reprise');
{
  // 2026-10-03 est un samedi (6) : samedi inactif.
  setup([0, 1, 2, 3, 4, 5], 1, '2026-10-01');
  let d = day('2026-10-02');
  check('vendredi = jour 2 (juz 3-4)', [d.index, d.pages[0]], [1, 42]);
  recite('2026-10-02', range(42, 60));
  d = day('2026-10-03');
  check('samedi : repos', d.ctx.dayState, null);
  check('prochaine journée = dimanche', d.ctx.dayDates.find((x) => x > '2026-10-03'), '2026-10-04');
  d = day('2026-10-04');
  check('dimanche : reste du jour 2 (p. 61-81)', [d.index, d.pages[0], d.pages.at(-1)], [1, 61, 81]);
}

console.log(failures ? `\n✗ ${failures} échec(s)` : '\n✓ Toutes les vérifications passent');
process.exit(failures ? 1 : 0);
