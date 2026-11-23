'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { classesBouton } from '@/components/ui/Bouton';
import {
  etapesDuRecu,
  lienVersLaBoutique,
  recoursDuRecu,
  type Recu as DonneesRecu,
} from '@/lib/vitrine/recu';

/**
 * Le recu : la souche qu'on garde quand le bon de commande est parti.
 *
 * ── CE QU'IL DOIT FAIRE COMPRENDRE EN UN REGARD ────────────────────────────
 *
 * Deux choses, dans cet ordre. La commande est RECUE — le tampon le dit, et le
 * client cesse de se demander si le bouton a marche. Et elle n'est PAS FINIE :
 * il lui reste a repondre sur WhatsApp, sans quoi rien n'est prepare. Le titre
 * porte donc l'etape a faire, pas la felicitation ; le tampon suffit a dire
 * que c'est parti.
 *
 * ── LA MATIERE EST CELLE DU BON ────────────────────────────────────────────
 *
 * Meme papier, memes encoches, meme perforation que le ticket qui se
 * remplissait plus bas : c'est le meme objet, apres l'envoi. Le client
 * reconnait ce qu'il vient de composer au lieu de decouvrir un encart.
 *
 * ── LA MANGUE, ET PAS LE VERT, POUR CE QUI RESTE A FAIRE ───────────────────
 *
 * DESIGN.md : la mangue dit « commence, pas fini », la feuille dit « fait ».
 * La reception est faite — tampon en feuille. La commande, elle, attend une
 * reponse — le bloc des etapes est en mangue. Tout peindre en vert dirait
 * « termine » au moment exact ou il ne faut pas le croire.
 */

const fcfa = (n: number) => Math.round(n).toLocaleString('fr-FR');

