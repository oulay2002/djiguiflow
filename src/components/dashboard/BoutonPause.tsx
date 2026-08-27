'use client';

/**
 * « Je ferme un moment » — la fermeture d'urgence, en un geste.
 *
 * POURQUOI CE BOUTON. Les horaires disent la semaine ordinaire. Ils ne disent
 * rien du jour ou le four lache, ou la commande de riz n'arrive pas, ou la
 * cuisine est simplement debordee. Jusqu'ici le marchand n'avait qu'un choix :
 * encaisser des commandes qu'il ne pouvait pas honorer, ou effacer ses horaires
 * a la main dans un formulaire, pour les ressaisir apres.
 *
 * POURQUOI UNE DUREE, ET JAMAIS UN SIMPLE OUI/NON. Un interrupteur reste leve.
 * Le marchand ferme un mardi soir, oublie, et decouvre le vendredi qu'il n'a
 * rien vendu de la semaine — la panne serait alors CAUSEE par le remede. Une
 * pause qui expire d'elle-meme se trompe dans l'autre sens : au pire la
 * boutique rouvre trop tot, ce qui se corrige d'un clic et ne coute rien.
 *
 * La pause coupe tout d'un coup : la vitrine, la prise de commande cote serveur
 * et l'assistante WhatsApp, parce que les trois lisent la meme fonction
 * `etatBoutique`.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { PauseCircle, PlayCircle } from 'lucide-react';
import { classesBouton } from '@/components/ui/Bouton';
import { supabase } from '@/lib/supabase';
import { useBoutique, uuidBoutiqueCourante } from '@/lib/boutique';

/** Ce qu'on propose. Au-dela d'une journee, ce sont les horaires qu'il faut changer. */
const DUREES: { libelle: string; minutes: number }[] = [
  { libelle: '30 min', minutes: 30 },
  { libelle: '1 heure', minutes: 60 },
  { libelle: '2 heures', minutes: 120 },
  { libelle: 'Le reste de la journée', minutes: 0 }, // calcule plus bas
];

