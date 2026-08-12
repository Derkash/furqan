'use client';

import { useState } from 'react';
import Link from 'next/link';
import { login, register } from '@/utils/exercises/userStats';

interface LoginCardProps {
  onLoggedIn: (username: string) => void;
}

type Mode = 'login' | 'register';

/**
 * Connexion / Inscription pour la mémoire des fautes.
 * - Connexion : erreur si l'identifiant n'existe pas ou si le mot de passe est faux.
 * - Inscription : erreur si l'identifiant existe déjà.
 */
export default function LoginCard({ onLoggedIn }: LoginCardProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = mode === 'login' ? await login(username, password) : await register(username, password);
      if (result.ok) onLoggedIn(username.trim());
      else setError(result.error ?? 'Opération impossible');
    } catch {
      setError('Connexion au serveur impossible');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[70dvh] bg-[var(--ds-bg)] flex items-center justify-center p-4" style={{ fontFamily: 'var(--ds-font)' }}>
      <div className="ds-card p-6 max-w-sm w-full">
        {/* Onglets Connexion / Inscription */}
        <div className="flex gap-1.5 mb-5">
          {(
            [
              { value: 'login', label: 'Connexion' },
              { value: 'register', label: 'Inscription' },
            ] as const
          ).map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => switchMode(t.value)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-all ${
                mode === t.value
                  ? 'bg-[var(--ds-green)] text-[var(--ds-bg)] border-[var(--ds-green)] shadow-md'
                  : 'bg-white text-[var(--ds-sage)] border-[var(--ds-gold)]/30 hover:border-[var(--ds-gold)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="text-gray-500 text-sm mb-5">
          {mode === 'login'
            ? 'Retrouvez vos fautes mémorisées et vos exercices adaptés.'
            : 'Créez votre compte pour mémoriser vos fautes et suivre votre progression.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--ds-gold)] block mb-1">
              Identifiant
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full px-3 py-2.5 rounded-xl border-2 border-[var(--ds-gold)]/30 focus:border-[var(--ds-gold)] outline-none text-[#1a1a1a]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--ds-gold)] block mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-[var(--ds-gold)]/30 focus:border-[var(--ds-gold)] outline-none text-[#1a1a1a]"
            />
          </div>

          {error && <p className="text-red-600 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-gradient-to-r from-[var(--ds-green)] to-[var(--ds-sage)] hover:from-[var(--ds-sage)] hover:to-[var(--ds-green)] text-white font-bold rounded-xl transition-all shadow-lg active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting
              ? 'Veuillez patienter…'
              : mode === 'login'
                ? 'Se connecter'
                : 'Créer mon compte'}
          </button>
        </form>

        <div className="text-center mt-4">
          <Link href="/exercises" className="text-[var(--ds-sage)] text-sm hover:underline">
            ← Retour aux exercices
          </Link>
        </div>
      </div>
    </div>
  );
}
