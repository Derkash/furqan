import AppShell from '@/components/AppShell';

export const metadata = {
  title: 'Politique de confidentialité — Al-Muraja3a',
};

/**
 * Politique de confidentialité — requise pour la soumission App Store
 * (URL de politique de confidentialité dans App Store Connect) et pour
 * informer les utilisateurs (guideline 5.1.1).
 */
export default function ConfidentialitePage() {
  return (
    <AppShell>
      <article className="max-w-2xl space-y-5" dir="ltr">
        <header>
          <h1 className="ds-title text-3xl md:text-4xl">Politique de confidentialité</h1>
          <p className="text-[var(--ds-n600)] mt-1 text-sm">Al-Muraja3a — dernière mise à jour : août 2026</p>
        </header>

        <section className="ds-card p-5 space-y-2">
          <h2 className="font-extrabold text-[var(--ds-green)]">Ce que l’app collecte</h2>
          <p className="text-sm text-[var(--ds-n700)]">
            Al-Muraja3a fonctionne d’abord <strong>localement sur votre appareil</strong>. Si vous créez un
            compte (identifiant + mot de passe, sans e-mail), votre progression de révision (fautes
            déclarées, résultats des exercices, lexique de vocabulaire) est sauvegardée en ligne afin de la
            retrouver sur vos autres appareils. Le mot de passe n’est jamais stocké en clair. Aucune donnée
            n’est vendue ni partagée avec des tiers, et l’app ne contient ni publicité ni traceur.
          </p>
        </section>

        <section className="ds-card p-5 space-y-2">
          <h2 className="font-extrabold text-[var(--ds-green)]">Microphone</h2>
          <p className="text-sm text-[var(--ds-n700)]">
            Le micro sert uniquement à enregistrer votre récitation pour que vous puissiez vous réécouter.
            Les enregistrements restent <strong>sur votre appareil</strong> : ils ne sont ni envoyés ni
            stockés sur un serveur, et disparaissent lorsque vous les effacez ou fermez la session.
          </p>
        </section>

        <section className="ds-card p-5 space-y-2">
          <h2 className="font-extrabold text-[var(--ds-green)]">Suppression du compte</h2>
          <p className="text-sm text-[var(--ds-n700)]">
            Vous pouvez supprimer définitivement votre compte et toutes les données associées depuis
            l’app : <strong>Progression → « Supprimer mon compte… »</strong>. La suppression efface les
            données de l’appareil et de la sauvegarde en ligne.
          </p>
        </section>

        <section className="ds-card p-5 space-y-2">
          <h2 className="font-extrabold text-[var(--ds-green)]">Contact</h2>
          <p className="text-sm text-[var(--ds-n700)]">
            Pour toute question relative à vos données : <strong>abdoul.guirassy@gmail.com</strong>.
          </p>
        </section>
      </article>
    </AppShell>
  );
}
