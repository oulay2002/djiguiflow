'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchDashboard } from '@/lib/apiClient';

/**
 * Le tableau de l'exploitant.
 *
 * IL REPOND A UNE SEULE QUESTION : qui a besoin de moi aujourd'hui ?
 *
 * Savoir qu'on a trois marchands ne dit rien a faire. Ce qui compte, c'est de
 * voir OU CHACUN EST BLOQUE — celui qui s'est inscrit sans se brancher n'a pas
 * besoin de la meme chose que celui qui vendait et s'est arrete. D'ou
 * l'entonnoir en tete : sa FORME dit ou l'on perd du monde, ce qu'aucun total
 * ne montre.
 *
 * Le goulot de la plateforme n'est pas le trafic mais l'offre marchande. Les
 * visiteurs viennent donc apres, et volontairement en second.
 */

type Marchand = {
  slug: string | null;
  nom: string | null;
  categorie: string | null;
  actif: boolean;
  articles: number;
  commandes: number;
  commandesRecentes: number;
  derniereVente: string | null;
  manque: string[];
  etat: 'non branche' | 'branche sans vente' | 'vend' | 'en sommeil';
};

type Tableau = {
  marchands: Marchand[];
  entonnoir: Record<string, number>;
  visiteurs: { jour: string; acheter: number; vendre: number }[];
  anomalies: { type: string; reference: string; signale_le: string }[];
  fenetres: { activiteJours: number; sommeilJours: number };
};

/** L'ordre de l'entonnoir est celui que TRAVERSE un marchand, pas l'alphabet. */
const ETAPES = [
  { cle: 'non branche', titre: 'Inscrits, pas branchés', quoi: 'Il leur manque quelque chose pour servir une commande.' },
  { cle: 'branche sans vente', titre: 'Branchés, aucune vente', quoi: 'Tout fonctionne, personne n’a commandé.' },
  { cle: 'vend', titre: 'Vendent', quoi: 'Une commande au moins récemment.' },
  { cle: 'en sommeil', titre: 'En sommeil', quoi: 'Ont vendu, puis se sont arrêtés.' },
] as const;

const COULEUR: Record<string, string> = {
  'non branche': 'border-bissap-300 bg-bissap-50 text-bissap-700',
  'branche sans vente': 'border-mangue-300 bg-mangue-50 text-mangue-700',
  vend: 'border-accent-300 bg-accent-50 text-accent-700',
  // La rampe `chaux` s'arrete a 600, la ou bissap, mangue et accent vont a 700.
  // Ce badge portait le niveau 700 par mimetisme de ses voisines : la classe ne
  // designait rien, et le texte heritait de la couleur ambiante au lieu d'etre
  // pose. Voir scripts/palette-maison.mjs, qui lit le TEXTE du fichier — ne pas
  // ecrire un niveau hors rampe ici, meme en commentaire.
  'en sommeil': 'border-chaux-300 bg-chaux-100 text-chaux-600',
};

function depuis(iso: string | null): string {
  if (!iso) return 'jamais';
  const jours = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (jours <= 0) return 'aujourd’hui';
  if (jours === 1) return 'hier';
  return `il y a ${jours} jours`;
}

