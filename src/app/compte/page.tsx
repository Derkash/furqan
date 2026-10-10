'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import LoginCard from '@/components/exercises/LoginCard';
import {
  getCurrentUser,
  getAccountInfo,
  setAccountEmail,
  changePassword,
  logout,
} from '@/utils/exercises/userStats';

/**
 * Espace compte : identifiant, email (ajout/modif — sert aussi d'identifiant de
 * connexion), changement de mot de passe. Le mot de passe courant est exigé
 * pour chaque opération sensible (le serveur le revérifie).
 */
export default function ComptePage() {
  const [checked, setChecked] = useState(false);
  const [user, setUser] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setUser(getCurrentUser());
    setChecked(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!checked) return <div className="ds-page" />;
  if (!user) {
    return (
      <AppShell>
        <LoginCard onLoggedIn={setUser} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <AccountInner user={user} onLoggedOut={() => setUser(null)} />
    </AppShell>
  );
}

function Flash({ kind, text }: { kind: 'ok' | 'err'; text: string }) {
  return (
    <p className={`text-sm mt-2 ${kind === 'ok' ? 'text-[var(--ds-green)]' : 'text-red-600'}`}>{text}</p>
  );
}

function AccountInner({ user, onLoggedOut }: { user: string; onLoggedOut: () => void }) {
  // Email
  const [emailPwd, setEmailPwd] = useState('');
  const [email, setEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailLoaded, setEmailLoaded] = useState(false);

  // Mot de passe
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pwdBusy, setPwdBusy] = useState(false);

  const loadEmail = async () => {
    if (!emailPwd) {
      setEmailMsg({ kind: 'err', text: 'Entre ton mot de passe actuel pour voir / modifier l’email.' });
      return;
    }
    setEmailBusy(true);
    setEmailMsg(null);
    const res = await getAccountInfo(user, emailPwd);
    setEmailBusy(false);
    if (!res.ok) {
      setEmailMsg({ kind: 'err', text: res.error ?? 'Impossible de charger le compte' });
      return;
    }
    setEmail(res.email ?? '');
    setEmailLoaded(true);
    setEmailMsg({ kind: 'ok', text: res.email ? 'Email actuel chargé.' : 'Aucun email pour l’instant — ajoute-le.' });
  };

  const saveEmail = async () => {
    if (!emailPwd) {
      setEmailMsg({ kind: 'err', text: 'Mot de passe actuel requis.' });
      return;
    }
    setEmailBusy(true);
    setEmailMsg(null);
    const res = await setAccountEmail(user, emailPwd, email);
    setEmailBusy(false);
    setEmailMsg(
      res.ok
        ? { kind: 'ok', text: email.trim() ? 'Email enregistré. Tu peux désormais te connecter avec.' : 'Email retiré.' }
        : { kind: 'err', text: res.error ?? 'Enregistrement impossible' }
    );
  };

  const savePassword = async () => {
    if (newPwd !== newPwd2) {
      setPwdMsg({ kind: 'err', text: 'Les deux nouveaux mots de passe ne correspondent pas.' });
      return;
    }
    setPwdBusy(true);
    setPwdMsg(null);
    const res = await changePassword(user, oldPwd, newPwd);
    setPwdBusy(false);
    if (!res.ok) {
      setPwdMsg({ kind: 'err', text: res.error ?? 'Changement impossible' });
      return;
    }
    setPwdMsg({ kind: 'ok', text: 'Mot de passe changé. Utilise-le pour te reconnecter sur tes autres appareils.' });
    setOldPwd('');
    setNewPwd('');
    setNewPwd2('');
  };

  const field =
    'w-full px-3 py-2.5 rounded-xl border-2 border-[var(--ds-gold)]/30 focus:border-[var(--ds-gold)] outline-none text-[#1a1a1a]';
  const kicker = 'text-[10px] font-bold uppercase tracking-widest text-[var(--ds-gold)] block mb-1';
  const primaryBtn =
    'w-full py-2.5 bg-gradient-to-r from-[var(--ds-green)] to-[var(--ds-sage)] text-white font-bold rounded-xl disabled:opacity-50 active:scale-[0.98] transition-all';

  return (
    <div className="pb-6 max-w-md mx-auto" dir="ltr">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="ds-title text-2xl md:text-3xl">Mon compte</h1>
          <p className="text-[var(--ds-n600)] mt-1">
            Connecté en tant que <span className="font-semibold">{user}</span>
          </p>
        </div>
        <button
          onClick={() => {
            logout();
            onLoggedOut();
          }}
          className="ds-btn-ghost px-4 py-2 text-sm flex-none"
        >
          Se déconnecter
        </button>
      </header>

      {/* Email */}
      <section className="ds-card p-4 mb-5">
        <h2 className="font-bold text-[var(--ds-green)] mb-1">Email de connexion / récupération</h2>
        <p className="text-xs text-[var(--ds-n600)] mb-3">
          Ajoute un email : il te servira d’identifiant de connexion (en plus de ton identifiant) et
          de point de récupération. Ton mot de passe actuel est demandé pour toute modification.
        </p>
        <label className={kicker}>Mot de passe actuel</label>
        <input
          type="password"
          value={emailPwd}
          onChange={(e) => setEmailPwd(e.target.value)}
          autoComplete="current-password"
          className={`${field} mb-2`}
        />
        {!emailLoaded ? (
          <button onClick={loadEmail} disabled={emailBusy} className={primaryBtn}>
            {emailBusy ? 'Chargement…' : 'Afficher / modifier mon email'}
          </button>
        ) : (
          <>
            <label className={kicker}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="toncompte@exemple.com"
              className={`${field} mb-2`}
            />
            <button onClick={saveEmail} disabled={emailBusy} className={primaryBtn}>
              {emailBusy ? 'Enregistrement…' : 'Enregistrer l’email'}
            </button>
            <p className="text-[11px] text-[var(--ds-n500)] mt-1">Laisse vide puis enregistre pour retirer l’email.</p>
          </>
        )}
        {emailMsg && <Flash kind={emailMsg.kind} text={emailMsg.text} />}
      </section>

      {/* Mot de passe */}
      <section className="ds-card p-4 mb-5">
        <h2 className="font-bold text-[var(--ds-green)] mb-1">Changer mon mot de passe</h2>
        <p className="text-xs text-[var(--ds-n600)] mb-3">
          Depuis un appareil où tu es connecté, définis un nouveau mot de passe pour reprendre la
          main partout ailleurs.
        </p>
        <label className={kicker}>Mot de passe actuel</label>
        <input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} autoComplete="current-password" className={`${field} mb-2`} />
        <label className={kicker}>Nouveau mot de passe</label>
        <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" className={`${field} mb-2`} />
        <label className={kicker}>Confirmer le nouveau mot de passe</label>
        <input type="password" value={newPwd2} onChange={(e) => setNewPwd2(e.target.value)} autoComplete="new-password" className={`${field} mb-3`} />
        <button onClick={savePassword} disabled={pwdBusy || !oldPwd || !newPwd} className={primaryBtn}>
          {pwdBusy ? 'Changement…' : 'Changer le mot de passe'}
        </button>
        {pwdMsg && <Flash kind={pwdMsg.kind} text={pwdMsg.text} />}
      </section>

      <div className="text-center">
        <Link href="/dashboard" className="text-[var(--ds-sage)] text-sm underline">
          Voir ma progression
        </Link>
      </div>
    </div>
  );
}