/** Abidjan vit a UTC+0 : l'heure UTC EST l'heure locale, sans conversion. */
function heureLisible(iso: string): string {
  const d = new Date(iso);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

export default function BoutonPause() {
  const { boutiqueId, pret } = useBoutique();
  const [uuid, setUuid] = useState<string | null>(null);
  const [pauseJusqua, setPauseJusqua] = useState<string | null>(null);
  const [ouvertChoix, setOuvertChoix] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!pret) return;
    let annule = false;

    (async () => {
      const id = await uuidBoutiqueCourante(boutiqueId);
      if (annule || !id) return;
      setUuid(id);

      const { data } = await supabase
        .from('boutiques')
        .select('pause_jusqua')
        .eq('id', id)
        .maybeSingle();

      if (!annule) setPauseJusqua(data?.pause_jusqua ?? null);
    })();

    return () => { annule = true; };
  }, [pret, boutiqueId]);

  const ecrire = useCallback(async (valeur: string | null) => {
    if (!uuid) return;
    setEnCours(true);
    setErreur(null);

    const { error } = await supabase
      .from('boutiques')
      .update({ pause_jusqua: valeur })
      .eq('id', uuid);

    // On ne modifie l'affichage QUE si la base a accepte : afficher « en pause »
    // sur une ecriture ratee ferait croire au marchand qu'il est protege alors
    // que les commandes continuent d'arriver.
    if (error) {
      console.error('Pause de la boutique :', error);
      setErreur("La pause n’a pas pu être enregistrée. Réessayez.");
    } else {
      setPauseJusqua(valeur);
      setOuvertChoix(false);
    }
    setEnCours(false);
  }, [uuid]);

  const mettreEnPause = (minutes: number) => {
    const fin = new Date();
    if (minutes > 0) {
      fin.setUTCMinutes(fin.getUTCMinutes() + minutes);
    } else {
      // « Le reste de la journee » s'arrete a minuit : au matin, les horaires
      // habituels reprennent la main d'eux-memes.
      fin.setUTCHours(23, 59, 0, 0);
    }
    void ecrire(fin.toISOString());
  };

  /**
   * Une pause deja expiree ne doit rien afficher : le serveur la considere
   * levee, l'ecran doit dire la meme chose.
   *
   * ELLE NE SE LEVAIT PAS TOUTE SEULE. La comparaison se faisait PENDANT LE
   * RENDU — `Date.parse(pauseJusqua) > Date.now()`. Le rendu devenait donc
   * dependant de l'heure qu'il est, ce que React ne sait pas suivre : le
   * bandeau « Boutique en pause » restait affiche apres l'expiration, jusqu'a
   * ce qu'autre chose provoque un nouveau rendu. Un marchand qui laisse son
   * tableau de bord ouvert voyait sa boutique fermee alors qu'elle vendait.
   *
   * L'heure d'expiration est CONNUE : on ne la sonde pas, on s'y rend. Un seul
   * minuteur, arme sur ce qui reste, et remplace des que la pause change.
   */
  /**
   * Une pause deja expiree ne doit rien afficher : le serveur la considere
   * levee, l'ecran doit dire la meme chose.
   *
   * ELLE NE SE LEVAIT PAS TOUTE SEULE. La comparaison se faisait PENDANT LE
   * RENDU. Le rendu devenait dependant de l'heure qu'il est, ce que React ne
   * sait pas suivre : le bandeau « Boutique en pause » restait affiche apres
   * l'expiration, jusqu'a ce qu'autre chose provoque un nouveau rendu. Un
   * marchand qui laisse son tableau de bord ouvert voyait sa boutique fermee
   * alors qu'elle vendait.
   */
  const finPause = pauseJusqua === null ? NaN : Date.parse(pauseJusqua);

  /**
   * ON S'ABONNE A L'HORLOGE, on ne la consulte pas pendant le rendu.
   *
   * `useSyncExternalStore` est fait pour cela : l'heure qu'il est est une
   * source EXTERIEURE a React, et l'instant d'expiration est connu d'avance —
   * on ne sonde donc rien, on pose un minuteur qui se declenche pile a ce
   * moment-la, et React redessine.
   *
   * Le premier argument s'abonne, le deuxieme lit l'etat courant, le troisieme
   * repond pour le rendu serveur : `false`, parce qu'un bandeau de pause n'a
   * aucun sens dans un HTML fige — il vaut mieux ne rien afficher que d'afficher
   * quelque chose que le navigateur devra effacer.
   */
  const enPause = useSyncExternalStore(
    useCallback(
      (redessiner: () => void) => {
        if (!Number.isFinite(finPause)) return () => {};
        const reste = finPause - Date.now();
        if (reste <= 0) return () => {};

        // Une seconde de marge : se reveiller pile a la milliseconde laisserait
        // la comparaison retomber du mauvais cote une fois sur deux.
        const minuteur = setTimeout(redessiner, reste + 1000);
        return () => clearTimeout(minuteur);
      },
      [finPause],
    ),
    () => Number.isFinite(finPause) && finPause > Date.now(),
    () => false,
  );

  if (!uuid) return null;

  if (enPause) {
    return (
      <div className="mb-6 border border-mangue-200 bg-mangue-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <PauseCircle className="h-6 w-6 shrink-0 text-mangue-600" />
            <div>
              <p className="font-semibold text-mangue-700">
                Boutique en pause jusqu’à {heureLisible(pauseJusqua!)}
              </p>
              <p className="text-sm text-mangue-600">
                Vos clients voient « fermé » et aucune commande ne peut arriver.
              </p>
            </div>
          </div>
          <button
            onClick={() => void ecrire(null)}
            disabled={enCours}
            className={classesBouton('action')}
          >
            <PlayCircle className="h-5 w-5" />
            Reprendre maintenant
          </button>
        </div>
        {erreur && <p className="mt-2 text-sm text-bissap-700">{erreur}</p>}
      </div>
    );
  }

  return (
    <div className="mb-6">
      {!ouvertChoix ? (
        <button
          onClick={() => setOuvertChoix(true)}
          className={classesBouton('calme', 'sm')}
        >
          <PauseCircle className="h-4 w-4" />
          Je ferme un moment
        </button>
      ) : (
        <div className=" border border-[var(--hairline)] bg-white p-4">
          <p className="mb-1 font-semibold text-nuit-900">Fermer les commandes pendant…</p>
          <p className="mb-3 text-sm text-chaux-600">
            La boutique rouvrira toute seule. Vous pourrez reprendre avant, à tout moment.
          </p>
          <div className="flex flex-wrap gap-2">
            {DUREES.map(d => (
              <button
                key={d.libelle}
                onClick={() => mettreEnPause(d.minutes)}
                disabled={enCours}
                className={classesBouton('calme', 'sm')}
              >
                {d.libelle}
              </button>
            ))}
            <button
              onClick={() => setOuvertChoix(false)}
              disabled={enCours}
              className={classesBouton('fantome', 'sm')}
            >
              Annuler
            </button>
          </div>
          {erreur && <p className="mt-2 text-sm text-bissap-700">{erreur}</p>}
        </div>
      )}
    </div>
  );
}
