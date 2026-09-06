'use client';

// « Mon programme » (brief §5) : position dans le cycle, objectif du jour,
// créneaux, prochains jours, retards et reports en attente. Sans programme :
// écran d'introduction vers la mise en place.

import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useRecitation } from '@/hooks/useRecitation';
import { dailyLoad, duePages, pendingOverdue } from '@/lib/recitation/dayEngine';
import { formatDateKey, pagesLabel, surahSpanLabel } from '@/lib/recitation/labels';
import { clearDraft } from '@/lib/recitation/draft';
import { currentSlot, formatTime, nextSlot } from '@/lib/recitation/schedule';

function EmptyState() {
  return (
    <div className="max-w-[640px]">
      <p className="ds-kicker">Programme de récitation</p>
      <h1 className="ds-title text-3xl mt-1">Votre récitation, organisée</h1>
      <p className="text-[var(--ds-n600)] mt-2 leading-relaxed">
        Déclarez ce que vous connaissez, choisissez un rythme — l’application construit un
        cycle sur plusieurs jours, répartit chaque journée entre vos créneaux et adapte les
        révisions aux pages fragiles.
      </p>
      <ol className="mt-5 flex flex-col gap-2.5">
        {[
          'Déclarez votre périmètre mémorisé (sourates, juz’, pages…)',
          'Choisissez votre objectif — par exemple un juz’ par jour',
          'Définissez vos jours et créneaux de récitation',
          'Suivez chaque session, page par page, et évaluez votre maîtrise',
        ].map((s, i) => (
          <li key={i} className="ds-card px-4 py-3 flex items-center gap-3">
            <span className="flex-none w-7 h-7 rounded-full bg-[var(--ds-gold-100)] text-[var(--ds-gold-700)] font-extrabold text-sm flex items-center justify-center">
              {i + 1}
            </span>
            <span className="text-sm font-semibold">{s}</span>
          </li>
        ))}
      </ol>
      <Link
        href="/recitation/perimetre"
        onClick={() => clearDraft()}
        className="ds-btn-gold inline-block px-7 py-3 text-sm mt-6"
      >
        Créer mon programme
      </Link>
    </div>
  );
}

