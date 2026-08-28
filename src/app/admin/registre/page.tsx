'use client';

import { useEffect, useState } from 'react';
import { Printer, TriangleAlert } from 'lucide-react';
import { Bouton, LienRetour } from '@/components/ui/Bouton';
import { fetchDashboard } from '@/lib/apiClient';

/**
 * Le registre des traitements — le document que l'ARTCI demande.
 *
 * ── IL EST FAIT POUR ÊTRE IMPRIMÉ ──────────────────────────────────────────
 *
 * Un régulateur ne consulte pas un écran : il reçoit une pièce. D'où le bouton
 * d'impression et une mise en page qui tient sur du papier — un tableau par
 * traitement, dans l'ordre où on les lui expliquerait.
 *
 * ── IL DIT CE QU'IL NE SAIT PAS ────────────────────────────────────────────
 *
 * La raison sociale, le contact désigné, le numéro de déclaration : le code ne
 * les connaît pas, et les inventer produirait un document faux remis à une
 * autorité. Ils apparaissent en tête, marqués comme restant à compléter, pour
 * qu'on ne puisse pas remettre la pièce sans les avoir vus.
 */

type Traitement = {
  cle: string;
  nom: string;
  concerne: string[];
  ou: string;
  donnees: string[];
  finalite: string;
  conservation: string;
  destinataires: string[];
  effacement: 'anonymise' | 'supprime' | 'garde';
  pourquoi?: string;
};

type Registre = {
  misAJour: string;
  traitements: Traitement[];
  horsDePortee: { quoi: string; pourquoi: string }[];
  volumes: Record<string, number | null>;
  aCompleter: string[];
};

const LIBELLE_VOLUME: Record<string, string> = {
  commandes: 'Commandes enregistrées',
  paniers: 'Paniers en cours',
  relances: 'Traces de relance',
  refusDemarchage: 'Refus de démarchage',
  livreurs: 'Livreurs',
  boutiques: 'Boutiques',
  demandesDroits: 'Demandes de droits reçues',
};

const SORT: Record<string, string> = {
  anonymise: 'La personne en est retirée, la ligne subsiste',
  supprime: 'Supprimé',
  garde: 'Conservé',
};

export default function PageRegistre() {
  const [registre, setRegistre] = useState<Registre | null>(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const res = await fetchDashboard('/api/admin/registre');
        const corps = (await res.json().catch(() => null)) as (Registre & { error?: string }) | null;
        if (!vivant) return;
        if (res.ok && corps) setRegistre(corps);
        else setErreur(String(corps?.error ?? '') || 'Registre indisponible.');
      } catch (e) {
        if (vivant) setErreur(e instanceof Error ? e.message : 'Registre indisponible.');
      }
    })();
    return () => { vivant = false; };
  }, []);

  if (erreur) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-10">
        <LienRetour href="/admin">Retour au tableau</LienRetour>
        <p className="mt-6 flex items-start gap-2 text-sm text-bissap-600">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{erreur}</span>
        </p>
      </main>
    );
  }

  if (!registre) {
    return <main className="mx-auto max-w-4xl px-5 py-10 text-sm text-chaux-600">Lecture…</main>;
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <div className="print:hidden">
        <LienRetour href="/admin">Retour au tableau</LienRetour>
      </div>

      <header className="mt-6 border-b border-nuit-900/15 pb-5">
        <h1 className="font-display text-3xl text-nuit-900">Registre des traitements</h1>
        <p className="mt-1 text-sm text-chaux-600">
          DjiguiFlow · inventaire à jour au {registre.misAJour}
        </p>
        <p className="mt-3 max-w-2xl text-sm text-chaux-600">
          Ce document énumère les données personnelles que la plateforme détient, pourquoi
          elle les détient et combien de temps. Il est produit depuis le code lui-même : les
          durées annoncées ici sont celles qu’applique la tâche d’effacement nocturne.
        </p>
        <div className="mt-4 print:hidden">
          <Bouton variante="calme" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden />
            Imprimer
          </Bouton>
        </div>
      </header>

      <section className="mt-8 border border-mangue-300 bg-mangue-50 p-5">
        <h2 className="font-display text-lg text-nuit-900">À compléter avant remise</h2>
        <p className="mt-1 text-sm text-chaux-600">
          Ces éléments ne sont pas des faits techniques : le code ne peut pas les connaître,
          et les inventer produirait un document faux.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-nuit-900">
          {registre.aCompleter.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl text-nuit-900">Volumes constatés</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Object.entries(registre.volumes).map(([cle, valeur]) => (
            <div key={cle}>
              <dt className="text-sm text-chaux-600">{LIBELLE_VOLUME[cle] ?? cle}</dt>
              <dd className="font-display text-2xl text-nuit-900">
                {valeur === null ? 'non lu' : valeur}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-10 space-y-8">
        <h2 className="font-display text-xl text-nuit-900">Les traitements</h2>
        {registre.traitements.map((t, i) => (
          <article key={t.cle} className="break-inside-avoid border border-nuit-900/15 p-5">
            <h3 className="font-display text-lg text-nuit-900">
              {i + 1}. {t.nom}
            </h3>
            <p className="mt-1 text-sm text-chaux-600">
              Concerne : {t.concerne.join(', ')}
            </p>

            <dl className="mt-4 space-y-3 text-sm">
              <Ligne titre="Finalité">{t.finalite}</Ligne>
              <Ligne titre="Données">{t.donnees.join(' · ')}</Ligne>
              <Ligne titre="Où elles vivent">{t.ou}</Ligne>
              <Ligne titre="Durée de conservation">{t.conservation}</Ligne>
              <Ligne titre="Destinataires">{t.destinataires.join(' · ')}</Ligne>
              <Ligne titre="En cas de demande d’effacement">
                {SORT[t.effacement]}
                {t.pourquoi ? ` — ${t.pourquoi}` : ''}
              </Ligne>
            </dl>
          </article>
        ))}
      </section>

      <section className="mt-10 border border-nuit-900/15 p-5">
        <h2 className="font-display text-xl text-nuit-900">
          Les limites de l’effacement, déclarées
        </h2>
        <p className="mt-1 text-sm text-chaux-600">
          Taire ce qu’on ne peut pas effacer serait la seule faute grave de ce document.
          Ces limites sont aussi affichées au client, avant qu’il ne décide.
        </p>
        <ul className="mt-4 space-y-3 text-sm">
          {registre.horsDePortee.map((h) => (
            <li key={h.quoi}>
              <strong className="font-medium text-nuit-900">{h.quoi}</strong>
              <span className="text-chaux-600"> — {h.pourquoi}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Ligne({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[12rem_1fr]">
      <dt className="font-medium text-nuit-900">{titre}</dt>
      <dd className="text-chaux-600">{children}</dd>
    </div>
  );
}