export function Recu({
  recu,
  slug,
  fondPage,
  onMasquer,
}: {
  recu: DonneesRecu;
  slug: string;
  /** La couleur du fond de page : les encoches du ticket y sont decoupees. */
  fondPage: string;
  onMasquer: () => void;
}) {
  /**
   * LE FOCUS VA SUR LE TITRE, QUI DIT L'ETAPE A FAIRE.
   * Le bouton d'envoi se desactive puis disparait avec le panier : le focus
   * retombait sur `<body>`, et un lecteur d'ecran n'entendait rien d'une
   * commande pourtant partie. Le titre l'annonce, et la lecture enchaine sur
   * les etapes. `preventScroll` : le defilement est deja conduit par la page.
   */
  const titre = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    titre.current?.focus({ preventScroll: true });
  }, [recu.reference]);

  const [premiere, ...suite] = etapesDuRecu(recu);
  const recours = recoursDuRecu(recu);
  const versLaBoutique = lienVersLaBoutique(recu.telephoneBoutique, recu.reference);

  const suivi = `/suivi?ref=${encodeURIComponent(recu.reference)}`
    + `&boutique=${encodeURIComponent(slug)}`
    + (recu.jeton ? `&t=${encodeURIComponent(recu.jeton)}` : '');

  return (
    <section
      aria-labelledby="titre-recu"
      className="relative mb-8 max-w-xl border border-[var(--hairline)] bg-chaux-50 p-5 soft-shadow"
      style={{ ['--tear-bg' as string]: fondPage }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-chaux-600">
          Reçu de commande
        </p>
        <span className="stamp font-mono text-xs font-bold text-accent-700">REÇUE</span>
      </div>
      <div className="tear absolute inset-x-0 top-14" aria-hidden />

      <h2
        id="titre-recu"
        ref={titre}
        tabIndex={-1}
        className="pt-10 font-display text-2xl font-bold leading-tight tracking-[-0.01em] text-nuit-900 outline-none"
      >
        Il vous reste à confirmer sur WhatsApp
      </h2>

      {/* La suite, dans l'ordre ou elle arrive. La liste est numerotee parce
          que l'ordre EST l'information : rien ne se prepare avant la reponse.
          La premiere ligne est la seule que le client doive executer — elle
          porte seule la graisse et l'encre pleine. */}
      <ol className="mt-4 space-y-2 border border-mangue-200 bg-mangue-50 p-4">
        <li className="flex gap-3 text-sm font-semibold leading-relaxed text-nuit-900">
          <span className="font-mono tabular-nums text-mangue-700" aria-hidden>1</span>
          <span>{premiere}</span>
        </li>
        {suite.map((etape, i) => (
          <li key={etape} className="flex gap-3 text-sm leading-relaxed text-nuit-800">
            <span className="font-mono tabular-nums text-mangue-700" aria-hidden>{i + 2}</span>
            <span className="break-words">{etape}</span>
          </li>
        ))}
      </ol>

      {/* ET SI LE MESSAGE N'ARRIVE PAS ?
          Le recu demande de repondre a un message. Un numero mal tape, ou
          sans WhatsApp, et ce message n'arrive jamais : le client attendait
          devant « REÇUE », et le commerce perdait la vente sans le savoir.
          On lui dit quoi verifier, et on lui ouvre la conversation avec la
          boutique, reference deja ecrite.

          Ce lien ne CONFIRME rien : confirmer depuis cette page validerait
          une commande sans jamais avoir verifie que le numero existe. Il
          reste donc en texte, sous le bloc des etapes, et non en bouton —
          la seule chose a faire reste de repondre au message. */}
      {recours && (
        <div className="mt-3 text-sm leading-relaxed text-chaux-600">
          <p>{recours}</p>
          {versLaBoutique && (
            <a
              href={versLaBoutique}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center font-medium text-nuit-800 underline decoration-chaux-300 underline-offset-4 transition hover:decoration-nuit-800"
            >
              Écrire à la boutique sur WhatsApp
            </a>
          )}
        </div>
      )}

      {/* La reference se garde : c'est elle qu'on donne au commercant au
          telephone, et celle que `/suivi` et `/mes-donnees` demandent. En
          mono, `select-all` : un appui long la prend entiere, sans viser. */}
      <dl className="mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <dt className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-chaux-600">
          Référence
        </dt>
        <dd className="select-all break-all font-mono text-sm font-bold text-nuit-900">
          {recu.reference}
        </dd>
      </dl>

      <ul className="mt-4 space-y-2">
        {recu.lignes.map((l) => (
          <li
            key={`${l.nom}::${l.variante}`}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="min-w-0 break-words text-nuit-800">
              <span className="font-mono font-bold text-chaux-600">{l.quantite}×</span>{' '}
              {l.nom}
              {l.variante && <span className="text-chaux-600"> · {l.variante}</span>}
            </span>
            <span className="shrink-0 font-mono text-nuit-900">{fcfa(l.montant)}</span>
          </li>
        ))}
      </ul>

      <div className="perf-line my-4 text-nuit-900" aria-hidden />

      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-chaux-600">
          Total
        </span>
        <span className="font-mono text-2xl font-black text-bissap-600">
          {fcfa(recu.total)}
          <span className="ml-1 text-xs font-semibold text-chaux-600">FCFA</span>
        </span>
      </div>

      {/* CE QUE LE TOTAL NE DIT PAS, repris tel qu'il etait affiche avant
          l'envoi : le recu ne doit pas dire autre chose que le ticket. Et les
          moyens de paiement, que le client ne voyait qu'en haut de page — au
          moment ou il se demande comment il va regler. On les NOMME, sans
          rien promettre sur le moment du reglement : la page ne le sait pas. */}
      {recu.frais && <p className="mt-2 text-xs leading-relaxed text-chaux-600">{recu.frais}</p>}
      {recu.paiements.length > 0 && (
        <p className="mt-1 text-xs leading-relaxed text-chaux-600">
          Paiement accepté&nbsp;: {recu.paiements.join(', ')}.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href={suivi} className={classesBouton('calme', 'md', 'carree')}>
          Suivre ma commande
        </Link>
        {/* Une sortie, parce qu'un recu qu'on ne peut pas ranger encombre la
            commande suivante. Discrete : ce n'est pas le geste attendu. */}
        <button
          type="button"
          onClick={onMasquer}
          className="inline-flex min-h-11 items-center text-sm text-chaux-600 underline decoration-chaux-300 underline-offset-4 transition hover:text-nuit-800"
        >
          Masquer ce reçu
        </button>
      </div>
    </section>
  );
}