export default function RecitationPage() {
  const { ctx, ready, now, cycleStats, decideOverdue, decideMissed } = useRecitation();

  if (!ready) return <AppShell><div /></AppShell>;
  if (!ctx) {
    return (
      <AppShell>
        <EmptyState />
      </AppShell>
    );
  }

  const { cycle, dayState, todayKey, dayDates, missedDates } = ctx;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const active = dayState ? currentSlot(dayState.slots, nowMin) : null;
  const upcoming = dayState ? nextSlot(dayState.slots, nowMin) : null;
  const recitedSet = new Set(dayState?.recitedPages ?? []);
  const learningSet = new Set(dayState?.learningRecited ?? []);
  const load = dailyLoad(dayState);
  const dueCycle = dayState
    ? duePages(ctx.program, dayState, nowMin, 'cycle')
    : { current: [], overdue: [], all: [] };
  const askOverdue = dayState ? pendingOverdue(ctx.program, dayState, nowMin) : [];
  const dayNumber = (dayState?.cycleDayIndex ?? dayDates.indexOf(todayKey)) + 1;
  const endDate = dayDates[dayDates.length - 1];

  const slotStatusLabel = (i: number) => {
    const slot = dayState!.slots[i];
    const set = slot.kind === 'learning' ? learningSet : recitedSet;
    const done = slot.pages.every((p) => set.has(p)) && slot.pages.length > 0;
    if (done) return { label: 'Terminée', cls: 'text-[var(--ds-sage)]' };
    if (active && slot.startMin === active.startMin) return { label: 'En cours', cls: 'text-[var(--ds-gold-700)]' };
    if (slot.endMin <= nowMin) return { label: 'Passée', cls: 'text-[var(--ds-n500)]' };
    return { label: 'À venir', cls: 'text-[var(--ds-n500)]' };
  };

  return (
    <AppShell>
      <header className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="ds-kicker">
            Cycle de {cycle.days.length} jour{cycle.days.length > 1 ? 's' : ''}
            {dayNumber > 0 && ` — jour ${dayNumber} sur ${cycle.days.length}`}
          </p>
          <h1 className="ds-title text-3xl mt-1">Mon programme</h1>
        </div>
        <Link href="/recitation/perimetre" className="ds-btn-ghost px-4 py-2 text-[13px] flex-none">
          Modifier
        </Link>
      </header>

      {/* Retard (brief §16) */}
      {missedDates.length > 0 && dayState && (
        <section className="rounded-[20px] border border-[var(--ds-gold)] bg-[var(--ds-gold-100)] p-5 mb-5">
          <p className="text-sm font-extrabold text-[var(--ds-gold-700)]">
            {missedDates.length} journée{missedDates.length > 1 ? 's' : ''} du cycle non réalisée
            {missedDates.length > 1 ? 's' : ''}
          </p>
          <p className="text-[13px] text-[var(--ds-n700)] mt-1">
            Rien n’est perdu — choisissez comment reprendre, sans surcharge imposée.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" onClick={() => decideMissed('catch-up')} className="ds-btn-gold px-4 py-2 text-[13px]">
              Rattraper progressivement
            </button>
            <button type="button" onClick={() => decideMissed('skip')} className="ds-btn-ghost px-4 py-2 text-[13px]">
              Reprendre sans rattrapage
            </button>
            <Link href="/recitation/objectif" className="ds-btn-ghost px-4 py-2 text-[13px]">
              Replanifier
            </Link>
          </div>
        </section>
      )}

      {/* Retard en attente de décision (mode « toujours demander ») */}
      {dayState && askOverdue.length > 0 && (
        <section className="rounded-[20px] border border-[var(--ds-gold)] bg-[var(--ds-gold-100)] p-5 mb-5">
          <p className="text-sm font-extrabold text-[var(--ds-gold-700)]">
            {askOverdue.length} page{askOverdue.length > 1 ? 's' : ''} non récitée
            {askOverdue.length > 1 ? 's' : ''} sur les créneaux passés ({pagesLabel(askOverdue)})
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" onClick={() => decideOverdue(true)} className="ds-btn-gold px-4 py-2 text-[13px]">
              Les garder pour aujourd’hui
            </button>
            <button type="button" onClick={() => decideOverdue(false)} className="ds-btn-ghost px-4 py-2 text-[13px]">
              Les reprendre au prochain cycle
            </button>
          </div>
        </section>
      )}

      {/* Retard du jour (visible, jamais silencieux) */}
      {dayState && dueCycle.overdue.length > 0 && (
        <section className="rounded-[20px] border border-[#e7c9b2] bg-[#fbf3ec] p-4 mb-5">
          <p className="text-[13px] font-extrabold text-[#b3542e]">
            En retard aujourd’hui : {dueCycle.overdue.length} page{dueCycle.overdue.length > 1 ? 's' : ''}{' '}
            ({pagesLabel(dueCycle.overdue)}) — toujours à réciter, rien n’est perdu.
          </p>
          <Link href="/recitation/en-cours" className="ds-btn-gold inline-block px-4 py-2 text-[13px] mt-2.5">
            Rattraper maintenant
          </Link>
        </section>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {/* Aujourd'hui */}
        <div
          className="rounded-[24px] p-6 text-white"
          style={{ background: 'var(--ds-green)', boxShadow: 'var(--ds-shadow-md)' }}
        >
          <p className="ds-kicker" style={{ color: 'var(--ds-gold-100)' }}>Aujourd’hui</p>
          {dayState ? (
            <>
              <p className="text-2xl font-extrabold mt-1">
                {load.cycleDone + load.learningDone} / {load.totalPages} pages récitées
              </p>
              {/* Le total additionne DEUX programmes distincts : l'objectif du
                  cycle ne dit rien de la sourate en cours, qui s'y ajoute. */}
              <p className="text-sm text-white/85 mt-1">
                Révision {load.cycleDone}/{load.cyclePages}
                {load.learningPages > 0 && (
                  <> · Sourate en cours {load.learningDone}/{load.learningPages}</>
                )}
                {' · ~'}
                {Math.round(load.estimatedMinutes / 5) * 5} min
              </p>
              {cycleStats && (
                <p className="text-sm text-white/85 mt-0.5">
                  Cycle complet : {cycleStats.recited} / {cycleStats.total} pages
                </p>
              )}
              <p className="text-sm text-white/85 mt-0.5">
                {active
                  ? `Créneau en cours jusqu’à ${formatTime(active.endMin)}`
                  : upcoming
                    ? `Prochaine récitation à ${formatTime(upcoming.startMin)}`
                    : 'Journée terminée — qu’Allah accepte.'}
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                <Link href="/recitation/en-cours" className="ds-btn-gold inline-block px-6 py-2.5 text-sm">
                  {active ? 'Continuer la récitation' : 'Voir la session'}
                </Link>
                <Link
                  href="/recitation/improvisation"
                  className="rounded-full bg-white/15 px-5 py-2.5 text-sm font-bold hover:bg-white/25 transition-colors"
                >
                  J’ai récité en avance
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="text-2xl font-extrabold mt-1">Jour de repos</p>
              <p className="text-sm text-white/85 mt-1">
                Prochaine journée de récitation :{' '}
                {dayDates.find((d) => d > todayKey) ? formatDateKey(dayDates.find((d) => d > todayKey)!) : '—'}
              </p>
            </>
          )}
        </div>

        {/* Raccourcis */}
        <div className="ds-card p-6 flex flex-col justify-center gap-2.5">
          {[
            { href: '/recitation/apprentissage', label: 'Sourate en cours', hint: 'Consolidation quotidienne du lâhiq' },
            { href: '/recitation/maitrise', label: 'Maîtrise', hint: 'Niveau page par page, sourate, juz’' },
            { href: '/recitation/bilan', label: 'Bilan du cycle', hint: 'Avancement et proposition de rythme' },
            { href: '/recitation/historique', label: 'Historique', hint: 'Sessions et statistiques' },
            { href: '/recitation/diagnostic', label: 'Diagnostic', hint: 'Widget, activité en direct, notifications' },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="flex items-center justify-between rounded-2xl border border-[var(--ds-divider)] px-4 py-3 hover:border-[var(--ds-gold)] transition-colors">
              <span>
                <span className="font-bold text-[15px]">{l.label}</span>
                <span className="block text-[12px] text-[var(--ds-n600)]">{l.hint}</span>
              </span>
              <span className="text-[var(--ds-n400)]">›</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Créneaux du jour */}
      {dayState && (
        <section className="mb-6">
          <p className="ds-kicker mb-3">Créneaux de la journée</p>
          <div className="ds-card divide-y divide-[var(--ds-divider)]">
            {dayState.slots.map((slot, i) => {
              const st = slotStatusLabel(i);
              const isLearning = slot.kind === 'learning';
              const set = isLearning ? learningSet : recitedSet;
              const done = slot.pages.filter((p) => set.has(p)).length;
              const surah = isLearning ? ctx.program.learning?.surah : undefined;
              return (
                <div
                  key={i}
                  className={`px-5 py-3.5 flex items-center gap-3 ${isLearning ? 'bg-[var(--ds-gold-100)]' : ''}`}
                >
                  <span className="flex-none w-28 text-sm font-extrabold text-[var(--ds-green)]">
                    {formatTime(slot.startMin)} – {formatTime(slot.endMin)}
                  </span>
                  <span className="text-sm font-semibold flex-1">
                    {isLearning && (
                      <span className="text-[10px] font-extrabold tracking-wider text-[var(--ds-gold-700)] mr-2">
                        SOURATE EN COURS
                      </span>
                    )}
                    {pagesLabel(slot.pages, surah) || 'Aucune page'}
                    {slot.pages.length > 0 && (
                      <span className="text-[var(--ds-n500)] font-normal"> · {done}/{slot.pages.length}</span>
                    )}
                  </span>
                  <span className={`text-[13px] font-bold ${st.cls}`}>{st.label}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Prochains jours */}
      <section className="pb-8">
        <p className="ds-kicker mb-3">Les prochains jours</p>
        <div className="ds-card divide-y divide-[var(--ds-divider)]">
          {dayDates.map((date, i) => {
            if (date <= todayKey) return null;
            const day = cycle.days[i];
            return (
              <div key={date} className="px-5 py-3 flex items-center gap-3">
                <span className="flex-none w-36 text-[13px] font-bold text-[var(--ds-n600)] capitalize">
                  {formatDateKey(date)}
                </span>
                <span className="text-sm font-semibold flex-1">{pagesLabel(day.pages)}</span>
                <span className="text-xs text-[var(--ds-n500)] hidden sm:block">{surahSpanLabel(day.pages)}</span>
              </div>
            );
          })}
          {endDate && (
            <p className="px-5 py-3 text-[13px] text-[var(--ds-n600)]">
              Fin du cycle estimée : <strong className="capitalize">{formatDateKey(endDate)}</strong>
            </p>
          )}
        </div>
      </section>
    </AppShell>
  );
}
