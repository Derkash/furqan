'use client';

import { Component, type ReactNode } from 'react';

/**
 * Garde-fou anti-écran-blanc (App Store 2.1 : le refus le plus fréquent des
 * apps WebView/Capacitor = page blanche au premier lancement sur l'appareil
 * du reviewer, souvent une erreur JS non supportée par un WKWebView plus
 * ancien). Plutôt qu'un écran blanc silencieux → un écran de secours lisible
 * avec un bouton pour recharger.
 */
interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidMount() {
    // Erreurs hors rendu React (init, handlers) : on n'affiche l'écran de
    // secours que si RIEN n'a pu s'afficher (évite de masquer l'app pour une
    // erreur asynchrone bénigne).
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (e) => {
        if (document.body && document.body.childElementCount <= 1) {
          this.setState({ hasError: true });
        }
        void e;
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="ltr"
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 24,
            textAlign: 'center',
            background: '#f6f8f7',
            color: '#24493a',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          <span dir="rtl" style={{ fontSize: 40, color: '#c5a059' }}>
            ع
          </span>
          <p style={{ fontWeight: 700, fontSize: 17, margin: 0 }}>Une erreur est survenue.</p>
          <p style={{ fontSize: 14, color: '#6b7d74', maxWidth: 320, margin: 0 }}>
            L&apos;application n&apos;a pas pu se charger correctement. Réessayez — vos données sont
            conservées sur l&apos;appareil.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false });
              if (typeof window !== 'undefined') window.location.reload();
            }}
            style={{
              marginTop: 4,
              padding: '12px 28px',
              borderRadius: 9999,
              border: 'none',
              background: '#2d5a47',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            Recharger
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
