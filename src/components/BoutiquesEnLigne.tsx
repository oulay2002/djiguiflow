'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
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
  vedette: string | null;
  vedette_commandes: number | null;
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
  /** Le produit que le plus de clients differents ont commande. Vide si aucun ne se detache. */
  vedette: string | null;
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
              // La fonction ne la rend que si trois clients differents au moins
              // l'ont commandee ces trente jours : en dessous, « le plus
              // commande » serait du bruit habille en donnee.
              vedette: f.vedette?.trim() || null,
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
              className="group flex flex-col overflow-hidden border border-chaux-200/80 bg-white transition duration-300 soft-shadow hover:-translate-y-1 hover:border-chaux-300"
            >
              {/* LA MARCHANDISE D'ABORD, ET EN GRAND.
                  Quatre carres egaux separes de filets se lisaient comme une
                  planche-contact : un inventaire, pas une devanture. Une image
                  dominante et deux d'appui, sans filet entre elles, donnent a
                  la premiere le poids qu'elle merite — c'est elle qu'on
                  regarde, les autres disent seulement qu'il y a du choix.

                  La bande ne s'affiche que s'il y a de vraies photos : des
                  cadres vides feraient paraitre la boutique plus pauvre que le
                  silence. */}
              {b.apercus.length > 0 && (
                <div
                  className={`relative grid overflow-hidden bg-chaux-100 ${
                    b.apercus.length >= 3
                      ? 'aspect-[3/2] grid-cols-3 grid-rows-2'
                      : b.apercus.length === 2
                        ? 'aspect-[3/2] grid-cols-2'
                        : 'aspect-[3/2]'
                  }`}
                >
                  {b.apercus.slice(0, 3).map((photo, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={photo}
                      alt=""
                      loading="lazy"
                      className={`h-full w-full object-cover transition duration-700 group-hover:scale-[1.03] ${
                        i === 0 && b.apercus.length >= 3 ? 'col-span-2 row-span-2' : ''
                      }`}
                    />
                  ))}

                  {/* CE QUE LES CLIENTS CHOISISSENT, NOMME SUR L'IMAGE.
                      La photo dominante est desormais celle du produit le plus
                      commande — pas la premiere du catalogue, qui ne disait que
                      l'ordre de saisie du marchand. L'etiquette dit pourquoi
                      elle est la : sans elle, le visiteur voit une photo de
                      plus ; avec elle, il voit un choix collectif.

                      Posee en bas a gauche, sur la seule zone que la mosaique
                      garde toujours pleine. */}
                  {/* 10 PX EST UNE DECISION, PAS UN OUBLI — mesuree le
                      3 septembre 2026, a 390 px, sur la production.

                      C'est sous le plancher de 12 px qu'on s'impose ailleurs.
                      Mais a 12 px, LES DEUX BADGES SE TRONQUENT : 285 px
                      disponibles pour 285 demandes, contre 279 et 272 a 10 px.
                      On perdrait le nom du produit vedette — c'est-a-dire
                      l'information meme du badge, dont l'etiquette n'est que le
                      contexte.

                      Ce qui rend le compromis tenable : majuscules, tracking
                      large, et blanc sur `nuit-900/85` — le contraste est
                      largement au-dessus du seuil. Agrandir sans elargir la
                      boite echangerait une regle tenue contre une information
                      perdue. */}
                  {b.vedette && (
                    <span className="absolute bottom-0 left-0 max-w-[80%] truncate bg-nuit-900/85 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white backdrop-blur-[2px]">
                      Le plus commandé · {b.vedette}
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-4 px-5 pb-4 pt-5">
                {/* SANS CADRE, ET POUR LES DEUX CAS.
                    Un logo porte deja sa propre limite ; l'enfermer dans une
                    bordure lui ajoute une seconde frontiere et le fait passer
                    pour une vignette. Il ne peut donc pas en avoir.

                    L'initiale non plus, ici. Encadrer l'une et pas l'autre
                    mettait deux traitements cote a cote sur la meme grille, et
                    l'oeil lisait cette difference comme si elle disait quelque
                    chose des deux boutiques. Elle ne dit que ceci : l'une a
                    televerse une image, l'autre non — ce qui ne regarde pas le
                    visiteur.

                    Elle tient sans cadre parce qu'elle occupe un EMPLACEMENT :
                    onze pixels carres devant un bloc de deux lignes, separee
                    par un ecart franc. Ce n'est pas une lettre au fil du
                    texte, et `Enseigne` garde son cadre par defaut pour les
                    ecrans ou elle en serait une. */}
                <Enseigne
                  nom={b.nom}
                  logo={b.logo}
                  cadre={false}
                  className="h-11 w-11 shrink-0 text-2xl"
                />

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-xl font-bold leading-tight tracking-[-0.01em] text-nuit-900">
                    {b.nom}
                  </span>
                  {/* CHAUX-600, ET PAS 500 : 4,05 CONTRE 4,5 EXIGES.
                      Mesure du 3 septembre 2026 par `contraste-rendu.mjs`, sur
                      la page RENDUE. `contraste.mjs` ne pouvait pas le voir :
                      il releve les paires ecrites dans un meme `className`, et
                      ici la couleur est sur ce span quand le fond blanc vient
                      du `<a>` deux niveaux plus haut. Vu a 390 px avant et
                      apres — le nom reste dominant, la hierarchie tient. */}
                  <span className="mt-1 block truncate font-mono text-xs uppercase tracking-[0.16em] text-chaux-600">
                    {b.secteur}
                    {b.zone && ` · ${b.zone}`}
                  </span>
                </span>

              </div>

              {/* Ce qui pend sous la carte reste colle en bas, meme quand une
                  boutique n'a ni prix ni horaire a montrer : sans cela, les
                  cartes d'une meme rangee finiraient leur invitation a des
                  hauteurs differentes. */}
              <div className="mt-auto">
                {/* Le prix plancher et l'heure : deux raisons d'entrer, ou une
                    raison de revenir plus tard. On l'apprenait apres avoir
                    clique, et c'est la boutique qu'on jugeait — pas l'heure. */}
                {(b.prixMin !== null || b.messageHoraire) && (
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-chaux-200/70 px-5 py-3 font-mono text-xs uppercase tracking-[0.14em]">
                    {b.prixMin !== null && (
                      // « A PARTIR DE » PLUTOT QUE « DES ».
                      // « Des 1 000 F » se lit vite comme un prix, alors que
                      // c'est un PLANCHER : le premier reflexe est de croire
                      // qu'on paiera cette somme. La formule longue dit ce
                      // qu'elle est, et c'est deja le mot que le lecteur
                      // d'ecran entendait ici.
                      <span className="text-nuit-900">
                        à partir de {b.prixMin.toLocaleString('fr-FR')} F
                      </span>
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

                {/* DIRE QU'ON PEUT ENTRER, AU LIEU DE L'ESPERER.
                    Toute la carte est cliquable depuis toujours, mais rien ne
                    le disait : une fleche de cinq pixels en gris clair, posee
                    a cote du nom, ne se voit pas. Un visiteur qui decouvre le
                    site regardait donc une belle vitrine sans savoir qu'elle
                    s'ouvre — et la plus jolie carte du monde ne sert a rien
                    si personne ne clique dessus.

                    C'est le meme talon que sur la page des boutiques, jusqu'a
                    l'inversion au survol : deux ecrans qui montrent la meme
                    chose doivent s'ouvrir du meme geste. */}
                <span className="flex items-center justify-between border-t border-chaux-200/70 px-5 py-3.5 font-mono text-xs uppercase tracking-[0.18em] text-nuit-900 transition-colors group-hover:bg-nuit-900 group-hover:text-chaux-50">
                  Voir la boutique
                  <ArrowRight
                    aria-hidden
                    className="h-4 w-4 transition-transform group-hover:translate-x-1"
                  />
                </span>
              </div>
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