export default function AdminPage() {
  const [t, setT] = useState<Tableau | null>(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchDashboard('/api/admin/tableau');
        const d = await r.json();
        if (!r.ok) { setErreur(d?.error || `Erreur ${r.status}`); return; }
        setT(d);
      } catch {
        setErreur('Connexion impossible.');
      }
    })();
  }, []);

  // ON NE MONTRE PAS LA PORTE A QUI N'A PAS LA CLE.
  //
  // Un marchand qui tapait cette adresse voyait « reserve a l administration
  // DjiguiFlow » : aucune donnee ne fuyait — la route est fermee cote serveur —
  // mais l'ecran ANNONCAIT l'existence d'une zone d'exploitation et invitait a
  // y revenir. Le renvoi vers son propre tableau de bord ne dit rien de plus
  // que ce qu'il sait deja.
  //
  // Le renvoi n'est PAS le controle d'acces : celui-ci reste `exigerAdmin`,
  // cote serveur. Masquer un ecran n'a jamais protege une donnee.
  if (erreur) {
    if (typeof window !== 'undefined') window.location.replace('/dashboard');
    return null;
  }

  if (!t) {
    return (
      <main className="min-h-screen bg-chaux-50 px-5 py-20">
        <div className="mx-auto h-40 max-w-4xl animate-pulse border border-chaux-200 bg-white" />
      </main>
    );
  }

  const total = t.marchands.length;
  const commandesRecentes = t.marchands.reduce((s, m) => s + m.commandesRecentes, 0);

  return (
    <main className="min-h-screen bg-chaux-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-12 sm:px-6">

        <header>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.24em] text-chaux-600">
            administration DjiguiFlow
          </p>
          <h1 className="mt-3 font-display text-3xl font-black leading-tight text-nuit-900 sm:text-4xl">
            Qui a besoin de vous aujourd’hui&nbsp;?
          </h1>
          <p className="mt-3 max-w-2xl text-nuit-700">
            {total} marchand{total > 1 ? 's' : ''} · {commandesRecentes} commande
            {commandesRecentes > 1 ? 's' : ''} sur {t.fenetres.activiteJours} jours.
          </p>
        </header>

        {/* L'ENTONNOIR. Sa forme dit ou l'on perd du monde — un total ne le
            montre jamais. */}
        <section>
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-nuit-900">
            L’entonnoir marchand
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ETAPES.map((e) => (
              <div key={e.cle} className={`border p-4 ${COULEUR[e.cle]}`}>
                <p className="font-display text-3xl font-black tabular-nums">
                  {t.entonnoir[e.cle] ?? 0}
                </p>
                <p className="mt-1 font-semibold">{e.titre}</p>
                <p className="mt-1 text-sm opacity-80">{e.quoi}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Chaque marchand, et surtout CE QUI LUI MANQUE. */}
        <section>
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-nuit-900">
            Les marchands
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-nuit-900 text-left font-mono text-xs uppercase tracking-[0.14em] text-chaux-600">
                  <th className="py-2 pr-4 font-normal">Boutique</th>
                  <th className="py-2 pr-4 font-normal">État</th>
                  <th className="py-2 pr-4 text-right font-normal">Articles</th>
                  <th className="py-2 pr-4 text-right font-normal">Cmd. {t.fenetres.activiteJours}j</th>
                  <th className="py-2 font-normal">Dernière vente</th>
                </tr>
              </thead>
              <tbody>
                {t.marchands.map((m) => (
                  <tr key={m.slug ?? m.nom} className="border-b border-chaux-200 align-top">
                    <td className="py-3 pr-4">
                      <Link
                        href={`/boutiques/${m.slug}`}
                        className="font-semibold text-nuit-900 underline underline-offset-4 hover:text-bissap-600"
                      >
                        {m.nom}
                      </Link>
                      <span className="mt-0.5 block font-mono text-xs uppercase tracking-[0.12em] text-chaux-600">
                        {m.categorie}
                        {!m.actif && ' · désactivée'}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block border px-2 py-0.5 font-mono text-xs uppercase ${COULEUR[m.etat]}`}>
                        {m.etat}
                      </span>
                      {/* Ce qui manque est nomme : c'est ce qu'on ira lui dire. */}
                      {m.manque.length > 0 && (
                        <span className="mt-1 block text-xs text-bissap-700">
                          manque : {m.manque.join(', ')}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">{m.articles}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{m.commandesRecentes}</td>
                    <td className="py-3 text-chaux-600">{depuis(m.derniereVente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* LES VISITEURS EN SECOND, a dessein : le goulot est l'offre
            marchande, pas le trafic. */}
        <section>
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-nuit-900">
            Par quelle porte ils entrent
          </h2>
          {t.visiteurs.length === 0 ? (
            <p className="mt-3 border border-dashed border-chaux-300 p-5 text-sm text-chaux-600">
              Aucun clic encore. Les deux portes viennent d’être posées — laissez-leur
              quelques semaines avant d’en conclure quoi que ce soit.
            </p>
          ) : (
            <table className="mt-4 w-full max-w-md border-collapse text-sm">
              <thead>
                <tr className="border-b border-nuit-900 text-left font-mono text-xs uppercase tracking-[0.14em] text-chaux-600">
                  <th className="py-2 pr-4 font-normal">Jour</th>
                  <th className="py-2 pr-4 text-right font-normal">Acheter</th>
                  <th className="py-2 text-right font-normal">Vendre</th>
                </tr>
              </thead>
              <tbody>
                {t.visiteurs.map((v) => (
                  <tr key={v.jour} className="border-b border-chaux-200">
                    <td className="py-2 pr-4 font-mono text-xs">{v.jour}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{v.acheter}</td>
                    <td className="py-2 text-right tabular-nums">{v.vendre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-nuit-900">
            Chaînes rompues, 7 derniers jours
          </h2>
          {t.anomalies.length === 0 ? (
            <p className="mt-3 border border-accent-300 bg-accent-50 p-5 text-sm text-accent-700">
              Aucune. Le silence est le bon résultat.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {t.anomalies.map((a, i) => (
                <li key={i} className="border border-chaux-200 bg-white px-4 py-2.5 text-sm">
                  <span className="font-mono text-xs uppercase tracking-[0.12em] text-bissap-700">
                    {a.type}
                  </span>
                  <span className="ml-3 font-mono text-xs text-nuit-900">{a.reference}</span>
                  <span className="ml-3 text-xs text-chaux-600">{depuis(a.signale_le)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
    </main>
  );
}
