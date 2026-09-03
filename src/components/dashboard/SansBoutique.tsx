'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Store } from 'lucide-react';
import { useBoutique } from '@/lib/boutique';
import { supabase, utilisateurCourant } from '@/lib/supabase';
import { classesBouton } from '@/components/ui/Bouton';
import PorteContact from '@/components/dashboard/PorteContact';
import {
  demandeExploitable,
  lireDemande,
  normaliserDemande,
  type DemandeBoutique,
} from '@/lib/demandeBoutique';
import { normaliserTelephone } from '@/lib/telephone';

/**
 * La decision, sortie du JSX pour pouvoir etre eprouvee.
 *
 * Les deux erreurs possibles n'ont pas le meme prix. Montrer l'ecran a tort le
 * montre a un marchand QUI A une boutique — il croit l'avoir perdue. Ne pas le
 * montrer laisse le nouveau devant un tableau de bord vide. On tranche donc sur
 * `pret` : tant que le registre n'a pas repondu, une liste vide ne veut rien
 * dire.
 */
export function afficherEcranSansBoutique(pret: boolean, nombreDeBoutiques: number): boolean {
  return pret && nombreDeBoutiques === 0;
}

/**
 * Ce que voit un marchand qui vient de creer son compte.
 *
 * LE TROU QU'IL COMBLE. `/register` ne cree qu'un COMPTE : la boutique est
 * provisionnee par la plateforme. Entre les deux, le marchand se connecte et
 * `mes-boutiques` lui rend `{"marchands":[]}` — chaque ecran appelle donc son
 * API sans boutique, et l'API repond « Marchand introuvable ». Avant le 22 aout
 * 2026, il n'en voyait RIEN : l'erreur partait dans la console, et il se
 * trouvait accueilli par « Bonjour, DjiguiFlow » au-dessus d'un ecran vide.
 *
 * ── POURQUOI IL DEMANDE TROIS CHOSES, DEPUIS LE 3 SEPTEMBRE 2026 ───────────
 *
 * Cet ecran disait « Ecrivez-nous le nom de votre commerce et la zone que vous
 * livrez ». Deux renseignements, reclames par MESSAGE, alors que ce sont deux
 * champs. Et il n'en demandait pas un troisieme dont tout depend : le NUMERO.
 *
 * `/register` collecte nom, type et telephone — quand on s'inscrit par e-mail.
 * Le bouton Google ne demande rien. Les deux personnes perdues les 24 et
 * 25 aout sont passees par Google : meme si elles avaient ecrit, on n'avait
 * aucun numero pour les rappeler.
 *
 * ── CE QUI LES LIT ─────────────────────────────────────────────────────────
 *
 * L'alerte `compte-sans-boutique` de la veille des chaines les porte. Sans ce
 * lecteur, ces trois champs seraient des reglages morts de plus — le defaut que
 * les PR #151 et #154 ont retire ailleurs.
 *
 * ── ET LA PORTE RESTE ──────────────────────────────────────────────────────
 *
 * `PorteContact` est rendue SANS CONDITION, sous le formulaire. Un marchand qui
 * ne veut pas remplir trois champs doit toujours pouvoir nous joindre : c'est
 * exactement ce qui manquait aux deux qu'on a perdus.
 */
