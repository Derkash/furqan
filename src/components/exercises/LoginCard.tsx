'use client';

import { useState } from 'react';
import Link from 'next/link';
import { login } from '@/utils/exercises/userStats';

interface LoginCardProps {
  onLoggedIn: (username: string) => void;
}

/**
 * Connexion simple (identifiant + mot de passe, compte créé automatiquement)
 * pour la mémoire des fautes de récitation.
 */
export default function LoginCard({ onLoggedIn }: LoginCardProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = login(username, password);
    if (result.ok) onLoggedIn(username.trim());
    else setError(result.error ?? 'Connexion impossible');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fdfaf3] via-[#fdfaf3] to-[#f4e9d0] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-6 max-w-sm w-full border border-[#c9a959]/20">
        <h1 className="text-xl font-bold text-[#2d5016] mb-1">Connexion</h1>
        <p className="text-gray-500 text-sm mb-5">
          Pour mémoriser vos fautes et adapter les exercices. Le compte est créé
          automatiquement à la première connexion.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959] block mb-1">
              Identifiant
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full px-3 py-2.5 rounded-xl border-2 border-[#c9a959]/30 focus:border-[#c9a959] outline-none text-[#1a1a1a]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#c9a959] block mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-3 py-2.5 rounded-xl border-2 border-[#c9a959]/30 focus:border-[#c9a959] outline-none text-[#1a1a1a]"
            />
          </div>

          {error && <p className="text-red-600 text-sm text-center">{error}</p>}

          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-[#2d5016] to-[#4a7c23] hover:from-[#4a7c23] hover:to-[#2d5016] text-white font-bold rounded-xl transition-all shadow-lg active:scale-[0.98]"
          >
            Se connecter
          </button>
        </form>

        <div className="text-center mt-4">
          <Link href="/exercises" className="text-[#4a7c23] text-sm hover:underline">
            ← Retour aux exercices
          </Link>
        </div>
      </div>
    </div>
  );
}
