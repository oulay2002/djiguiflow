'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, MapPin, Search } from 'lucide-react';
import { ligneConfiance } from '@/lib/paliers';
import { Enseigne } from '@/components/ui/Enseigne';
import type { BoutiqueAnnuaire } from '@/lib/vitrine/annuaire';

/**
 * La vitrine des marchands, en bons de commande.
 *
 * Le systeme visuel de DjiguiFlow tient a un objet : le bon de commande qu'on
 * pince au-dessus du passe. La vitrine l'ignorait — degrades arbitraires,
 * cartes rondes, pastilles de couleur — et ne ressemblait a rien du produit.
 * Chaque boutique est ici un ticket : bord haut dechire, categorie tamponnee,
 * nom a l'enseigne, et une ligne de perforation avant le talon.
 *
 * Ce qui est affiche est vrai, et rien d'autre. La version precedente calculait
 * la note et le delai de livraison en hachant l'identifiant de la boutique :
 * Zahara annoncait 4,7 etoiles pour une satisfaction reelle de 2 sur 5, et un
 * delai que personne n'avait mesure. Les notes viennent desormais de
 * `notes_publiques()`, et le delai a disparu faute de source. Le badge
 * « sponsorisee » aussi : personne ne payait pour l'obtenir.
 */

const TRIS = [
  { cle: 'choix', label: 'Le plus de choix' },
  { cle: 'note', label: 'Mieux notées' },
  { cle: 'nom', label: 'Ordre alphabétique' },
] as const;

type Tri = (typeof TRIS)[number]['cle'];

type Props = {
  /**
   * Les boutiques listees, deja chargees par le serveur.
   *
   * `null` = la base n'a pas repondu, ce qui n'est PAS une place de marche
   * vide. L'ecran dit deux choses differentes selon le cas, et c'est la seule
   * facon de ne pas faire passer une panne pour un annuaire desert.
   */
  boutiques: BoutiqueAnnuaire[] | null;
};

