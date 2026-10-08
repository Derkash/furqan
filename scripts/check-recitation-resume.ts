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
import { buildProgramCycleDays } from '../src/lib/recitation/planner';
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

console.log('Répétition ×2 : J1 juz 1-2, J2 juz 1-2, J3 juz 3-4, J4 juz 3-4');
{
  setup([0, 1, 2, 3, 4, 5, 6], 2, '2026-10-01');
  let d = day('2026-10-01');
  check('jour 1 = juz 1-2 (p. 1-41)', [d.index, d.pages[0], d.pages.at(-1)], [0, 1, 41]);
  recite('2026-10-01', range(1, 41));

  d = day('2026-10-02');
  check('jour 2 = juz 1-2 à nouveau', [d.index, d.pages[0], d.pages.at(-1)], [1, 1, 41]);
  check('pas de reprise affichée', d.ctx.dayState!.resumed, false);
  recite('2026-10-02', range(1, 20)); // moitié seulement

  d = day('2026-10-03');
  check('journée inachevée → reprise du jour 2, seulement ce qui reste', [d.index, d.pages[0], d.pages.at(-1), d.pages.length], [1, 21, 41, 21]);
  check('reprise signalée', d.ctx.dayState!.resumed, true);
  check('le cycle a glissé : demain = jour 3', d.ctx.dayDates[2], '2026-10-04');

  // L'app n'est pas ouverte les 4 et 5 : on reprend au même endroit le 6.
  d = day('2026-10-06');
  check('3 jours plus tard : toujours le reste du jour 2, rien d\'empilé', [d.index, d.pages[0], d.pages.length], [1, 21, 21]);
  recite('2026-10-06', range(21, 41));

  d = day('2026-10-07');
  check('jour 3 = juz 3-4 (p. 42-81)', [d.index, d.pages[0], d.pages.at(-1)], [2, 42, 81]);
  recite('2026-10-07', range(42, 81));
  d = day('2026-10-08');
  check('jour 4 = juz 3-4 à nouveau', [d.index, d.pages[0], d.pages.at(-1)], [3, 42, 81]);
  recite('2026-10-08', range(42, 81));

  d = day('2026-10-09');
  check('cycle terminé → cycle 2, jour 1 = juz 1-2', [d.ctx.cycle.number, d.index, d.pages[0]], [2, 0, 1]);
  check('nouveau cycle daté du jour', d.ctx.cycle.startDate, '2026-10-09');
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
