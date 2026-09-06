'use client';

// Écran de diagnostic de la récitation : permet de voir CE QUI SE PASSE
// réellement quand le widget, l'activité en direct ou les notifications ne
// se comportent pas comme attendu. Les couches basses avalent les erreurs
// pour ne jamais casser l'usage ; cet écran les rend visibles.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import AppShell from '@/components/AppShell';
import { refreshRecitationNative } from '@/lib/recitation/appSync';
import { buildSessions, sessionAt } from '@/lib/recitation/widgetSync';

interface BridgeDiagnostics {
  appGroupReachable?: boolean;
  stateBytes?: number;
  sessionCount?: number;
  generatedAt?: number;
  activeSlot?: string;
  activePages?: string;
  nextSlot?: string;
  nextDay?: string;
  activitiesEnabled?: boolean;
  runningActivities?: number;
}
interface RecitationBridgePlugin {
  diagnostics(): Promise<BridgeDiagnostics>;
}
const RecitationBridge = registerPlugin<RecitationBridgePlugin>('RecitationBridge');

interface PendingNotif {
  id: number;
  title: string;
  at: string;
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-[var(--ds-divider)] last:border-0">
      <span className="text-[13px] text-[var(--ds-n600)] font-semibold">{label}</span>
      <span
        className={`text-[13px] font-bold text-right ${
          ok === undefined ? 'text-[var(--ds-text)]' : ok ? 'text-[var(--ds-sage)]' : 'text-[#b3542e]'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default function DiagnosticPage() {
  const [native, setNative] = useState(false);
  const [perm, setPerm] = useState<string>('—');
  const [pending, setPending] = useState<PendingNotif[]>([]);
  const [bridge, setBridge] = useState<BridgeDiagnostics | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [sessions, setSessions] = useState(0);
  const [activeLabel, setActiveLabel] = useState('—');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const isNative = Capacitor.isNativePlatform();
    setNative(isNative);

    const ctx = refreshRecitationNative(new Date());
    const list = buildSessions(ctx);
    setSessions(list.length);
    const active = sessionAt(list, new Date());
    setActiveLabel(active ? `${active.slotLabel} · ${active.pagesLabel} · ${active.recitedPages}/${active.totalPages}` : 'aucune');

    if (isNative) {
      try {
        const p = await LocalNotifications.checkPermissions();
        setPerm(p.display);
      } catch (e) {
        setPerm(`erreur : ${String(e)}`);
      }
      try {
        const res = await LocalNotifications.getPending();
        setPending(
          res.notifications
            .filter((n) => n.id >= 730000 && n.id < 740000)
            .map((n) => ({
              id: n.id,
              title: n.title ?? '',
              at: n.schedule?.at ? new Date(n.schedule.at).toLocaleString('fr-FR') : '—',
            }))
            .sort((a, b) => a.at.localeCompare(b.at))
        );
      } catch (e) {
        setBridgeError(`notifications : ${String(e)}`);
      }
      try {
        setBridge(await RecitationBridge.diagnostics());
      } catch (e) {
        setBridgeError(`pont natif : ${String(e)}`);
      }
    }
    setBusy(false);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <AppShell>
      <header className="flex items-center gap-3 mb-5">
        <Link href="/recitation" aria-label="Retour" className="text-2xl text-[var(--ds-n600)] hover:text-[var(--ds-green)]">←</Link>
        <h1 className="ds-title text-2xl">Diagnostic</h1>
      </header>

      <div className="max-w-[640px] flex flex-col gap-4 pb-10">
        <section className="ds-card p-5">
          <p className="ds-kicker mb-2">Application</p>
          <Row label="App native (Capacitor)" value={native ? 'oui' : 'non — web'} ok={native} />
          <Row label="Sessions poussées au widget" value={String(sessions)} ok={sessions > 0} />
          <Row label="Session en cours" value={activeLabel} ok={activeLabel !== 'aucune'} />
        </section>

        <section className="ds-card p-5">
          <p className="ds-kicker mb-2">Notifications</p>
          <Row label="Autorisation" value={perm} ok={perm === 'granted'} />
          <Row label="Programmées" value={String(pending.length)} ok={pending.length > 0} />
          {pending.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {pending.slice(0, 12).map((n) => (
                <p key={n.id} className="text-[12px] text-[var(--ds-n600)]">
                  <span className="font-bold text-[var(--ds-green)]">{n.at}</span> — {n.title}
                </p>
              ))}
            </div>
          )}
        </section>

        <section className="ds-card p-5">
          <p className="ds-kicker mb-2">Widget et activité en direct</p>
          {bridge ? (
            <>
              <Row label="App Group accessible" value={bridge.appGroupReachable ? 'oui' : 'non'} ok={bridge.appGroupReachable} />
              <Row label="État partagé" value={`${bridge.stateBytes ?? 0} octets · ${bridge.sessionCount ?? 0} sessions`} ok={(bridge.sessionCount ?? 0) > 0} />
              <Row label="Créneau vu par le widget" value={bridge.activeSlot ? `${bridge.activeSlot} · ${bridge.activePages}` : 'aucun'} />
              <Row label="Prochain créneau" value={bridge.nextSlot ? `${bridge.nextDay || 'aujourd’hui'} · ${bridge.nextSlot}` : '—'} />
              <Row label="Activités en direct autorisées" value={bridge.activitiesEnabled ? 'oui' : 'non'} ok={bridge.activitiesEnabled} />
              <Row label="Activité en cours" value={String(bridge.runningActivities ?? 0)} ok={(bridge.runningActivities ?? 0) > 0} />
            </>
          ) : (
            <p className="text-[13px] text-[var(--ds-n600)]">{native ? 'Pont natif indisponible.' : 'Disponible uniquement dans l’app iPhone.'}</p>
          )}
          {bridgeError && <p className="text-[12px] text-[#b3542e] mt-2">{bridgeError}</p>}
        </section>

        <button type="button" onClick={load} disabled={busy} className="ds-btn-gold px-6 py-3 text-sm disabled:opacity-50">
          {busy ? 'Analyse…' : 'Relancer le diagnostic'}
        </button>
      </div>
    </AppShell>
  );
}