export default function Annuaire({ boutiques: listeServeur }: Props) {
  const [recherche, setRecherche] = useState('');
  const [categorie, setCategorie] = useState('Toutes');
  const [tri, setTri] = useState<Tri>('choix');

  /*
    IL N'Y A PLUS D'ETAT DE CHARGEMENT, ET C'EST TOUT L'OBJET DE CE TRAVAIL.

    L'annuaire appelait `vitrine_boutiques()` dans un `useEffect` : son HTML ne
    contenait pas un seul nom de commerce, et le visiteur regardait trois
    rectangles gris le temps que le JavaScript arrive. La liste est desormais
    dans la page des le premier octet — les squelettes d'attente ont donc ete
    RETIRES plutot que rendus inatteignables : un ecran de chargement qui ne
    peut plus s'afficher est un mensonge dans le code.

    Ce qui reste ici est ce qui a toujours ete du navigateur : la recherche, le
    filtre par categorie et le tri.
  */
  // `?? []` fabrique un tableau NEUF a chaque rendu quand la lecture a echoue,
  // ce qui reduirait les deux memos ci-dessous a rien : ils se recalculeraient
  // sur chaque frappe dans la recherche. Le memo garde une identite stable.
  const boutiques = useMemo(() => listeServeur ?? [], [listeServeur]);
  const erreur = listeServeur === null
    ? "Les boutiques n'ont pas pu être chargées. Réessayez dans un instant."
    : null;

  const categories = useMemo(
    () => ['Toutes', ...Array.from(new Set(boutiques.map((b) => b.categorie))).sort()],
    [boutiques],
  );

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const filtrees = boutiques.filter((b) => {
      const dansCategorie = categorie === 'Toutes' || b.categorie === categorie;
      const dansRecherche =
        !q ||
        b.nom.toLowerCase().includes(q) ||
        b.zone.toLowerCase().includes(q) ||
        b.categorie.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q);
      return dansCategorie && dansRecherche;
    });

    return filtrees.sort((a, b) => {
      if (tri === 'note') return (b.note ?? -1) - (a.note ?? -1);
      if (tri === 'nom') return a.nom.localeCompare(b.nom, 'fr');
      return b.produits - a.produits;
    });
  }, [boutiques, categorie, recherche, tri]);

  return (
    <main id="contenu" className="min-h-screen bg-chaux-100">
      {/* La souche du carnet : ce que c'est, et un seul chiffre, qui est vrai. */}
      <header className="indigo-weave bg-nuit-900 text-chaux-50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="flex items-center justify-between gap-4">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-mangue-300">
              Carnet de commandes · Abidjan
            </p>
            <Link
              href="/"
              className="font-mono text-xs uppercase tracking-[0.2em] text-chaux-300 underline-offset-4 hover:text-chaux-50 hover:underline"
            >
              DjiguiFlow
            </Link>
          </div>

          <h1 className="mt-6 max-w-2xl font-display text-4xl font-black leading-[0.95] tracking-tight sm:text-6xl">
            Commandez chez les commerçants de votre quartier.
          </h1>

          <p className="mt-5 max-w-lg text-chaux-200">
            Vous écrivez, ils préparent, un livreur passe. Chaque boutique répond depuis son
            propre WhatsApp.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Rechercher une boutique</span>
              <Search
                aria-hidden
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-chaux-400"
              />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Une boutique, un quartier, un plat…"
                className="w-full border border-chaux-50/25 bg-nuit-800/70 py-3.5 pl-11 pr-4 text-chaux-50 placeholder:text-chaux-400 focus:border-mangue-300 focus:outline-none"
              />
            </label>

            <p className="font-mono text-xs uppercase tracking-[0.18em] text-chaux-300 sm:w-40 sm:text-right">
              {`${boutiques.length} boutique${boutiques.length > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="perf-line text-nuit-900" aria-hidden />

        {/* Les onglets du classeur. Les libellés viennent des boutiques. */}
        <div className="flex flex-wrap items-center justify-between gap-4 py-6">
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const actif = c === categorie;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategorie(c)}
                  aria-pressed={actif}
                  className={`flex min-h-11 items-center border px-3.5 font-mono text-xs uppercase tracking-[0.16em] transition ${
                    actif
                      ? 'border-nuit-900 bg-nuit-900 text-chaux-50'
                      : 'border-[var(--hairline)] text-chaux-600 hover:border-nuit-900 hover:text-nuit-900'
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>

          <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-chaux-600">
            Trier
            <select
              value={tri}
              onChange={(e) => setTri(e.target.value as Tri)}
              className="border border-[var(--hairline)] bg-transparent px-2 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-nuit-900"
            >
              {TRIS.map((t) => (
                <option key={t.cle} value={t.cle}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {erreur && (
          <p className="border border-bissap-200 bg-bissap-50 px-4 py-3 text-sm text-bissap-700">
            {erreur}
          </p>
        )}

        {!erreur && visibles.length === 0 && (
          <div className="border border-dashed border-[var(--hairline)] px-6 py-16 text-center">
            <p className="font-display text-xl font-bold text-nuit-900">Aucune boutique ici</p>
            <p className="mt-2 text-sm text-chaux-600">
              Essayez un autre quartier, ou effacez la recherche pour tout revoir.
            </p>
          </div>
        )}

        {/* Le rail de tickets. */}
        <ul className="grid gap-7 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((b, i) => (
                <li
                  key={b.id}
                  className="slip-in"
                  style={{ animationDelay: `${Math.min(i, 8) * 55}ms` }}
                >
                  <Link
                    href={`/boutiques/${b.lien}`}
                    // Toute la carte est cliquable ; sans ce libellé, un
                    // lecteur d'écran annoncerait le ticket entier comme nom
                    // du lien.
                    aria-label={`${b.nom} — voir la boutique`}
                    className="group relative flex h-full flex-col border border-[var(--hairline)] bg-chaux-50 soft-shadow transition-transform hover:-translate-y-1"
                    style={{ ['--tear-bg' as string]: '#eeece5' }}
                  >
                    <span className="tear absolute inset-x-0 top-0" aria-hidden />

                    <div className="flex flex-1 flex-col p-6 pt-8">
                      <div className="flex items-start justify-between gap-4">
                        <span className="stamp font-mono text-xs uppercase text-bissap-500">
                          {b.categorie}
                        </span>
                        {/* UNE MARQUE POUR CHAQUE BOUTIQUE, PAS SEULEMENT
                            POUR CELLES QUI ONT UN LOGO.
                            Ce coin restait VIDE quand le marchand n'en avait
                            pas depose : sa carte paraissait inachevee a cote
                            de celle du voisin, pour une raison qui ne dit rien
                            de son commerce. `Enseigne` retombe sur l'initiale
                            de l'enseigne, comme sur l'accueil.

                            AUCUN FOND, MEME POUR L'INITIALE. C'est la seule
                            regle qui tienne sur une grille de cartes : le
                            logo, lui, ne peut pas en avoir — il porte deja sa
                            limite. Encadrer l'initiale et pas le logo faisait
                            deux traitements cote a cote, et l'oeil lisait la
                            difference comme si elle disait quelque chose des
                            deux boutiques. Elle ne dit que ceci : l'une a
                            televerse une image, l'autre non.

                            L'initiale se lit sans cadre parce qu'elle est
                            ISOLEE dans le coin de la carte, loin de tout
                            texte. Ce n'est pas vrai partout : `Enseigne` garde
                            le cadre par defaut pour les ecrans ou la marque
                            est posee au fil d'une ligne. */}
                        <Enseigne
                          nom={b.nom}
                          logo={b.logo}
                          cadre={false}
                          className="h-11 w-11 shrink-0 text-2xl"
                        />
                      </div>

                      <h2 className="mt-6 font-display text-[1.7rem] font-black uppercase leading-[0.95] tracking-tight text-nuit-900">
                        {b.nom}
                      </h2>

                      {b.description && (
                        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-chaux-600">
                          {b.description}
                        </p>
                      )}

                      {/* LA MARCHANDISE, ET C'EST LE POINT DE TOUTE LA CARTE.
                          Un visiteur ne clique pas sur un nom de boutique : il
                          clique sur quelque chose qu'il a vu. La carte disait
                          « 5 articles » — un chiffre ne donne envie de rien.

                          La bande n'apparait que s'il y a de vraies photos :
                          des cadres vides feraient paraitre la boutique plus
                          pauvre que le silence. */}
                      {b.apercus.length > 0 && (
                        <div className="mt-5 grid grid-cols-4 gap-1.5">
                          {b.apercus.slice(0, 4).map((photo, j) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={j}
                              src={photo}
                              alt=""
                              loading="lazy"
                              className="aspect-square w-full border border-[var(--hairline)] object-cover transition duration-500 group-hover:brightness-105"
                            />
                          ))}
                        </div>
                      )}

                      {/* CE QUE LES AUTRES ONT PRIS.
                          Sur une page ou l'on COMPARE des boutiques, c'est le
                          renseignement le plus utile qu'on puisse donner : le
                          nombre d'articles dit la taille du catalogue, le prix
                          plancher dit le budget, mais seul celui-ci dit ce qui
                          marche. Un visiteur qui hesite entre deux enseignes
                          n'a pas d'autre facon de le savoir.

                          Il compte les COMMANDES DISTINCTES, pas les unites :
                          un client qui prend cinq burgers ne fait pas un
                          best-seller. Et il se tait sous trois commandes —
                          cette plateforme a deja paye pour avoir affiche une
                          note calculee a la place d'une note reelle.

                          La photo en tete de bande est la sienne : la fonction
                          de vitrine la remonte en premier. */}
                      {b.vedette && (
                        <p className="mt-3 flex items-baseline gap-2 font-mono text-xs uppercase tracking-[0.14em]">
                          <span className="text-chaux-600">le plus commandé</span>
                          <span className="min-w-0 truncate normal-case tracking-normal text-nuit-900">
                            {b.vedette}
                          </span>
                        </p>
                      )}

                      <dl className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs uppercase tracking-[0.14em] text-chaux-600">
                        <div className="flex items-center gap-1.5">
                          <dt className="sr-only">Quartier</dt>
                          <MapPin aria-hidden className="h-3.5 w-3.5" />
                          <dd>{b.zone}</dd>
                        </div>
                        <div>
                          <dt className="sr-only">Articles</dt>
                          <dd>
                            {b.produits} article{b.produits > 1 ? 's' : ''}
                          </dd>
                        </div>
                        {/* UN REPERE DE PRIX. Sans plancher, le visiteur ne
                            sait pas si la boutique est pour lui et n'ose pas
                            entrer pour le decouvrir. */}
                        {b.prixMin !== null && (
                          <div>
                            {/* LE TERME N'EST PLUS CACHE : il est devenu la
                                phrase elle-meme. « Des 1 000 F » se lit vite
                                comme un prix alors que c'est un PLANCHER, et
                                le lecteur d'ecran entendait deja la bonne
                                formule — l'oeil, lui, avait la mauvaise. */}
                            <dt className="sr-only">Prix</dt>
                            <dd className="text-nuit-900">
                              à partir de {b.prixMin.toLocaleString('fr-FR')} F
                            </dd>
                          </div>
                        )}
                      </dl>

                      {/* OUVERT OU FERME, DES LA CARTE. On l'apprenait apres
                          avoir clique, et c'est la boutique qu'on jugeait —
                          pas l'heure. La regle vient de `etatBoutique`, la
                          meme qui refuse la commande cote serveur : les deux
                          ne peuvent pas se contredire. */}
                      {b.messageHoraire && (
                        <p className="mt-4">
                          <span
                            className={`inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-xs uppercase tracking-[0.14em] ${
                              b.ouvert
                                ? 'border-accent-300 bg-accent-50 text-accent-700'
                                : 'border-[var(--hairline)] bg-chaux-100 text-chaux-600'
                            }`}
                          >
                            <span
                              aria-hidden
                              className={`h-1.5 w-1.5 rounded-full ${
                                b.ouvert ? 'bg-accent-500' : 'bg-chaux-400'
                              }`}
                            />
                            {b.messageHoraire}
                          </span>
                        </p>
                      )}

                      <p className="mt-auto flex items-baseline gap-2 pt-6">
                        {b.note !== null && (
                          <span className="font-display text-lg font-bold text-nuit-900">
                            {b.note.toFixed(1).replace('.', ',')}
                            <span className="text-chaux-600">/5</span>
                          </span>
                        )}
                        <span className="font-mono text-xs uppercase tracking-[0.14em] text-chaux-600">
                          {ligneConfiance(b)}
                        </span>
                      </p>
                    </div>

                    {/* La couture, puis le talon qu'on détache pour entrer. */}
                    <div className="perf-line mx-6 text-nuit-900" aria-hidden />
                    <span className="flex items-center justify-between px-6 py-4 font-mono text-xs uppercase tracking-[0.18em] text-nuit-900 transition-colors group-hover:bg-nuit-900 group-hover:text-chaux-50">
                      Voir la boutique
                      <ArrowRight
                        aria-hidden
                        className="h-4 w-4 transition-transform group-hover:translate-x-1"
                      />
                    </span>
                  </Link>
                </li>
              ))}
        </ul>
      </div>
    </main>
  );
}
