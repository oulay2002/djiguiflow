'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Enseigne } from '@/components/ui/Enseigne';
import { etatBoutique } from '@/lib/horaires';

type Ligne = {
  id: string;
  slug: string | null;
  nom: string | null;
  categorie: string | null;
  zone: string | null;
  logo_url: string | null;
  apercus: string[] | null;
  prix_min: number | string | null;
  horaires: unknown;
  pause_jusqua: string | null;
};

type Boutique = {
  lien: string;
  nom: string;
  secteur: string;
  zone: string;
  logo: string | null;
  apercus: string[];
  prixMin: number | null;
  ouvert: boolean;
  messageHoraire: string | null;
};

/**
 * Les boutiques reellement en ligne, sur la page d'accueil.
 *
 * DEUX PUBLICS ARRIVENT ICI, ET CETTE SECTION LES SERT TOUS LES DEUX. Au
 * visiteur qui veut acheter, elle montre ou aller. Au commercant qui hesite,
 * elle prouve que des enseignes reelles tournent — et rien ne le convainc mieux
 * que de voir de la marchandise en vente.
 *
 * C'est pourquoi elle montre des PHOTOS D'ARTICLES et non des noms. Une carte
 * qui annonce « Chez Zahara — RESTAURANT » ne donne envie a personne : ni au
 * client, qui ne sait pas ce qu'on y vend, ni au marchand, qui n'y voit qu'un
 * annuaire. Voir quatre plats en vente, un prix plancher et « ouvert jusqu'a
 * 20 h », c'est voir un commerce vivant.
 *
 * ELLE LIT LE CATALOGUE PUBLIC, PAS LE REGISTRE. Le registre contient aussi les
 * boutiques desactivees et les comptes de test — il sert aux taches planifiees.
 * « Atelier Temoin », compte d'essai desactive, s'affichait ainsi en page
 * d'accueil sous « Vous pouvez commander chez eux maintenant » : un visiteur
 * qui cliquait tombait sur une boutique factice. Le pire endroit pour perdre sa
 * credibilite, sur la promesse elle-meme.
 *
 * Ne rend rien tant qu'aucune boutique n'est revenue : mieux vaut pas de
 * section qu'une section vide sur la page d'accueil.
 */
export default function BoutiquesEnLigne() {
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);

  useEffect(() => {
    let annule = false;

    (async () => {
      try {
        const { data, error } = await supabase.rpc('vitrine_boutiques');
        if (annule || error || !Array.isArray(data)) return;

        setBoutiques(
          (data as Ligne[]).map((f) => {
            const prix = f.prix_min == null ? null : Number(f.prix_min);
            const etat = etatBoutique(f.horaires, new Date(), f.pause_jusqua);
            return {
              lien: f.slug?.trim() || f.id,
              nom: f.nom?.trim() || 'Boutique',
              secteur: f.categorie?.trim() || 'Commerce',
              zone: f.zone?.trim() || '',
              logo: f.logo_url?.trim() || null,
              apercus: (f.apercus ?? []).filter((u) => String(u ?? '').trim()),
              prixMin: prix !== null && Number.isFinite(prix) && prix > 0 ? prix : null,
              ouvert: etat.ouvert,
              messageHoraire: etat.message,
            };
          }),
        );
      } catch {
        // Le catalogue est injoignable : la page d'accueil reste entiere.
      }
    })();

    return () => { annule = true; };
  }, []);

  if (boutiques.length === 0) return null;

  return (
    <section className="py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.24em] text-chaux-600">
          déjà sur DjiguiFlow
        </p>
        <h2 className="mt-4 max-w-2xl font-display text-3xl font-black leading-tight text-nuit-900 sm:text-4xl">
          Leurs boutiques tournent déjà. Vous pouvez commander chez eux maintenant.
        </h2>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {boutiques.map((b) => (
            <Link
              key={b.lien}
              href={`/boutiques/${b.lien}`}
              aria-label={`${b.nom} — voir la boutique`}
              className="group flex flex-col border border-[var(--hairline)] bg-white transition duration-200 soft-shadow hover:-translate-y-1"
            >
              {/* LA MARCHANDISE D'ABORD. C'est ce qu'on regarde, et c'est la
                  seule chose qui donne envie d'entrer. La bande ne s'affiche
                  que s'il y a de vraies photos : des cadres vides feraient
                  paraitre la boutique plus pauvre que le silence. */}
              {b.apercus.length > 0 && (
                <div className="grid grid-cols-4 gap-px bg-[var(--hairline)]">
                  {b.apercus.slice(0, 4).map((photo, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={photo}
                      alt=""
                      loading="lazy"
                      className="aspect-square w-full bg-chaux-100 object-cover transition duration-500 group-hover:brightness-105"
                    />
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4 p-4">
                <Enseigne
                  nom={b.nom}
                  logo={b.logo}
                  className="h-12 w-12 shrink-0 text-xl"
                />

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-lg font-bold leading-tight text-nuit-900">
                    {b.nom}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-xs uppercase tracking-[0.16em] text-chaux-600">
                    {b.secteur}
                    {b.zone && ` · ${b.zone}`}
                  </span>
                </span>

                <ArrowUpRight className="h-5 w-5 shrink-0 text-chaux-400 transition group-hover:text-bissap-500" />
              </div>

              {/* Le prix plancher et l'heure : deux raisons d'entrer, ou une
                  raison de revenir plus tard. On l'apprenait apres avoir
                  clique, et c'est la boutique qu'on jugeait — pas l'heure. */}
              {(b.prixMin !== null || b.messageHoraire) && (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--hairline)] px-4 py-2.5 font-mono text-xs uppercase tracking-[0.14em]">
                  {b.prixMin !== null && (
                    <span className="text-nuit-900">dès {b.prixMin.toLocaleString('fr-FR')} F</span>
                  )}
                  {b.messageHoraire && (
                    <span className={b.ouvert ? 'text-accent-700' : 'text-chaux-600'}>
                      <span
                        aria-hidden
                        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                          b.ouvert ? 'bg-accent-500' : 'bg-chaux-400'
                        }`}
                      />
                      {b.messageHoraire}
                    </span>
                  )}
                </p>
              )}
            </Link>
          ))}

          {/* L'emplacement libre vaut mieux qu'une liste gonflée : il dit que
              la place est ouverte au lieu de masquer qu'elle l'est. */}
          <Link
            href="/register"
            className="group flex items-center gap-4 border border-dashed border-chaux-300 p-4 transition hover:border-bissap-400 hover:bg-white"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center border border-dashed border-chaux-300 text-chaux-600 transition group-hover:border-bissap-300 group-hover:text-bissap-500">
              <Plus className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg font-bold leading-tight text-nuit-800">
                Votre enseigne ici
              </span>
              <span className="mt-0.5 block font-mono text-xs uppercase tracking-[0.16em] text-chaux-600">
                30 jours offerts
              </span>
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