export default function SansBoutique({ children }: { children: ReactNode }) {
  const { boutiques, pret } = useBoutique();

  const [demande, setDemande] = useState<DemandeBoutique>({ nom: '', telephone: '', zone: '' });
  const [envoi, setEnvoi] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  /**
   * ON PREREMPLIT AVEC CE QUE LE COMPTE PORTE DEJA.
   *
   * Un marchand inscrit par e-mail a deja donne son nom de commerce et son
   * numero : les lui redemander donnerait l'impression qu'on ne l'a pas ecoute.
   */
  useEffect(() => {
    let vivant = true;
    utilisateurCourant().then((user) => {
      if (!vivant || !user) return;
      const deja = lireDemande(user.user_metadata);
      setDemande(deja);
      setEnregistre(demandeExploitable(deja));
    });
    return () => { vivant = false; };
  }, []);

  if (!afficherEcranSansBoutique(pret, boutiques.length)) return <>{children}</>;

  const normalisee = normaliserDemande(demande);
  const complet = demandeExploitable(normalisee);
  const telLisible = normaliserTelephone(demande.telephone).ok;

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);

    /**
     * LES DONNEES VONT DANS LE COMPTE, comme a l'inscription par e-mail.
     *
     * Elles sont ecrites par le client, par construction — et c'est sans
     * danger parce que RIEN, cote serveur, ne s'en sert pour decider quoi que
     * ce soit : `estAdmin` passe par `ADMIN_USER_IDS`, et la route de
     * provisioning prend son nom et son slug dans son corps de requete.
     */
    const { error } = await supabase.auth.updateUser({
      data: {
        business_name: normalisee.nom,
        phone: normalisee.telephone,
        zone_livree: normalisee.zone,
      },
    });

    if (error) {
      // On ne dit jamais « c'est enregistre » sans l'avoir ete : le marchand
      // fermerait la page en croyant nous avoir joints.
      setErreur(`Ça n’a pas été enregistré — ${error.message}`);
      setEnvoi(false);
      return;
    }

    setDemande(normalisee);
    setEnregistre(true);
    setEnvoi(false);
  };

  const CHAMP =
    'w-full border border-[var(--hairline)] bg-white px-3 py-3 text-sm ' +
    'placeholder:text-chaux-600 transition focus:border-nuit-400';

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <section className="border border-[var(--hairline)] bg-white p-8 soft-shadow">
        <div className="flex h-12 w-12 items-center justify-center bg-chaux-100 text-nuit-700">
          <Store aria-hidden className="h-6 w-6" />
        </div>

        <h1 className="mt-5 font-display text-2xl font-black text-nuit-900">
          Votre compte est créé. Votre boutique, pas encore.
        </h1>

        {/* On dit ce qui manque ET qui doit agir. « Une erreur est survenue »
            laisse le marchand essayer de recharger la page pendant dix
            minutes ; ici il sait que la balle n'est pas dans son camp. */}
        <p className="mt-3 text-sm leading-relaxed text-chaux-600">
          Il n’y a rien à réparer de votre côté : c’est nous qui ouvrons votre
          boutique, avec vous. Une fois qu’elle existe, ce tableau de bord se
          remplit tout seul — commandes, articles, livreurs.
        </p>

        <p className="mt-3 text-sm leading-relaxed text-chaux-600">
          Dites-nous l’essentiel et nous vous rappelons.
        </p>

        <form onSubmit={envoyer} className="mt-6 space-y-4">
          <div>
            <label htmlFor="nom-commerce" className="mb-1 block text-sm font-medium text-nuit-800">
              Nom de votre commerce
            </label>
            <input
              id="nom-commerce"
              value={demande.nom}
              onChange={(e) => setDemande({ ...demande, nom: e.target.value })}
              className={CHAMP}
              placeholder="Chez Fatou"
              autoComplete="organization"
            />
          </div>

          <div>
            <label htmlFor="tel-rappel" className="mb-1 block text-sm font-medium text-nuit-800">
              Votre numéro, celui qu’on appelle
            </label>
            <input
              id="tel-rappel"
              type="tel"
              inputMode="tel"
              value={demande.telephone}
              onChange={(e) => setDemande({ ...demande, telephone: e.target.value })}
              className={CHAMP}
              placeholder="07 07 00 00 42"
              autoComplete="tel"
            />
            {/* ON SIGNALE SANS BLOQUER. Un numero mal forme reste plus utile
                qu'un vide : il permet encore de rappeler quelqu'un qui a fait
                une faute de frappe. */}
            {demande.telephone.trim() !== '' && !telLisible && (
              <p className="mt-1 text-xs text-chaux-600">
                Ce numéro ne ressemble pas à un numéro ivoirien — on le garde
                quand même, vérifiez-le simplement.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="zone-livree" className="mb-1 block text-sm font-medium text-nuit-800">
              Où livrez-vous ? <span className="text-chaux-600">(facultatif)</span>
            </label>
            <input
              id="zone-livree"
              value={demande.zone}
              onChange={(e) => setDemande({ ...demande, zone: e.target.value })}
              className={CHAMP}
              placeholder="Cocody, Riviera"
            />
          </div>

          {erreur && (
            <p className="border-l-2 border-bissap-500 bg-white px-3 py-2 text-sm text-nuit-800">
              {erreur}
            </p>
          )}

          <button
            type="submit"
            disabled={!complet || envoi}
            className={`${classesBouton('action', 'md', 'carree')} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {envoi ? 'Envoi…' : enregistre ? 'Mettre à jour' : 'Envoyer'}
          </button>

          {/* LE BOUTON DIT POURQUOI IL DORT. Un bouton grise sans explication
              laisse chercher : le 2 septembre, un abonnement etait injoignable
              pour cette exacte raison. */}
          {!complet && (
            <p className="text-xs text-chaux-600">
              Il nous faut au moins le nom de votre commerce et un numéro pour
              vous rappeler.
            </p>
          )}

          {enregistre && !envoi && (
            <p className="border-l-2 border-nuit-900 bg-white px-3 py-2 text-sm text-nuit-800">
              C’est noté : {normalisee.nom || 'votre commerce'}
              {normalisee.telephone ? `, ${normalisee.telephone}` : ''}. Nous vous
              rappelons pour ouvrir votre boutique.
            </p>
          )}
        </form>

        {/* LA PORTE NE DEPEND DE RIEN, ET SURTOUT PAS DU FORMULAIRE. Un
            marchand qui ne veut pas remplir ces champs — ou qui n'y arrive
            pas — doit toujours pouvoir nous joindre. C'est exactement ce qui
            manquait aux deux personnes perdues les 24 et 25 aout 2026. */}
        <div className="mt-6 border-t border-[var(--hairline)] pt-5">
          <p className="mb-3 text-sm text-chaux-600">Ou joignez-nous directement :</p>
          <PorteContact
            message="Bonjour, je viens de créer mon compte DjiguiFlow et je souhaite ouvrir ma boutique."
            objet="Ouvrir ma boutique DjiguiFlow"
          />
        </div>
      </section>
    </div>
  );
}
