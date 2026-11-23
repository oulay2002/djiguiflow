'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MapPin, Minus, Plus, ShoppingBag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { normaliserTelephone, formaterTelephone } from '@/lib/telephone';
import {
  mentionFrais,
  modesProposes,
  modeParDefaut,
  type ModeCommande,
} from '@/lib/retrait';
import { objectifPanier, phraseObjectif } from '@/lib/objectifsPanier';
import { suggestionsPanier } from '@/lib/suggestionsPanier';
import { LienRetour, classesBouton } from '@/components/ui/Bouton';
import { EMOJI_DEFAUT, Enseigne, initiale } from '@/components/ui/Enseigne';
import type { FicheVitrine, ProduitVitrine } from '@/lib/vitrine/donnees';
import { etatInitial } from '@/lib/vitrine/etatInitial';
import { clefBrouillon, ecrireBrouillon, lireBrouillon, type Brouillon } from '@/lib/vitrine/brouillon';
import { clefRecu, ecrireRecu, lireRecu, type Recu as DonneesRecu } from '@/lib/vitrine/recu';
import { Recu } from './Recu';
import { JOURS_PANIER_ABANDONNE } from '@/lib/conservation';
import { clePourEnvoi, clefDeLaCle, empreinteEnvoi, oublierCle, type StockageCle } from '@/lib/cleEnvoi';

type Produit = {
  id: string;
  nom: string;
  categorie: string;
  prix: number;
  description: string;
  image?: string;
  duJour?: boolean;
  /** `null` = le marchand ne compte pas ce produit. Jamais confondu avec zero. */
  stock?: number | null;
  /** Articles de meme `groupe` = un seul article en plusieurs coloris. */
  groupe?: string;
  couleur?: string;
  /**
   * La caracteristique, nommee par le marchand : Pointure, Taille, Contenance.
   * Vide quand l'article n'en a pas — un plat n'a pas de pointure.
   */
  attributNom?: string;
  attributValeurs?: string[];
  /** La marque, telle que le client la cherche. Vide = non renseignee. */
  marque?: string;
  /** Pour qui : Bebe, Enfant, Femme, Homme, Mixte. Vide = non renseigne. */
  publicVise?: string;
};

/**
 * Un article et ses coloris.
 *
 * LE PROBLEME QU'ON RESOUD. Un vendeur de vetements saisit le meme ensemble en
 * blanc, en noir et en rouge. La vitrine en faisait TROIS cartes identiques :
 * le client croyait voir trois articles, et le catalogue paraissait plus riche
 * qu'il n'est — jusqu'a ce qu'il regarde les photos.
 *
 * Chaque coloris reste un produit a part entiere : son stock, sa photo, son
 * prix, et c'est LUI qui entre au panier. Seul l'affichage regroupe.
 */
type Article = {
  cle: string;
  /** Le nom sans le coloris : « Ensemble enfant », pas « Ensemble enfant blanc ». */
  titre: string;
  variantes: Produit[];
};

/**
 * Regroupe les produits en articles.
 *
 * L'ORDRE DU CATALOGUE EST CONSERVE : un article prend la place de sa premiere
 * declinaison. Trier par groupe remonterait les articles a coloris en tete de
 * page sans que le marchand l'ait demande.
 */
function grouperEnArticles(produits: Produit[]): Article[] {
  const articles: Article[] = [];
  const parGroupe = new Map<string, Article>();

  for (const p of produits) {
    const groupe = String(p.groupe ?? '').trim();

    // Sans groupe, l'article est seul — comportement d'avant, a l'identique.
    if (!groupe) {
      articles.push({ cle: p.id, titre: p.nom, variantes: [p] });
      continue;
    }

    const existant = parGroupe.get(groupe);
    if (existant) {
      existant.variantes.push(p);
      continue;
    }

    const article: Article = { cle: `groupe:${groupe}`, titre: groupe, variantes: [p] };
    parGroupe.set(groupe, article);
    articles.push(article);
  }

  return articles;
}

const fcfa = (n: number) => n.toLocaleString('fr-FR');

/** Fond de la page : sert aux encoches du ticket, qui doivent être des trous. */
const FOND_PAGE = '#eeece5';

type FicheRow = {
  id: string;
  nom: string | null;
  categorie: string | null;
  telephone: string | null;
  zone: string | null;
  emoji: string | null;
  logo_url: string | null;
  delai_livraison: string | null;
  zones_livrees: string | null;
  paiements_acceptes: string[] | null;
  commande_minimum: number | null;
  mode_recuperation: string | null;
  delai_preparation_min: number | null;
  livraison_offerte_des: number | null;
  /** Absente d'une page gardee en cache avant la migration : d'ou le `?`. */
  adresse_retrait?: string | null;
};

type ProduitRow = {
  id: string;
  nom: string | null;
  categorie: string | null;
  prix: number | null;
  description: string | null;
  photo_url: string | null;
  menu_du_jour: boolean | null;
  attribut_nom: string | null;
  attribut_valeurs: string[] | null;
  groupe: string | null;
  couleur: string | null;
  marque: string | null;
  public_vise: string | null;
};

/**
 * Les fonctions `vitrine_*` viennent d'etre ajoutees en base et n'existent pas
 * encore dans les types generes. On les appelle a travers ce passe-plat plutot
 * que de regenerer tout le schema.
 *
 * `rpc()` rend un PostgrestBuilder, qui n'implemente que `then` : lui enchainer
 * un `.catch` leve un TypeError avant meme la requete. D'ou le `try`, qui
 * couvre aussi la coupure reseau.
 */
async function appelerVitrine<T>(nom: string, ref: string): Promise<T[]> {
  try {
    const { data, error } = await (supabase.rpc as unknown as (
      n: string,
      args: Record<string, string>,
    ) => PromiseLike<{ data: T[] | null; error: unknown }>)(nom, { p_ref: ref });
    if (error) throw error;
    return data ?? [];
  } catch (e) {
    console.error(`Vitrine — ${nom}(${ref})`, e);
    return [];
  }
}

/**
 * Le vocabulaire de la page suit le commerce.
 *
 * « Tout le menu », « A la carte » viennent du premier marchand, un
 * restaurant. Sur une boutique de vetements ils designent un rayon qui
 * n'existe pas, et le client comprend que la page a ete ecrite pour un autre.
 * Les mots neutres valent partout ; ceux de la table ne s'emploient que si la
 * categorie du marchand les reclame.
 */
const CATEGORIES_TABLE = /restaurant|maquis|fast|food|traiteur|p[âa]tisserie|boulangerie|caf[ée]|glace|cuisine|pizz|grill/i;

function lexique(secteur: string) {
  return CATEGORIES_TABLE.test(secteur)
    ? {
        tout: 'Tout le menu',
        chargement: 'Chargement du menu…',
        vide: 'Le menu arrive',
        duJour: 'Menu du jour',
        reste: 'À la carte',
      }
    : {
        tout: 'Tout',
        chargement: 'Chargement du catalogue…',
        vide: 'Les articles arrivent',
        duJour: 'En vedette',
        reste: 'Le reste de la boutique',
      };
}

/**
 * Visuel d'un plat.
 *
 * La plupart des plats n'ont pas de photo — c'est le cas majoritaire, pas
 * l'exception. Plutôt qu'un cadre vide, on compose une plaque typographique :
 * l'initiale du plat en très grand, très basse intensité, sur un lavis chaux
 * vers mangue. Une absence assumée vaut mieux qu'un trou.
 */
/**
 * Combien de photos partent AVANT que le client ait fait defiler.
 *
 * A 390 px, la carte fait un peu plus d'un demi-ecran : deux tiennent dans la
 * fenetre, la troisieme est deja dessous. On les charge donc immediatement, et
 * seulement celles-la — une image differee que le client regarde arrive en
 * retard, ce qui est pire que de l'avoir chargee pour rien.
 */
const PHOTOS_IMMEDIATES = 2;

function Visuel({ p, rang }: { p: Produit; rang: number }) {
  if (p.image) {
    const immediate = rang < PHOTOS_IMMEDIATES;
    return (
      <div className="relative aspect-[4/3] overflow-hidden bg-chaux-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.image}
          alt={p.nom}
          /**
           * LE CATALOGUE ENTIER PARTAIT D'UN COUP.
           *
           * Mesure le 4 septembre 2026 : 475 ko de photos pour les CINQ
           * articles de Chez Zahara. Un marchand a trente articles en enverrait
           * deux a trois megaoctets a l'ouverture, dont vingt-huit sous la
           * ligne de flottaison — sur un forfait ou chaque megaoctet se paie.
           *
           * Le rendu serveur a rendu ce point plus urgent, pas moins : le
           * navigateur voit desormais toutes les balises des le HTML et lance
           * tous les telechargements a la fois, en concurrence avec le
           * JavaScript sur le meme tuyau.
           */
          loading={immediate ? 'eager' : 'lazy'}
          // Le decodage sort du fil principal : sur un processeur d'entree de
          // gamme, decoder six photos bloquait le defilement.
          decoding="async"
          // Ce qui est visible passe devant le reste ; ce qui ne l'est pas
          // cede le tuyau au JavaScript dont la page a besoin pour repondre.
          fetchPriority={immediate ? 'high' : 'low'}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        />
      </div>
    );
  }

  // Bande courte, et non un bloc au format photo : sans image, un grand
  // cadre vide ne fait que reduire le nombre de plats visibles a l'ecran —
  // sur telephone, il n'en laissait plus qu'un seul.
  return (
    <div className="relative flex h-24 items-end overflow-hidden bg-chaux-100 px-4 pb-2.5">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-4 left-2 select-none font-display text-[5.5rem] font-black leading-none text-nuit-900/[0.07]"
      >
        {initiale(p.nom)}
      </span>
      {p.categorie && (
        <span className="relative font-mono text-xs uppercase tracking-[0.2em] text-nuit-900/45">
          {p.categorie}
        </span>
      )}
    </div>
  );
}

type Props = {
  /** Le slug ou l'uuid tel qu'il est dans l'adresse. */
  slug: string;
  /**
   * La fiche, deja chargee par le serveur. `null` = la boutique n'est pas au
   * registre : l'effet ci-dessous prend alors le relais par `vitrine_boutique`.
   */
  fiche: FicheVitrine | null;
  /**
   * Le catalogue, deja charge par le serveur. `null` = la base n'a pas
   * repondu, ce qui n'est PAS un catalogue vide.
   */
  menu: ProduitVitrine[] | null;
};

export default function Vitrine({ slug, fiche: ficheServeur, menu: menuServeur }: Props) {
  const depart = useMemo(
    () => etatInitial(ficheServeur, menuServeur),
    [ficheServeur, menuServeur],
  );
  const commandeRef = useRef<HTMLDivElement>(null);
  // Le bloc « ce qu'il faut savoir » est replie sur telephone : voir plus bas.
  const [infosOuvertes, setInfosOuvertes] = useState(false);
  // Le ticket est-il a l'ecran ? La barre du bas s'efface alors : voir plus bas.
  const [ticketVisible, setTicketVisible] = useState(false);

  useEffect(() => {
    const ticket = commandeRef.current;
    if (!ticket || typeof IntersectionObserver === 'undefined') return;
    // La marge du bas vaut la hauteur de la barre : le ticket ne compte comme
    // visible qu'une fois sorti de dessous elle, sinon elle disparaitrait
    // pour ne rien decouvrir.
    const veille = new IntersectionObserver(
      ([entree]) => setTicketVisible(entree.isIntersecting),
      { rootMargin: '0px 0px -96px 0px' },
    );
    veille.observe(ticket);
    return () => veille.disconnect();
  }, []);
  /** Le haut de la page, ou s affichent « REÇUE » et « REFUSÉE ». */
  const verdictRef = useRef<HTMLDivElement>(null);

  /*
    CES TROIS VALEURS NE SONT PLUS DES ETATS, ET C'EST LE SIGNE QUE LE
    CHARGEMENT A BIEN CHANGE DE COTE.

    Elles ne bougeaient que par la voie du registre, qui vit maintenant sur le
    serveur : plus rien ne peut les modifier apres le premier rendu. Le repli
    par `vitrine_boutique` ne les posait deja pas — une boutique hors registre
    reste donc « ouverte » et hors registre, exactement comme avant.

    `ouvert` est decide par le SERVEUR avec la meme fonction que celle qui
    refuse la commande. La vitrine ne recalcule rien : deux calculs finiraient
    par diverger, et le client verrait « ouvert » sur un commerce qui refuse.
  */
  const estMarchandSheets = depart.estMarchandSheets;
  const ouvert = depart.ouvert;
  const messageHoraire = depart.messageHoraire;

  // `logo` vide veut dire « le marchand n'en a pas depose », jamais « on n'a
  // pas su le lire » : les deux sources le rendent desormais explicitement.
  const [header, setHeader] = useState(depart.header);
  const [zone, setZone] = useState(depart.zone);
  const [produits, setProduits] = useState<Produit[]>(depart.produits);
  const [chargement, setChargement] = useState(depart.chargement);
  const [panier, setPanier] = useState<Record<string, number>>({});
  /**
   * Le coloris regarde, par article. Clef = l'article, valeur = le produit.
   *
   * Il n'est PAS pose au chargement : sans choix explicite, la carte ouvre sur
   * la premiere declinaison encore en stock. Figer un defaut au chargement
   * afficherait « epuise » sur un article dont trois coloris sur quatre sont
   * disponibles.
   */
  const [coloris, setColoris] = useState<Record<string, string>>({});

  /**
   * La taille — ou la pointure, ou la contenance — retenue par article.
   *
   * VIDE TANT QUE LE CLIENT N'A PAS CHOISI, et c'est voulu. Preselectionner la
   * premiere valeur ferait partir des commandes en 38 parce que 38 vient avant
   * 39 dans la liste du marchand. Le client ne verrait rien : la carte
   * afficherait un choix qu'il n'a pas fait.
   */
  const [choixTaille, setChoixTaille] = useState<Record<string, string>>({});

  /** Filtres de mode. « toutes » / « tous » = aucun filtre, comme « tout ». */
  const [marqueFiltre, setMarqueFiltre] = useState('toutes');
  const [publicFiltre, setPublicFiltre] = useState('tous');
  const [categorie, setCategorie] = useState('tout');
  const [nom, setNom] = useState('');
  const [tel, setTel] = useState('');
  const [adresse, setAdresse] = useState('');
  const [instructions, setInstructions] = useState('');
  const [envoi, setEnvoi] = useState(false);
  /**
   * LE RECU DE LA COMMANDE PARTIE, ou `null`.
   *
   * Il porte tout ce que l'ecran de fin affiche — reference, jeton du lien de
   * suivi, lignes, total, mode — FIGE au moment de l'envoi : le panier se vide
   * et le selecteur redevient modifiable, et un recu qui les relirait en
   * direct changerait apres coup. Trois etats separes le portaient
   * (`confirmation`, `jetonSuivi`, `recupConfirmee`) ; un seul objet ne peut
   * pas se retrouver a moitie rempli.
   *
   * Le jeton vient de la reponse de la route et n'est jamais fabrique ici : la
   * reference seule ne suffit plus a ouvrir un suivi, parce qu'elle se devine.
   */
  const [recu, setRecu] = useState<DonneesRecu | null>(null);
  const [echec, setEchec] = useState('');
  /**
   * L'ECHEC EST-IL UN REFUS, OU UNE ABSENCE DE REPONSE ?
   *
   * Les deux portaient le tampon « REFUSÉE ». Or quand la connexion tombe, on
   * ne sait PAS si la commande est arrivee : la demande a pu partir et sa
   * reponse se perdre. Dire « refusee » invitait a recommencer aussitot — au
   * risque d'une commande en double, et de livreurs alertes deux fois.
   * Un indetermine n'est pas un refus : il a son tampon et sa consigne.
   */
  const [sansReponse, setSansReponse] = useState(false);
  /**
   * La voie WhatsApp a-t-elle ete empruntee ?
   *
   * Elle n ouvre qu un onglet : aucune commande n est enregistree chez nous, il
   * n y a donc ni reference ni suivi a montrer. Mais ne RIEN afficher laissait
   * le client revenir sur la page et se demander si son message etait parti.
   */
  const [envoiWhatsapp, setEnvoiWhatsapp] = useState(false);
  /**
   * Pourquoi la page est vide, quand elle l est.
   *
   * TROIS SITUATIONS SE RESSEMBLAIENT A L ECRAN. Un lien WhatsApp perime, une
   * panne reseau et un catalogue reellement vide donnaient tous « Les articles
   * arrivent — ce commercant n a pas encore publie d article ». Le client
   * repartait en pensant que le commercant est mauvais.
   */
  const [pannePage, setPannePage] = useState<'' | 'introuvable' | 'reseau'>(depart.pannePage);
  const [telBoutique, setTelBoutique] = useState('');

  /**
   * CE QUE LE CLIENT DEVAIT DEMANDER AU MARCHAND.
   *
   * Quatre questions avant de commander : combien de temps, chez moi est-ce
   * livre, comment je paie, y a-t-il un minimum. Il fallait ecrire — et
   * beaucoup n'ecrivent pas, ils partent.
   *
   * TOUT EST FACULTATIF ET RIEN N'EST INVENTE. Un champ non renseigne ne
   * s'affiche pas : mieux vaut le silence qu'une promesse approximative, que
   * le marchand devra tenir a chaque livraison.
   */
  const [infos, setInfos] = useState<{
    delai: string;
    zones: string;
    paiements: string[];
    minimum: number | null;
  }>(depart.infos);

  /**
   * COMMENT LE CLIENT RECUPERE SA COMMANDE.
   *
   * `mode` est ce que la BOUTIQUE propose ; `modeChoisi` est ce que le CLIENT a
   * retenu. Les deux existent parce qu'ils repondent a deux questions
   * differentes : « les_deux » ne peut pas s'ecrire sur une commande, et une
   * commande ne peut pas decider a la place de la boutique.
   *
   * Les valeurs de depart sont celles de toutes les boutiques en service :
   * livraison, aucun temps de preparation, aucune gratuite. Une fiche illisible
   * laisse donc la page exactement comme elle etait avant ce travail.
   */
  const [recuperation, setRecuperation] = useState<{
    mode: string;
    /** Ou venir chercher sa commande. Vide = le marchand ne l'a pas dit. */
    adresse: string;
    preparationMin: number | null;
    offerteDes: number | null;
  }>(depart.recuperation);

  const [modeChoisi, setModeChoisi] = useState<ModeCommande>(depart.modeChoisi);

  /**
   * L'heure demandee, en « HH:MM », ou vide pour « des que pret ».
   *
   * ON N'ENVOIE QU'UN TEXTE, ET C'EST LE SERVEUR QUI DATE. Le navigateur d'un
   * client qui commande depuis Paris pour sa famille a Abidjan est a un autre
   * fuseau : le laisser fabriquer l'instant ferait arriver la commande deux
   * heures trop tot, sans que rien ne le signale.
   */
  const [heureRetrait, setHeureRetrait] = useState('');


  /**
   * LE BROUILLON : CE QUI A ETE COMPOSE SURVIT A UN RECHARGEMENT.
   *
   * Mesure en production le 23 novembre 2026 : deux plats, un nom, un numero
   * et une adresse, puis un rechargement — tout avait disparu. Sur le
   * telephone du client d'ici, passer sur WhatsApp retrouver une adresse
   * suffit a faire decharger l'onglet. La regle, ses raisons et ses bornes
   * vivent dans `@/lib/vitrine/brouillon`, avec leurs tests.
   *
   * DEUX TEMPS, ET L'ORDRE EST LE VERROU. On RELIT d'abord, une seule fois,
   * quand le catalogue est connu — c'est contre lui que le brouillon est
   * verifie. On n'ECRIT qu'ensuite : sans `brouillonRelu`, le tout premier
   * rendu, panier vide, ecraserait ce qu'on s'appretait a restaurer.
   *
   * Tout est dans un `try` : en navigation privee ou stockage plein, l'acces
   * leve. Ce n'est alors qu'un confort perdu, jamais une vitrine en panne.
   */
  const [brouillonRelu, setBrouillonRelu] = useState(false);

  useEffect(() => {
    if (brouillonRelu || chargement || produits.length === 0) return;
    (async () => {
      let b: Brouillon | null = null;
      try {
        // Le recu d'une commande deja partie revient avec le reste : c'est
        // lui qui porte la reference et le lien de suivi.
        const ancien = lireRecu(window.sessionStorage.getItem(clefRecu(slug)));
        if (ancien) setRecu((r) => r ?? ancien);
        b = lireBrouillon(
          window.sessionStorage.getItem(clefBrouillon(slug)),
          produits,
          modesProposes(recuperation.mode),
        );
      } catch {
        b = null;
      }
      if (b) {
        const relu = b;
        // Ce que le client a deja touche depuis l'arrivee prime sur le
        // brouillon : on ne lui reprend pas un article qu'il vient d'ajouter.
        setPanier((p) => (Object.keys(p).length > 0 ? p : relu.panier));
        if (relu.mode) setModeChoisi(relu.mode);
        setHeureRetrait((h) => h || relu.heureRetrait);
        setNom((v) => v || relu.nom);
        setTel((v) => v || relu.tel);
        setAdresse((v) => v || relu.adresse);
        setInstructions((v) => v || relu.instructions);
      }
      setBrouillonRelu(true);
    })();
  }, [brouillonRelu, chargement, produits, recuperation.mode, slug]);

  useEffect(() => {
    if (!brouillonRelu) return;
    try {
      const clef = clefBrouillon(slug);
      const texte = ecrireBrouillon({
        panier, mode: modeChoisi, heureRetrait, nom, tel, adresse, instructions,
      });
      // Une commande partie vide le panier et les champs : le brouillon
      // disparait donc de lui-meme, sans qu'il faille y penser a l'envoi.
      if (texte === null) window.sessionStorage.removeItem(clef);
      else window.sessionStorage.setItem(clef, texte);
    } catch {
      // Stockage indisponible : rien a faire, et surtout rien a afficher.
    }
  }, [brouillonRelu, slug, panier, modeChoisi, heureRetrait, nom, tel, adresse, instructions]);

  /**
   * LE REPLI, ET LUI SEUL.
   *
   * Le serveur a deja charge la fiche et le catalogue de toute boutique du
   * REGISTRE — c'est-a-dire de toutes celles en service. Cet effet ne sert
   * donc plus qu'aux boutiques qui n'y sont pas : celles qui prennent leurs
   * commandes par lien WhatsApp. Il ne s'execute pas autrement, et c'est ce
   * qui fait qu'un client sur une 3G voit le commerce sans attendre son
   * JavaScript.
   */
  useEffect(() => {
    if (!slug || ficheServeur) return;
    let annule = false;

    (async () => {
      try {
        // Boutique Supabase, absente du registre.
        //
        // On passe par `vitrine_boutique` et non par la table : la lecture
        // publique de `boutiques` n'est accordée qu'au rôle `anon`, et un
        // visiteur connecté ne voit alors que sa propre enseigne — la fiche
        // d'un autre commerçant restait vide sans rien dire. Ces fonctions
        // acceptent le slug comme l'uuid, et ne rendent que le public : ni
        // stock, ni seuil d'alerte, ni configuration interne.
        const [fiche, catalogue] = await Promise.all([
          appelerVitrine<FicheRow>('vitrine_boutique', slug),
          appelerVitrine<ProduitRow>('vitrine_produits', slug),
        ]);
        const b = fiche[0];
        if (annule) return;
        if (!b) {
          // `appelerVitrine` rend `[]` aussi bien pour « aucune ligne » que
          // pour une erreur qu il a journalisee. On ne peut donc pas trancher
          // ici entre les deux -- mais on peut au moins cesser de faire passer
          // les deux pour un catalogue vide.
          setPannePage('introuvable');
          return;
        }
        setPannePage('');

        setHeader({
          nom: b.nom ?? 'Boutique',
          secteur: b.categorie ?? 'Commerce',
          emoji: b.emoji || EMOJI_DEFAUT,
          // `vitrine_boutique` rendait deja cette colonne ; la fiche ne la
          // lisait pas. La marque etait donc perdue au dernier maillon.
          logo: String(b.logo_url ?? '').trim(),
        });
        setZone(String(b.zone ?? ''));
        setTelBoutique(String(b.telephone ?? ''));

        setInfos({
          delai: String(b.delai_livraison ?? '').trim(),
          zones: String(b.zones_livrees ?? '').trim(),
          paiements: Array.isArray(b.paiements_acceptes)
            ? b.paiements_acceptes.map(v => String(v ?? '').trim()).filter(Boolean)
            : [],
          // `null` reste `null` : un minimum a zero se lirait comme un vrai
          // minimum de zero franc, ce qui ne veut rien dire.
          minimum:
            typeof b.commande_minimum === 'number' && b.commande_minimum > 0
              ? b.commande_minimum
              : null,
        });

        // `livraison_offerte_des` GARDE SON ZERO. Un `|| null` l'aurait
        // transforme en « le livreur annonce ses frais » — l'exact contraire de
        // « toujours offerte », et le client aurait paye une course que le
        // marchand croyait offrir.
        setRecuperation({
          mode: String(b.mode_recuperation ?? 'livraison'),
          // Le repli la rend aussi, depuis la migration 20261123231000.
          adresse: String(b.adresse_retrait ?? '').trim(),
          preparationMin:
            typeof b.delai_preparation_min === 'number' ? b.delai_preparation_min : null,
          offerteDes:
            typeof b.livraison_offerte_des === 'number' ? b.livraison_offerte_des : null,
        });
        setModeChoisi(modeParDefaut(b.mode_recuperation));

        setProduits(catalogue.map((p) => ({
          id: String(p.id),
          nom: String(p.nom ?? 'Produit'),
          categorie: String(p.categorie ?? ''),
          prix: Number(p.prix ?? 0),
          // La RPC vitrine ne rend pas le stock : ces boutiques ne sont pas au
          // registre Marchands et commandent par message WhatsApp pre-rempli,
          // sans route serveur qui puisse refuser. Laisser `undefined` fait
          // simplement que « Épuisé » ne s'affiche pas — plutot que d'afficher
          // « Épuisé » a tort sur un catalogue dont on ignore le stock.
          description: String(p.description ?? ''),
          image: String(p.photo_url ?? ''),
          duJour: Boolean(p.menu_du_jour),
          // LES COLORIS ARRIVENT ENFIN PAR CE CHEMIN AUSSI. Sans eux, chaque
          // couleur formait une carte distincte et le client croyait voir
          // trois articles la ou il y en a un. Rien ne le montrait : les deux
          // boutiques d'aujourd'hui passent par le registre.
          groupe: String(p.groupe ?? '').trim(),
          couleur: String(p.couleur ?? '').trim(),
          marque: String(p.marque ?? '').trim(),
          publicVise: String(p.public_vise ?? '').trim(),
          attributNom: String(p.attribut_nom ?? '').trim(),
          attributValeurs: Array.isArray(p.attribut_valeurs)
            ? p.attribut_valeurs.map((v) => String(v ?? '').trim()).filter(Boolean)
            : [],
        })));
      } catch (e) {
        // Règle d'or : ne jamais casser l'écran client — mais ne plus se taire
        // non plus : un ecran vide sans explication se lit comme une boutique
        // qui ne vend rien.
        console.error('Chargement boutique', slug, e);
        if (!annule) setPannePage('reseau');
      } finally {
        if (!annule) setChargement(false);
      }
    })();

    return () => { annule = true; };
  }, [slug, ficheServeur]);

  // On ne laisse pas composer un panier que le serveur refusera. Il le refuse
  // deja, et avec le motif exact — mais l'apprendre apres avoir saisi son nom,
  // son telephone et son adresse est la pire facon de l'apprendre.
  //
  // `stock` absent ou `null` = le marchand ne compte pas ce produit : aucune
  // borne, comme avant.
  /**
   * UNE LIGNE DE PANIER, C'EST UN ARTICLE **ET** LE CHOIX DU CLIENT.
   *
   * Le panier etait indexe par le seul identifiant de produit. Deux pointures
   * du meme modele s'y seraient donc ECRASEES : le client demandait un 39 et
   * un 41, le panier en gardait deux d'une seule taille — sans rien dire, et
   * le marchand livrait deux fois la meme.
   *
   * `::` comme separateur : les identifiants sont des references « P1755… » ou
   * des uuid, et les valeurs des pointures ou des tailles. Aucun des deux ne
   * contient ce couple de caracteres.
   */
  const clefLigne = (pid: string, variante: string) =>
    variante ? `${pid}::${variante}` : pid;

  const litClef = (clef: string) => {
    const i = clef.indexOf('::');
    return i < 0
      ? { pid: clef, variante: '' }
      : { pid: clef.slice(0, i), variante: clef.slice(i + 2) };
  };

  // On ne laisse pas composer un panier que le serveur refusera. Il le refuse
  // deja, et avec le motif exact — mais l'apprendre apres avoir saisi son nom,
  // son telephone et son adresse est la pire facon de l'apprendre.
  //
  // `stock` absent ou `null` = le marchand ne compte pas ce produit : aucune
  // borne, comme avant.
  const ajouter = (pid: string, variante = '') => setPanier(p => {
    const prod = produits.find(x => x.id === pid);
    const restant = typeof prod?.stock === 'number' ? prod.stock : Infinity;

    // LE STOCK EST CELUI DE L'ARTICLE, PAS DE LA TAILLE. Rien en base ne tient
    // un inventaire par pointure : le plafond porte donc sur la SOMME des
    // tailles deja au panier. Sans cela, un client prenait trois fois le
    // dernier exemplaire en changeant de taille a chaque fois.
    const dejaPris = Object.entries(p)
      .filter(([clef]) => litClef(clef).pid === pid)
      .reduce((s, [, q]) => s + q, 0);

    if (dejaPris + 1 > restant) return p;

    const clef = clefLigne(pid, variante);
    return { ...p, [clef]: (p[clef] || 0) + 1 };
  });

  const retirer = (pid: string, variante = '') =>
    setPanier(p => {
      const clef = clefLigne(pid, variante);
      const q = (p[clef] || 0) - 1;
      const n = { ...p };
      if (q <= 0) delete n[clef]; else n[clef] = q;
      return n;
    });

  // Le contrôle du téléphone partage sa règle avec l'API : même module.
  const telNormalise = normaliserTelephone(tel);
  const telOk = telNormalise.ok;
  // On n'affiche l'erreur qu'une fois la saisie commencée, pour ne pas
  // accueillir le client avec un message rouge sur un champ vide.
  const erreurTel = tel.trim() && !telNormalise.ok ? telNormalise.erreur : '';

  const lignes = Object.entries(panier)
    .map(([clef, q]) => {
      const { pid, variante } = litClef(clef);
      const prod = produits.find(x => x.id === pid);
      return prod ? { prod, q, variante } : null;
    })
    .filter(Boolean) as { prod: Produit; q: number; variante: string }[];
  const total = lignes.reduce((s, l) => s + l.prod.prix * l.q, 0);
  const articles = lignes.reduce((s, l) => s + l.q, 0);

  /**
   * CE QU'IL MANQUE, DIT PENDANT QU'IL CHOISIT ENCORE.
   *
   * Le minimum de commande n'etait annonce QUE par le refus de la route, apres
   * que le client a saisi son nom, son telephone et son adresse. Il remplissait
   * tout pour lire « il vous manque 500 F ». La regle vit dans
   * `@/lib/objectifsPanier`, avec celle qu'applique le serveur.
   */
  const objectif = objectifPanier({
    mode: modeChoisi,
    total,
    minimum: infos.minimum,
    offerteDes: recuperation.offerteDes,
  });

  /**
   * CE QU'ON PROPOSE, ET OU.
   *
   * Deux places etaient perdues. Le bon de commande vide occupait une colonne
   * entiere pour dire « Ajoutez un article, il s'inscrit ici » ; et une fois le
   * premier article choisi, rien n'invitait jamais au second.
   *
   * DEUX quand le panier est vide — le ticket est etroit et la place compte ;
   * TROIS ensuite, sur toute la largeur sous la grille. La regle de choix vit
   * dans `@/lib/suggestionsPanier`, avec ses exclusions et ses tests.
   */
  // PAS DE `useMemo` ICI. `lignes` est reconstruit a chaque rendu : la
  // memoisation serait illusoire, et le compilateur React refuse d'ailleurs de
  // la preserver. Le calcul est un filtre et un tri sur le catalogue d'une
  // boutique — quelques dizaines d'articles au plus.
  const suggestions = suggestionsPanier({
    catalogue: produits,
    auPanier: lignes.map(l => l.prod.id),
    categoriesAuPanier: lignes.map(l => l.prod.categorie),
    combien: lignes.length === 0 ? 2 : 3,
  });

  const mots = useMemo(() => lexique(header.secteur), [header.secteur]);

  const categories = useMemo(
    () => Array.from(new Set(produits.map(p => p.categorie).filter(Boolean))),
    [produits],
  );

  /**
   * LES DEUX FILTRES D'UNE VITRINE DE MODE.
   *
   * Un client de vetements n'entre pas par la categorie du marchand — il entre
   * par UNE MARQUE ou par UN RAYON. « Montrez-moi le rayon enfant », « vous
   * avez du Nike ». La categorie repond a « ou est-ce range », question de
   * marchand ; ces deux-la repondent a « qu'est-ce que je cherche », question
   * de client.
   *
   * ILS NE PARAISSENT QUE S'ILS SERVENT. Un filtre qui n'offre qu'une seule
   * valeur ne filtre rien : il occupe l'ecran et donne l'illusion d'un choix.
   * Une boutique dont tous les articles sont de la meme marque n'affiche donc
   * pas de filtre de marque, et un restaurant n'en voit aucun des deux.
   */
  const marques = useMemo(
    () => Array.from(new Set(produits.map(p => (p.marque ?? '').trim()).filter(Boolean))).sort(),
    [produits],
  );

  const publics = useMemo(
    () => Array.from(new Set(produits.map(p => (p.publicVise ?? '').trim()).filter(Boolean))).sort(),
    [produits],
  );

  const visibles = produits.filter(p =>
    (categorie === 'tout' || p.categorie === categorie)
    && (marqueFiltre === 'toutes' || (p.marque ?? '').trim() === marqueFiltre)
    && (publicFiltre === 'tous' || (p.publicVise ?? '').trim() === publicFiltre),
  );
  const duJour = visibles.filter(p => p.duJour);
  const carte = visibles.filter(p => !p.duJour);
  // Deux sections n'ont de sens que si les deux existent : sinon le titre
  // « À la carte » chapeauterait la totalité du menu, ce qui n'apprend rien.
  const sectionne = duJour.length > 0 && carte.length > 0;

  /**
   * Les articles en vedette, groupes UNE FOIS.
   *
   * Ils l'etaient au fil du rendu, ce qui suffisait. On en a besoin ici parce
   * que la seconde section doit savoir COMBIEN de cartes la precedent : c'est
   * ce rang qui decide quelles photos se chargent tout de suite et lesquelles
   * attendent d'approcher de l'ecran.
   */
  const enVedette = grouperEnArticles(duJour);

  // ---- CE QUI SE PERD EN ROUTE.
  //
  // Le marchand ne voit que ses ventes, jamais ses quasi-ventes : un client qui
  // compose un panier, saisit son numero et s'arrete ne laissait aucune trace.
  // On enregistre donc l'etape juste avant la validation — la seule qui ait de
  // la valeur, et la seule ou l'on sait qui c'est.
  //
  // Attendre que la saisie se pose : sans ce delai, chaque « + » sur un plat
  // partirait en appel reseau. Le client qui hesite dix fois enverrait dix
  // ecritures pour un seul panier.
  //
  // Rien de tout cela n'est visible ni bloquant. Le client n'a rien demande, et
  // un echec de mesure ne doit pas peser d'un gramme sur sa commande.
  useEffect(() => {
    if (!estMarchandSheets || !telOk || lignes.length === 0) return;

    const minuteur = setTimeout(() => {
      fetch(`/api/boutiques/${slug}/panier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // LE NOM NE PART PAS. Cette mesure sert a compter les paniers qui
        // n'aboutissent pas : le marchand n'en voit qu'un nombre et une
        // valeur. Le numero suffit a ne pas compter deux fois le meme client ;
        // le nom n'apprenait rien, et c'etait celui de quelqu'un qui n'avait
        // encore rien commande. Il part avec la commande, pas avant.
        body: JSON.stringify({
          tel,
          lignes: lignes.map(l => ({
            id: l.prod.id,
            nom: l.variante ? `${l.prod.nom} (${l.variante})` : l.prod.nom,
            quantite: l.q,
            prix: l.prod.prix,
          })),
        }),
      }).catch(() => {
        // Silence volontaire : c'est une mesure, pas une commande.
      });
    }, 2500);

    return () => clearTimeout(minuteur);
    // `lignes` est reconstruit a chaque rendu ; on se declenche donc sur ce qui
    // change vraiment — le contenu du panier et le numero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estMarchandSheets, telOk, tel, slug, JSON.stringify(panier)]);

  /** Le stockage de l'onglet, ou `null` s'il est interdit (navigation privee). */
  const stockageOnglet = (): StockageCle | null => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  };

  /**
   * Une cle au hasard. `randomUUID` n'existe que sur une page servie en
   * https ; le repli compose la meme forme a partir de `getRandomValues`, que
   * tous les navigateurs ont.
   */
  const tirerCle = (): string => {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const o = crypto.getRandomValues(new Uint8Array(16));
    const h = Array.from(o, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };

  /** Range le recu : a l'ecran ET dans l'onglet, sans quoi il reviendrait. */
  const masquerRecu = () => {
    setRecu(null);
    try {
      window.sessionStorage.removeItem(clefRecu(slug));
    } catch {
      // Rien a effacer si le stockage est indisponible.
    }
  };

  const commander = async () => {
    setSansReponse(false);
    if (estMarchandSheets) {
      setEnvoi(true);
      // Une nouvelle tentative efface le verdict de la precedente : sans cela,
      // un refus resterait affiche sous une commande qui vient de passer.
      setEchec('');
      setEnvoiWhatsapp(false);
      try {
        const res = await fetch(`/api/boutiques/${slug}/commander`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nom, tel, adresse, instructions,
            /**
             * LE CHOIX PART AVEC LA COMMANDE, ET LE SERVEUR TRANCHE.
             *
             * `mode_recuperation` decide de tout ce qui suit : adresse ou non,
             * frais ou non, livreur alerte ou non. Le laisser au navigateur
             * serait le laisser a un onglet reste ouvert apres que le marchand
             * a change d'avis — la route revalide contre la fiche.
             *
             * `heure_retrait` n'est qu'un « HH:MM » : c'est le SERVEUR qui le
             * date, en heure d'Abidjan. Un client qui commande depuis un autre
             * fuseau pour sa famille ne doit pas voir son horloge decider.
             * Vide veut dire « des que pret », et vaudra `null`.
             */
            mode_recuperation: modeChoisi,
            heure_retrait: modeChoisi === 'retrait' ? heureRetrait : '',
            // Le choix du client part avec la ligne : sans lui, le marchand
            // recevrait « chaussure luminous » et devrait rappeler pour
            // demander la pointure — ce que ce travail existe pour eviter.
            panier: Object.entries(panier).map(([clef, quantite]) => {
              const { pid, variante } = litClef(clef);
              return { id: pid, quantite, variante };
            }),
            // LA MEME COMMANDE PORTE LA MEME CLE, d'un essai a l'autre : le
            // serveur reconnait un second envoi et rend la premiere au lieu
            // d'en creer une seconde. Voir `@/lib/cleEnvoi`.
            cle: clePourEnvoi(
              stockageOnglet(),
              clefDeLaCle(slug),
              empreinteEnvoi({ panier, telephone: tel, mode: modeChoisi }),
              tirerCle,
            ),
          }),
        });
        const d = await res.json();
        if (d.ok) {
          // LE RECU SE COMPOSE AVANT QUE LE PANIER SE VIDE : deux lignes plus
          // bas, il n'y aura plus rien a y inscrire.
          const nouveau: DonneesRecu = {
            reference: String(d.order_id),
            jeton: String(d.jeton_suivi ?? ''),
            lignes: lignes.map((l) => ({
              quantite: l.q,
              nom: l.prod.nom,
              variante: l.variante,
              montant: l.q * l.prod.prix,
            })),
            total,
            mode: modeChoisi,
            heure: modeChoisi === 'retrait' ? heureRetrait : '',
            adresseRetrait: modeChoisi === 'retrait' ? recuperation.adresse : '',
            paiements: infos.paiements,
            frais: mentionFrais({ mode: modeChoisi, offerteDes: recuperation.offerteDes, total }),
          };
          setRecu(nouveau);
          // Partie : la prochaine sera une AUTRE commande, meme identique.
          oublierCle(stockageOnglet(), clefDeLaCle(slug));
          // Garde le temps de l'onglet : le recu envoie le client sur
          // WhatsApp, et c'est ce trajet qui fait decharger la page.
          try {
            window.sessionStorage.setItem(clefRecu(slug), ecrireRecu(nouveau));
          } catch {
            // Stockage indisponible : le recu reste a l'ecran, c'est l'essentiel.
          }
          setPanier({}); setNom(''); setTel(''); setAdresse(''); setInstructions('');
          // L'heure demandee appartenait a la commande qui vient de partir :
          // la garder ferait proposer la meme a la suivante, sans un mot.
          setHeureRetrait('');
          /**
           * LE CLIENT DOIT VOIR LE VERDICT.
           *
           * Les deux bandeaux sont en haut de la page, le bouton tout en bas.
           * Sur telephone, apres le clic : le panier se vide, le ticket
           * redevient « Ajoutez un article », la barre du bas disparait -- et
           * rien ne defile. Le client voyait son formulaire s effacer SANS
           * verdict, ce que le commentaire du bandeau voulait justement eviter.
           */
          verdictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          // Il n'y avait pas de `else` : quand l'API refusait, la page ne
          // disait RIEN. Le bouton se reactivait, et le client repartait sans
          // savoir si sa commande etait passee. Le panier est conserve, pour
          // qu'il n'ait qu'a recommencer.
          setEchec(
            typeof d.error === 'string' && d.error
              ? d.error
              : 'Commande non enregistrée, merci de réessayer.',
          );
        }
      } catch {
        // Reseau coupe ou reponse illisible : meme regle, on ne se tait pas.
        // Pas de reponse lisible : la connexion est tombee, a l'aller ou au
        // retour. On ne sait pas lequel, et on le dit.
        setSansReponse(true);
        setEchec(
          'Nous n’avons pas reçu de réponse : votre commande est peut-être partie.'
          + ' Avant de réessayer, regardez si un message WhatsApp de la boutique est arrivé.',
        );
      } finally {
        setEnvoi(false);
        // Un echec doit se voir autant qu un succes : meme raison qu au-dessus.
        verdictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      // LE CHOIX DOIT FIGURER DANS CE TEXTE. Pour les boutiques hors registre,
      // ce message EST la commande : le marchand n'a rien d'autre, aucune
      // ligne en base a consulter. Une pointure absente ici, c'est un appel de
      // plus et un client qui attend.
      const lignesTexte = lignes
        .map(l => `- ${l.q}x ${l.prod.nom}${l.variante ? ` — ${l.variante}` : ''}`
          + ` (${fcfa(l.q * l.prod.prix)} FCFA)`)
        .join('\n');
      // LE MODE DOIT FIGURER DANS CE TEXTE, pour la meme raison que le choix
      // de taille : ce message EST la commande, le marchand n'a rien d'autre.
      // « Adresse : » suivi du vide, chez un client qui vient chercher, se lit
      // comme une adresse oubliee — et le marchand rappelle pour rien.
      const recup = modeChoisi === 'retrait'
        ? `À emporter${heureRetrait ? ` — retrait vers ${heureRetrait}` : ' — dès que prêt'}`
        : `Adresse : ${adresse}`;
      const msg = `Bonjour ${header.nom}, je souhaite commander :\n${lignesTexte}\nTotal : ${fcfa(total)} FCFA\nNom : ${nom}\n${recup}${instructions ? `\nInstructions : ${instructions}` : ''}`;
      const digits = telBoutique.replace(/\D/g, '');

      /**
       * SANS NUMERO, ON N OUVRE RIEN.
       *
       * `telephone` est nullable en base et arrive ici en `?? ''` : `digits`
       * pouvait etre vide, et la ligne construisait `wa.me/225`. WhatsApp
       * repondait « numero invalide » et le client croyait la boutique fermee.
       */
      if (!digits) {
        setEchec(
          'Cette boutique n’a pas encore de numéro WhatsApp. Réessayez plus tard.',
        );
        verdictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const full = digits.startsWith('225') ? digits : `225${digits}`;
      window.open(`https://wa.me/${full}?text=${encodeURIComponent(msg)}`, '_blank');

      // On ouvrait WhatsApp et plus rien : pas d etat, pas de reference, panier
      // et champs conserves. Le client revenait sur l onglet sans savoir si son
      // message etait parti.
      setEchec('');
      masquerRecu();
      setEnvoiWhatsapp(true);
      verdictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  /**
   * Une carte par ARTICLE, pas par coloris.
   *
   * Le coloris choisi commande tout ce que la carte montre — la photo, le prix,
   * le stock — et c'est LUI qui entre au panier. Les autres restent a portee de
   * pouce, en vignettes.
   */
  const grille = (articles: Article[], depart = 0) => (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {articles.map((article, i) => {
        // Le coloris retenu, ou le premier qui reste en stock. Ouvrir une carte
        // sur une declinaison epuisee ferait croire l'article indisponible.
        const choisi = article.variantes.find(v => v.id === coloris[article.cle])
          ?? article.variantes.find(v => v.stock !== 0)
          ?? article.variantes[0];

        const p = choisi;
        const plusieurs = article.variantes.length > 1;

        /**
         * Combien de cet article, toutes tailles confondues, sont deja au
         * panier. Le panier est desormais indexe par article ET par choix :
         * une lecture directe `panier[id]` manquerait toutes les lignes
         * portant une pointure, et la carte afficherait « ajouter » alors que
         * le client en a deja trois.
         */
        const prisPour = (pid: string) =>
          Object.entries(panier)
            .filter(([clef]) => litClef(clef).pid === pid)
            .reduce((s, [, q]) => s + q, 0);

        /** La quantite de la ligne exacte — cet article, ce choix. */
        const prisIci = panier[clefLigne(p.id, choixTaille[article.cle] ?? '')] ?? 0;

        // Ce que le client a deja pris dans les AUTRES coloris. Sans cette
        // ligne, il ajoute du blanc, passe au noir, et son panier semble vide.
        const ailleurs = article.variantes
          .filter(v => v.id !== p.id && prisPour(v.id))
          .map(v => `${prisPour(v.id)} ${v.couleur || v.nom}`);

        /**
         * L'ARTICLE PROPOSE UN CHOIX, ET LE CLIENT NE L'A PAS ENCORE FAIT.
         *
         * On n'en choisit AUCUN a sa place. Preselectionner la premiere
         * pointure ferait partir des commandes en 38 parce que 38 vient avant
         * 39 dans la liste du marchand — une valeur par defaut qui masque une
         * absence de choix, le defaut que cette plateforme a deja paye
         * plusieurs fois. Le bouton attend.
         */
        /**
         * LA CARACTERISTIQUE APPARTIENT A L'ARTICLE, PAS A UN COLORIS.
         *
         * Chaque coloris est une ligne de catalogue distincte, et la pointure
         * y est saisie ligne par ligne. Un marchand qui l'a renseignee sur le
         * rouge et pas sur le bleu voyait donc sa carte s'ouvrir sur le bleu,
         * SANS AUCUN SELECTEUR — et « Ajouter » redevenait cliquable sans
         * taille, exactement le probleme qu'on venait de fermer. Constate en
         * production sur la premiere boutique qui s'en est servie.
         *
         * On prend donc celle du coloris affiche s'il en porte une, et a
         * defaut celle de n'importe quel coloris de l'article. Une chaussure
         * existe dans les memes pointures quelle que soit sa couleur ; quand
         * ce n'est pas le cas, le marchand renseigne chaque coloris et c'est
         * le sien qui prime.
         */
        const porteuse = (p.attributNom && (p.attributValeurs?.length ?? 0) > 0)
          ? p
          : article.variantes.find(v => v.attributNom && (v.attributValeurs?.length ?? 0) > 0);

        const attributNom = porteuse?.attributNom ?? '';
        const valeurs = porteuse?.attributValeurs ?? [];
        const doitChoisir = Boolean(attributNom) && valeurs.length > 0;

        /**
         * ON N'HERITE PAS D'UN CHOIX QUI N'EST PLUS PROPOSE. Si le client
         * retient le 41 sur le rouge puis passe au bleu, qui ne fait que du
         * 38, garder « 41 » enverrait une commande dans une pointure que le
         * marchand n'a pas. Le choix retombe a vide et le bouton redemande.
         */
        const retenue = choixTaille[article.cle] ?? '';
        const tailleChoisie = valeurs.includes(retenue) ? retenue : '';
        const enAttenteDeChoix = doitChoisir && !tailleChoisie;

        /**
         * LA MARQUE ET LE RAYON APPARTIENNENT A L'ARTICLE, comme la pointure.
         *
         * Chaque coloris est une ligne de catalogue distincte : un marchand
         * qui saisit la marque sur le rouge et l'oublie sur le bleu verrait sa
         * carte l'afficher ou non selon le coloris ouvert. On prend donc celle
         * du coloris affiche s'il en porte une, a defaut celle de n'importe
         * quel coloris du meme article — une chaussure ne change pas de marque
         * en changeant de couleur.
         */
        const premiereValeur = (lire: (v: Produit) => string | undefined) =>
          String(lire(p) ?? '').trim()
          || String(article.variantes.map(lire).find(v => String(v ?? '').trim()) ?? '').trim();

        const marque = premiereValeur(v => v.marque);
        const publicVise = premiereValeur(v => v.publicVise);

        return (
          <article
            key={article.cle}
            className="group flex flex-col overflow-hidden border border-[var(--hairline)] bg-chaux-50 transition duration-200 soft-shadow hover:-translate-y-1"
          >
            <Visuel p={p} rang={depart + i} />

            <div className="flex flex-1 flex-col p-4">
              {/* LA MARQUE PASSE AVANT LE NOM.
                  C'est la convention de toutes les vitrines de mode, et ce
                  n'est pas une mode : « Nike » dit plus au client que
                  « chaussure luminous ». Il cherche une marque, puis regarde
                  ce qu'elle propose — pas l'inverse.

                  Comme partout ici, elle ne parait que si le marchand l'a
                  donnee : un restaurant n'a pas de marque, et sa carte ne doit
                  pas se couvrir de mentions vides. */}
              {marque && (
                <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-nuit-900">
                  {marque}
                </p>
              )}

              <h3 className={`font-display text-lg font-bold leading-tight text-nuit-900 ${marque ? 'mt-0.5' : ''}`}>
                {article.titre}
              </h3>

              {/* Le coloris et le rayon se lisent sous le titre, comme sur une
                  etiquette coutue au col. */}
              {(p.couleur || publicVise) && (
                <p className="mt-0.5 font-mono text-xs uppercase tracking-[0.14em] text-chaux-600">
                  {[p.couleur, publicVise].filter(Boolean).join(' · ')}
                </p>
              )}

              {p.description && (
                <p className="mt-1.5 text-sm leading-snug text-chaux-600">{p.description}</p>
              )}

              {/* LA QUESTION QUE TOUT ACHETEUR DE CHAUSSURES POSE EN PREMIER.
                  « Vous avez ma pointure ? » — il fallait ecrire pour le
                  demander, et le marchand repondre a la main, a chaque client
                  et pour chaque article. La reponse est desormais sur la
                  carte, avant meme la question.

                  LES VALEURS SONT MONTREES, PAS PROPOSEES A LA SELECTION. Ce
                  qu'on affiche, c'est CE QUI EXISTE chez le marchand ; le
                  choix se fait dans la conversation, comme aujourd'hui. Les
                  transformer en boutons laisserait croire que la pointure
                  choisie est reservee, alors que rien en base ne tient un
                  stock par pointure — une promesse qu'on ne pourrait pas
                  tenir vaudrait moins que l'information brute.

                  Le nom vient du marchand : « Pointure » chez le cordonnier,
                  « Taille » chez le tailleur. */}
              {doitChoisir && (
                <div className="mt-3">
                  <p className="font-mono text-xs uppercase tracking-[0.14em] text-chaux-600">
                    {attributNom}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {valeurs.map(v => {
                      const actif = v === tailleChoisie;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() =>
                            setChoixTaille(c => ({ ...c, [article.cle]: actif ? '' : v }))
                          }
                          aria-pressed={actif}
                          aria-label={`${attributNom} ${v}`}
                          className={`min-h-11 min-w-11 border px-3 text-sm font-semibold transition ${
                            actif
                              ? 'border-nuit-900 bg-nuit-900 text-chaux-50'
                              : 'border-[var(--hairline)] bg-white text-nuit-800 hover:border-nuit-900'
                          }`}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ---- Les coloris, quand il y en a plusieurs. */}
              {plusieurs && (
                <div className="mt-3">
                  <p className="font-mono text-xs uppercase tracking-[0.14em] text-chaux-600">
                    {article.variantes.length} coloris disponibles
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {article.variantes.map(v => {
                      const actif = v.id === p.id;
                      const vide = v.stock === 0;
                      return (
                        <button
                          key={v.id}
                          onClick={() => setColoris(c => ({ ...c, [article.cle]: v.id }))}
                          aria-pressed={actif}
                          aria-label={`Voir ${article.titre} en ${v.couleur || v.nom}${vide ? ' (épuisé)' : ''}`}
                          title={v.couleur || v.nom}
                          className={`relative h-12 w-12 shrink-0 overflow-hidden border transition ${
                            actif
                              ? 'border-nuit-900 ring-1 ring-nuit-900'
                              : 'border-[var(--hairline)] hover:border-nuit-400'
                          }`}
                        >
                          {v.image ? (
                            // TOUJOURS DIFFEREE, sans exception de rang : une
                            // vignette de coloris vit SOUS la photo de sa
                            // carte, donc jamais dans la premiere fenetre. Un
                            // article a quatre coloris en porte quatre.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={v.image}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              fetchPriority="low"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center bg-chaux-100 font-display text-sm font-black text-nuit-900/30">
                              {initiale(v.couleur || v.nom)}
                            </span>
                          )}
                          {/* Un coloris epuise reste VISIBLE mais se dit tel :
                              le masquer ferait croire qu'il n'existe pas. */}
                          {vide && (
                            <span
                              aria-hidden
                              className="absolute inset-0 flex items-center justify-center bg-chaux-50/75 font-mono text-[9px] font-bold uppercase tracking-wider text-chaux-600"
                            >
                              Épuisé
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                {/* Le prix est une donnée : en mono, il s'aligne d'une carte
                    à l'autre et se compare d'un coup d'œil. */}
                <p className="font-mono text-lg font-bold leading-none text-bissap-600">
                  {fcfa(p.prix)}
                  <span className="ml-1 text-xs font-semibold text-chaux-600">FCFA</span>
                </p>

                {prisIci ? (
                  <div className="flex items-center border border-[var(--hairline)] bg-white">
                    <button
                      onClick={() => retirer(p.id, tailleChoisie)}
                      aria-label={`Retirer un ${p.nom}${tailleChoisie ? ` ${tailleChoisie}` : ''}`}
                      className="flex h-11 w-11 items-center justify-center text-nuit-700 transition hover:bg-chaux-100"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-7 text-center font-mono text-sm font-bold text-nuit-900">
                      {prisIci}
                    </span>
                    <button
                      onClick={() => ajouter(p.id, tailleChoisie)}
                      // Le plafond porte sur la SOMME des tailles : rien en
                      // base ne tient un stock par pointure.
                      disabled={typeof p.stock === 'number' && prisPour(p.id) >= p.stock}
                      aria-label={`Ajouter un ${p.nom}${tailleChoisie ? ` ${tailleChoisie}` : ''}`}
                      className="flex h-11 w-11 items-center justify-center bg-bissap-500 text-white transition hover:bg-bissap-600 disabled:cursor-not-allowed disabled:bg-chaux-300"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ) : enAttenteDeChoix ? (
                  /* ON NE CHOISIT PAS A SA PLACE. Le bouton attend, et dit ce
                     qu'il attend — un bouton grisé sans explication passe pour
                     une panne, et le client s'en va. */
                  <span className="border border-dashed border-chaux-300 px-3 py-2 text-center font-mono text-xs uppercase tracking-[0.12em] text-chaux-600">
                    Choisissez votre {attributNom.toLowerCase()}
                  </span>
                ) : p.stock === 0 ? (
                  /* Epuise : on le DIT plutot que de masquer le plat. Le client
                     voit qu'il existe et reviendra le chercher ; un plat disparu
                     donne l'impression d'une carte pauvre.
                     Le serveur refuse de toute facon la commande — cet affichage
                     evite au client de composer un panier pour rien. */
                  <span className="border border-[var(--hairline)] bg-chaux-100 px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.15em] text-chaux-600">
                    Épuisé
                  </span>
                ) : (
                  <button
                    onClick={() => ajouter(p.id, tailleChoisie)}
                    className={classesBouton('action', 'md', 'carree')}
                  >
                    <Plus className="h-4 w-4" /> Ajouter
                  </button>
                )}
              </div>

              {/* Un bouton grise sans explication passe pour une panne. On dit ce
                  qui reste, et seulement quand le client bute dessus. */}
              {typeof p.stock === 'number' && p.stock > 0 && prisPour(p.id) >= p.stock && (
                <p className="mt-2 text-right font-mono text-xs font-semibold text-chaux-600">
                  Il n’en reste que {p.stock}
                </p>
              )}

              {/* Le panier suit le CLIENT, pas la carte : ce qu'il a pris dans
                  un autre coloris doit rester visible quand il en regarde un
                  troisieme. */}
              {ailleurs.length > 0 && (
                <p className="mt-2 text-right font-mono text-xs text-chaux-600">
                  Déjà au panier : {ailleurs.join(', ')}
                </p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--background)] pb-28 lg:pb-10">
      {/* Bandeau resserre sur telephone : c'est le menu qui doit occuper
          l'ecran, pas l'enseigne. */}
      <header className="indigo-weave relative bg-nuit-900 px-5 pb-6 pt-5 text-white sm:px-8 sm:pb-10 sm:pt-6">
        <div className="mx-auto max-w-6xl">
          {/* LES DEUX SORTIES SUR UNE SEULE LIGNE.
              « Suivre ma commande » occupait sa propre rangee sous l'enseigne :
              56 px pris au menu, pour un client qui vient d'arriver et n'a
              encore rien commande. Mesure a 390 px le 23 novembre 2026 : aucun
              plat n'etait nomme sur le premier ecran. Les deux liens partagent
              maintenant la rangee du haut, et le talon se raccourcit sur
              telephone pour leur laisser la place. */}
          <div className="flex items-center justify-between gap-3">
            <LienRetour href="/boutiques">
              <span className="sm:hidden">Boutiques</span>
              <span className="hidden sm:inline">Retour aux boutiques</span>
            </LienRetour>
            <Link
              href="/suivi"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-white/90 underline decoration-white/35 underline-offset-4 transition hover:decoration-white sm:border sm:border-white/25 sm:bg-white/10 sm:px-4 sm:font-mono sm:text-xs sm:font-normal sm:uppercase sm:tracking-[0.18em] sm:no-underline sm:hover:bg-white/20"
            >
              <MapPin className="h-4 w-4" /> Suivre ma commande
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 sm:mt-6 sm:gap-5">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-mangue-300">
                {header.secteur}
                {zone && ` · ${zone}`}
              </p>
              <div className="mt-1.5 flex items-center gap-3 sm:mt-2 sm:gap-4">
                {/* LA MARQUE DU MARCHAND, PAS UNE VIGNETTE GENERIQUE.
                    Cet ecran affichait l'emoji meme quand le commercant avait
                    depose son logo : le champ ne montait simplement pas
                    jusqu'ici. C'est sa page — sa marque y passe avant tout.

                    Pas de cadre autour d'un vrai logo : il porte deja sa
                    limite, et une bordure de plus l'enferme dans une vignette.
                    Le cadre reste pour l'emoji et l'initiale, qui sans lui se
                    liraient comme un caractere au fil du texte. */}
                <Enseigne
                  nom={header.nom}
                  emoji={header.emoji}
                  logo={header.logo || null}
                  cadre={!header.logo}
                  variante="nuit"
                  className="h-12 w-12 text-2xl sm:h-16 sm:w-16 sm:text-3xl"
                />
                <h1 className="font-display text-3xl font-black leading-[1.05] sm:text-5xl">
                  {header.nom}
                </h1>
              </div>

              {/* L'etat d'ouverture se lit AVANT le menu, pas au moment de
                  valider. Un client qui remplit son panier a 3 h du matin pour
                  s'entendre dire non a la derniere seconde ne revient pas — et
                  c'est le commerce qu'il juge, pas l'heure. */}
              {messageHoraire && (
                <p
                  className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold ${
                    ouvert ? 'bg-accent-500/20 text-accent-200' : 'bg-bissap-500/20 text-bissap-200'
                  }`}
                >
                  {/* Carre, comme le voyant de l'onboarding. Un point rond au milieu
                      d'une langue sans arrondi est un corps etranger, meme minuscule. */}
                  <span className={`h-2 w-2 ${ouvert ? 'bg-accent-400' : 'bg-bissap-400'}`} />
                  {messageHoraire}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* La couture entre l'enseigne et le menu. */}
        <div className="perf-line absolute inset-x-0 bottom-0 text-white" />
      </header>

      <main id="contenu" className="mx-auto max-w-6xl px-5 pb-8 pt-5 sm:px-8 sm:py-8">
        {/* `scroll-mt-4` : le recu et le refus arrivent par defilement ; sans marge
            ils collaient au bord haut de l'ecran, comme coupes. */}
        <div ref={verdictRef} className="scroll-mt-4" />

        {/* La voie WhatsApp : ni reference ni suivi -- mais un accuse, sans
            lequel le client ne savait pas si son message etait parti. */}
        {envoiWhatsapp && (
          <div
            role="status"
            className="mb-8 border border-accent-200 bg-accent-50 p-5"
          >
            <p className="text-sm text-accent-800">
              WhatsApp s’est ouvert avec votre commande.{' '}
              <b>Envoyez le message</b> pour que le commerçant la reçoive — tant
              qu’il n’est pas envoyé, il ne sait rien de votre demande.
            </p>
          </div>
        )}

        {/* LE RECU REMPLACE LE BANDEAU.
            Le succes tenait dans un paragraphe de petit texte, ou « Repondez
            au message WhatsApp » etait une incise — alors que la commande
            n'est PAS lancee tant que le client n'a pas repondu. Il refermait
            l'onglet en croyant avoir fini. Le recu met cette etape en titre,
            et montre ce qui a ete commande : voir `./Recu.tsx`. */}
        {recu && (
          <Recu recu={recu} slug={slug} fondPage={FOND_PAGE} onMasquer={masquerRecu} />
        )}

        {/* Le pendant du bandeau « REÇUE ». Une commande refusee doit se voir
            autant qu'une commande passee : c'est son absence qui a laisse un
            client croire, le 15 aout, qu'il avait commande. */}
        {echec && (
          <div
            role="alert"
            /* LA MANGUE POUR CE QU'ON NE SAIT PAS, le bissap pour ce qui est refuse :
               DESIGN.md donne a la mangue « en attente, a surveiller ». Peindre
               en rouge une commande peut-etre partie la declarerait perdue. */
            className={`mb-8 flex flex-wrap items-center gap-4 border p-5 ${
              sansReponse ? 'border-mangue-200 bg-mangue-50' : 'border-bissap-200 bg-bissap-50'
            }`}
          >
            <span
              className={`stamp shrink-0 font-mono text-xs font-bold ${
                sansReponse ? 'text-mangue-700' : 'text-bissap-700'
              }`}
            >
              {sansReponse ? 'SANS RÉPONSE' : 'REFUSÉE'}
            </span>
            <p className={`min-w-0 flex-1 basis-56 text-sm ${sansReponse ? 'text-nuit-900' : 'text-bissap-800'}`}>
              {echec} Votre panier est conservé.
            </p>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────
            CE QU'IL FAUT SAVOIR AVANT DE COMMANDER.

            Un client qui decouvre une boutique se pose quatre questions :
            combien de temps, chez moi est-ce livre, comment je paie, y a-t-il
            un minimum. Aucune ne trouvait de reponse ici. Il fallait ECRIRE AU
            MARCHAND — et beaucoup n'ecrivent pas : ils ferment la page.

            PLACE AVANT LE CATALOGUE, parce que c'est avant de composer un
            panier qu'on veut ces reponses. Les frais de livraison etaient bien
            annonces, mais tout en bas du formulaire : le client l'apprenait
            apres avoir choisi, ce qui est la plus mauvaise place pour une
            information qui peut le faire renoncer.

            CHAQUE LIGNE NE PARAIT QUE SI LE MARCHAND L'A RENSEIGNEE. On
            n'invente aucune valeur par defaut : « livraison rapide » ou
            « paiement a la livraison » ecrits d'office seraient des promesses
            que personne n'a faites, et que le marchand devrait tenir a chaque
            course.

            LA LIGNE DES FRAIS EST DANS CE BLOC, DONC CONDITIONNELLE ELLE
            AUSSI — et ce n'est pas un oubli. Elle reste affichee pour tout le
            monde dans le panneau de commande, la ou l'on saisit son adresse.
            La sortir d'ici pour l'afficher seule, au-dessus du catalogue d'une
            boutique qui n'a rien renseigne, donnerait un encadre solitaire
            portant une seule phrase : le client y lirait un avertissement
            plutot qu'un renseignement. Elle est ici en RAPPEL, quand le bloc
            existe deja pour autre chose. */}
        {(infos.delai || infos.zones || infos.paiements.length > 0 || infos.minimum !== null) && (
          <section
            aria-label="Ce qu’il faut savoir avant de commander"
            className="mb-4 border border-[var(--hairline)] bg-white sm:mb-6"
          >
            {/* SUR TELEPHONE, UNE LIGNE — LE DETAIL A LA DEMANDE.
                Ce bloc prenait 300 px entre l'enseigne et le premier plat :
                le client qui arrive d'un lien WhatsApp lisait un delai, une
                ville et des moyens de paiement avant d'avoir vu a manger. Il
                se pose ces questions au moment de donner son adresse, pas
                avant d'avoir faim. La ligne garde l'essentiel sous les yeux ;
                le reste s'ouvre d'un geste, et reste deplie sur grand ecran
                ou la place ne manque pas. */}
            <button
              type="button"
              aria-expanded={infosOuvertes}
              aria-controls="infos-detail"
              onClick={() => setInfosOuvertes(o => !o)}
              className="flex min-h-11 w-full items-center justify-between gap-4 px-4 py-3 text-left sm:hidden"
            >
              <span className="text-sm leading-snug text-nuit-800">
                {[
                  infos.delai && (/^\d+$/.test(infos.delai) ? `${infos.delai} min` : infos.delai),
                  infos.minimum !== null && `Minimum ${fcfa(infos.minimum)} FCFA`,
                  infos.paiements.length > 0 && infos.paiements.join(', '),
                  'Livraison en plus',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className="shrink-0 font-mono text-xs uppercase tracking-[0.16em] text-chaux-600 underline decoration-chaux-300 underline-offset-4">
                {infosOuvertes ? 'Fermer' : 'Détails'}
              </span>
            </button>

            <div
              id="infos-detail"
              className={infosOuvertes ? 'border-t border-[var(--hairline)] sm:border-t-0' : 'hidden sm:block'}
            >
            <div className="grid gap-px bg-[var(--hairline)] sm:grid-cols-2">
              {infos.delai && (
                <div className="bg-white p-4">
                  <p className="font-mono text-xs uppercase tracking-[0.16em] text-chaux-600">
                    Délai habituel
                  </p>
                  {/* UN NOMBRE SEUL NE DIT RIEN AU CLIENT.
                      Le champ est libre — « 30 à 45 min », « 1 à 2 jours » —
                      parce qu'un traiteur et une boutique de vetements ne
                      comptent pas dans la meme unite. Mais le premier marchand
                      qui l'a rempli a tape « 30 », et la carte aurait affiche
                      « Delai habituel — 30 ». Trente quoi ?

                      On ne complete QUE le cas sans ambiguite : une valeur
                      faite uniquement de chiffres, dans un champ de delai de
                      livraison, se compte en minutes — c'est d'ailleurs ce que
                      propose le champ. Tout le reste passe intact : on ne
                      reecrit pas ce que le marchand a formule lui-meme. */}
                  <p className="mt-1 font-display text-lg font-bold text-nuit-900">
                    {/^\d+$/.test(infos.delai) ? `${infos.delai} min` : infos.delai}
                  </p>
                </div>
              )}

              {infos.zones && (
                <div className="bg-white p-4">
                  <p className="font-mono text-xs uppercase tracking-[0.16em] text-chaux-600">
                    Quartiers livrés
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-nuit-800">{infos.zones}</p>
                </div>
              )}

              {infos.paiements.length > 0 && (
                <div className="bg-white p-4">
                  <p className="font-mono text-xs uppercase tracking-[0.16em] text-chaux-600">
                    Paiement accepté
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-nuit-800">
                    {infos.paiements.join(' · ')}
                  </p>
                </div>
              )}

              {infos.minimum !== null && (
                <div className="bg-white p-4">
                  <p className="font-mono text-xs uppercase tracking-[0.16em] text-chaux-600">
                    Commande minimum
                  </p>
                  <p className="mt-1 font-display text-lg font-bold text-nuit-900">
                    {fcfa(infos.minimum)}
                    <span className="ml-1 text-xs font-semibold text-chaux-600">FCFA</span>
                  </p>
                </div>
              )}
            </div>

            <p className="border-t border-[var(--hairline)] px-4 py-3 text-xs leading-relaxed text-chaux-600">
              Les frais de livraison sont annoncés par le livreur et se règlent en plus,
              à la réception.
            </p>
            </div>
          </section>
        )}

        {/* LES FILTRES DU CLIENT, AVANT CEUX DU MARCHAND.
            Un acheteur de vetements cherche une marque ou un rayon ; la
            categorie, elle, dit comment le marchand a range sa boutique. On
            met donc ces deux-la EN PREMIER, et seulement quand ils offrent un
            vrai choix — un filtre a une seule valeur ne filtre rien. */}
        {(marques.length > 1 || publics.length > 1) && (
          <div className="mb-4 flex flex-col gap-3">
            {[
              { titre: 'Marque', tout: 'toutes', valeurs: marques, choisi: marqueFiltre, poser: setMarqueFiltre },
              { titre: 'Pour qui', tout: 'tous', valeurs: publics, choisi: publicFiltre, poser: setPublicFiltre },
            ]
              .filter(f => f.valeurs.length > 1)
              .map(f => (
                <div key={f.titre}>
                  <p className="mb-1.5 font-mono text-xs uppercase tracking-[0.16em] text-chaux-600">
                    {f.titre}
                  </p>
                  <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
                    {[f.tout, ...f.valeurs].map(v => (
                      <button
                        key={v}
                        onClick={() => f.poser(v)}
                        aria-pressed={f.choisi === v}
                        className={`min-h-9 shrink-0 border px-3.5 text-sm font-semibold transition ${
                          f.choisi === v
                            ? 'border-nuit-900 bg-nuit-900 text-chaux-50'
                            : 'border-[var(--hairline)] bg-white text-nuit-800 hover:border-nuit-900'
                        }`}
                      >
                        {v === f.tout ? (f.titre === 'Marque' ? 'Toutes' : 'Tous') : v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}

        {categories.length > 1 && (
          // Une seule ligne qui defile : sur telephone, les pastilles
          // passaient a la ligne et repoussaient le menu hors de l'ecran.
          <div className="-mx-5 mb-6 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
            {['tout', ...categories].map(c => (
              <button
                key={c}
                onClick={() => setCategorie(c)}
                aria-pressed={categorie === c}
                // Memes onglets que sur la liste des boutiques : c'est le meme
                // classeur qu'on feuillette.
                className={`min-h-9 shrink-0 border px-3.5 font-mono text-xs uppercase tracking-[0.16em] transition ${
                  categorie === c
                    ? 'border-nuit-900 bg-nuit-900 text-chaux-50'
                    : 'border-[var(--hairline)] text-chaux-600 hover:border-nuit-900 hover:text-nuit-900'
                }`}
              >
                {c === 'tout' ? mots.tout : c}
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-10">
            {chargement ? (
              <p className="font-mono text-sm text-chaux-600">{mots.chargement}</p>
            ) : pannePage ? (
              /* TROIS SITUATIONS, TROIS TEXTES.
                 Un lien perime, une panne reseau et un catalogue vide se
                 ressemblaient a l ecran : le client repartait en pensant que
                 le commercant ne vend rien. */
              <div className="border border-dashed border-bissap-200 bg-bissap-50/40 p-10 text-center">
                <p className="font-display text-lg font-bold text-nuit-800">
                  {pannePage === 'introuvable'
                    ? 'Cette boutique est introuvable'
                    : 'Impossible de charger cette boutique'}
                </p>
                <p className="mt-1 text-sm text-chaux-600">
                  {pannePage === 'introuvable'
                    ? 'Le lien est peut-être périmé, ou la boutique n’est plus en ligne. Vérifiez le lien qu’on vous a envoyé.'
                    : 'Vérifiez votre connexion et réessayez dans un instant.'}
                </p>
              </div>
            ) : visibles.length === 0 ? (
              <div className="border border-dashed border-[var(--hairline)] p-10 text-center">
                <p className="font-display text-lg font-bold text-nuit-800">{mots.vide}</p>
                <p className="mt-1 text-sm text-chaux-600">
                  Ce commerçant n&apos;a pas encore publié d&apos;article.
                </p>
              </div>
            ) : sectionne ? (
              <>
                <section>
                  <h2 className="mb-4 flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-[0.24em] text-mangue-600">
                    {mots.duJour}
                    <span className="h-px flex-1 bg-mangue-200" />
                  </h2>
                  {grille(enVedette)}
                </section>
                <section>
                  <h2 className="mb-4 flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-[0.24em] text-chaux-600">
                    {mots.reste}
                    <span className="h-px flex-1 bg-chaux-200" />
                  </h2>
                  {grille(grouperEnArticles(carte), enVedette.length)}
                </section>
              </>
            ) : (
              grille(grouperEnArticles(visibles))
            )}

            {/* COMPLETEZ VOTRE COMMANDE.
                Rien n'invitait jamais au second article : le client qui n'avait
                pas d'idee s'arretait a un. On propose ce que son panier n'a pas
                encore — une boisson apres un plat — plutot qu'un second article
                de la meme categorie, qui ressemblerait a du remplissage.

                Sous la grille et non dans le ticket : le ticket est etroit, et
                sur telephone il est tout en bas alors que le client vient de
                cliquer ici meme. */}
            {lignes.length > 0 && suggestions.length > 0 && (
              <section className="mt-10 border-t border-[var(--hairline)] pt-6">
                <h2 className="mb-4 flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-[0.24em] text-chaux-600">
                  Complétez votre commande
                  <span className="h-px flex-1 bg-chaux-200" />
                </h2>
                <ul className="grid gap-3 sm:grid-cols-3">
                  {suggestions.map(s => (
                    <li
                      key={`complement-${s.id}`}
                      className="flex items-center justify-between gap-3 border border-[var(--hairline)] bg-chaux-50 p-3 soft-shadow"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-nuit-900">{s.nom}</span>
                        <span className="font-mono text-xs text-chaux-600">{fcfa(s.prix)} FCFA</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => ajouter(s.id)}
                        aria-label={`Ajouter ${s.nom}`}
                        className="flex h-10 w-10 shrink-0 items-center justify-center bg-bissap-500 text-white transition hover:bg-bissap-600"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Le ticket : bon de commande qui se remplit à mesure. */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div
              ref={commandeRef}
              className="relative scroll-mt-6 border border-[var(--hairline)] bg-chaux-50 p-5 soft-shadow"
              style={{ ['--tear-bg' as string]: FOND_PAGE }}
            >
              {/* Le talon du bon, au-dessus de la perforation. Les encoches
                  mordent les bords du ticket : tant que le panneau avait des
                  angles arrondis, elles s'y noyaient et le motif ne se lisait
                  pas. */}
              <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-chaux-600">
                Bon de commande
              </p>
              <div className="tear absolute inset-x-0 top-11" />

              <h2 className="flex items-center gap-2 pt-8 font-display text-lg font-bold text-nuit-900">
                <ShoppingBag className="h-5 w-5 text-bissap-500" />
                Votre commande
              </h2>

              {lignes.length === 0 ? (
                <>
                  <p className="mt-3 text-sm text-chaux-600">
                    Ajoutez un article, il s&apos;inscrit ici.
                  </p>

                  {/* LE TICKET VIDE OCCUPAIT UNE COLONNE POUR NE RIEN DIRE.
                      Il propose maintenant ce que le marchand met en avant —
                      son menu du jour d'abord. On ne devine pas a sa place :
                      c'est le seul signal de mise en avant qu'il nous donne. */}
                  {suggestions.length > 0 && (
                    <div className="mt-5 border-t border-[var(--hairline)] pt-4">
                      <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-chaux-600">
                        Pour commencer
                      </p>
                      <ul className="mt-3 space-y-2">
                        {suggestions.map(s => (
                          <li key={`debut-${s.id}`} className="flex items-center justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-nuit-900">{s.nom}</span>
                              <span className="font-mono text-xs text-chaux-600">{fcfa(s.prix)} FCFA</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => ajouter(s.id)}
                              aria-label={`Ajouter ${s.nom}`}
                              className="flex h-9 w-9 shrink-0 items-center justify-center bg-bissap-500 text-white transition hover:bg-bissap-600"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* LE TICKET SE CORRIGE LA OU ON LE LIT.
                      Ses lignes etaient muettes : pour enlever un plat, il
                      fallait remonter toute la page jusqu'a sa carte — sur
                      telephone, un menu entier a refaire defiler, au moment
                      meme ou l'on relit sa commande avant de l'envoyer.
                      Le compteur est celui des cartes, a la meme taille : le
                      geste appris plus haut vaut ici. Le nom passe a la ligne
                      au lieu d'etre coupe — on relit ce qu'on commande. */}
                  <ul className="mt-4 divide-y divide-[var(--hairline)]">
                    {lignes.map(l => {
                      const libelle = `${l.prod.nom}${l.variante ? ` ${l.variante}` : ''}`;
                      return (
                        // La clef porte le CHOIX autant que l'article : deux
                        // pointures du meme modele partagent le meme
                        // identifiant, et React aurait vu deux fois la meme
                        // ligne — il n'en aurait affiche qu'une.
                        <li key={clefLigne(l.prod.id, l.variante)} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="min-w-0 break-words text-nuit-800">
                              {l.prod.nom}
                              {l.variante && (
                                <span className="text-chaux-600"> · {l.variante}</span>
                              )}
                            </span>
                            <span className="shrink-0 font-mono text-nuit-900">
                              {fcfa(l.q * l.prod.prix)}
                            </span>
                          </div>
                          <div className="mt-2 inline-flex items-center border border-[var(--hairline)] bg-white">
                            <button
                              type="button"
                              onClick={() => retirer(l.prod.id, l.variante)}
                              aria-label={`Retirer un ${libelle}`}
                              className="flex h-11 w-11 items-center justify-center text-nuit-700 transition hover:bg-chaux-100"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="w-8 text-center font-mono text-sm font-bold text-nuit-900">
                              {l.q}
                            </span>
                            <button
                              type="button"
                              onClick={() => ajouter(l.prod.id, l.variante)}
                              // Meme plafond que sur la carte : la SOMME des
                              // tailles, rien en base ne tient un stock par
                              // pointure.
                              disabled={
                                typeof l.prod.stock === 'number'
                                && lignes
                                  .filter(x => x.prod.id === l.prod.id)
                                  .reduce((s, x) => s + x.q, 0) >= l.prod.stock
                              }
                              aria-label={`Ajouter un ${libelle}`}
                              className="flex h-11 w-11 items-center justify-center text-nuit-700 transition hover:bg-chaux-100 disabled:cursor-not-allowed disabled:text-chaux-300"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="perf-line my-4 text-nuit-900" />

                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-chaux-600">
                      Total
                    </span>
                    <span className="font-mono text-2xl font-black text-bissap-600">
                      {fcfa(total)}
                      <span className="ml-1 text-xs font-semibold text-chaux-600">FCFA</span>
                    </span>
                  </div>

                  {/* CE QU'IL MANQUE, TANT QU'IL PEUT ENCORE Y FAIRE QUELQUE
                      CHOSE. Le minimum arretait la commande au tout dernier
                      geste, apres le nom, le telephone et l'adresse.

                      Les deux objectifs ne se ressemblent pas et ne doivent pas
                      se ressembler : le minimum EMPECHE de commander, il est
                      donc en mangue et porte un role d'alerte ; la livraison
                      offerte est une occasion, elle reste discrete. */}
                  {objectif && (
                    <p
                      role={objectif.type === 'minimum' ? 'status' : undefined}
                      className={`mt-3 border px-3 py-2 text-xs font-semibold ${
                        objectif.type === 'minimum'
                          ? 'border-mangue-200 bg-mangue-50 text-mangue-700'
                          : 'border-[var(--hairline)] bg-white text-chaux-600'
                      }`}
                    >
                      {phraseObjectif(objectif)}
                    </p>
                  )}

                  {/* CE QUE LE TOTAL NE DIT PAS.
                      Les frais de livraison sont annonces par le LIVREUR et se
                      reglent en plus -- l ecran de suivi le montre bien, la
                      vitrine se taisait. Le client decouvrait le surcout a sa
                      porte. NULL ne veut pas dire gratuit : on ne promet donc
                      pas un montant, on annonce qu il y en aura un.

                      La phrase depend maintenant du mode ET du total : elle
                      etait FAUSSE chez un marchand qui offre la livraison, et
                      sans objet en retrait. La regle vit dans `@/lib/retrait`,
                      avec celle qu'applique le serveur : le client ne doit pas
                      lire ici autre chose que ce qu'il paiera la-bas. */}
                  <p className="mt-2 text-xs text-chaux-600">
                    {mentionFrais({
                      mode: modeChoisi,
                      offerteDes: recuperation.offerteDes,
                      total,
                    })}
                  </p>

                  {/* LE CHOIX N'APPARAIT QUE S'IL Y EN A UN.
                      Un selecteur a une seule option est un bruit qui fait
                      douter : une boutique qui ne fait que livrer doit
                      ressembler exactement a ce qu'elle etait avant. */}
                  {modesProposes(recuperation.mode).length > 1 && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {([
                        { valeur: 'livraison', titre: 'Livraison', detail: 'On vous l’apporte.' },
                        { valeur: 'retrait', titre: 'Retrait', detail: 'Vous venez chercher.' },
                      ] as const).map((choix) => {
                        const actif = modeChoisi === choix.valeur;
                        return (
                          <button
                            key={choix.valeur}
                            type="button"
                            aria-pressed={actif}
                            onClick={() => setModeChoisi(choix.valeur)}
                            className={`border p-3 text-left transition ${
                              actif
                                ? 'border-nuit-900 bg-nuit-900 text-chaux-50'
                                : 'border-[var(--hairline)] bg-white text-nuit-800 hover:border-nuit-400'
                            }`}
                          >
                            <span className="block text-sm font-semibold">{choix.titre}</span>
                            <span
                              className={`mt-0.5 block text-xs ${actif ? 'text-chaux-200' : 'text-chaux-600'}`}
                            >
                              {choix.detail}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* CHAQUE CHAMP PORTE SON NOM AU-DESSUS DE LUI.
                      Les quatre n'avaient qu'une indication grisee, qui
                      s'efface au premier caractere : une fois rempli, le
                      formulaire ne disait plus ce que contenait chaque case,
                      et un lecteur d'ecran n'avait rien a annoncer. */}
                  <div className="mt-5 space-y-3">
                    <div>
                      <label htmlFor="champ-nom" className="mb-1 block text-xs font-semibold text-nuit-800">
                        Votre nom
                      </label>
                      <input
                        id="champ-nom"
                        autoComplete="name"
                        className="min-h-11 w-full border border-[var(--hairline)] bg-white px-3 py-2.5 text-base outline-none transition focus:border-nuit-400"
                        value={nom}
                        onChange={e => setNom(e.target.value)}
                      />
                    </div>
                    <div>
                      {/* « TELEPHONE » NE DISAIT PAS L'ESSENTIEL. La commande
                          n'est preparee que si le client repond au message
                          WhatsApp : un numero qui n'y est pas donne une
                          commande qui meurt sans bruit. On nomme donc le
                          numero qu'il faut, et pourquoi on le demande — c'est
                          aussi ce qui rassure au moment de le donner. */}
                      <label htmlFor="champ-tel" className="mb-1 block text-xs font-semibold text-nuit-800">
                        Votre numéro WhatsApp
                      </label>
                      <input
                        id="champ-tel"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        aria-invalid={!!erreurTel}
                        aria-describedby={erreurTel ? 'erreur-tel aide-tel' : 'aide-tel'}
                        className={`min-h-11 w-full border bg-white px-3 py-2.5 font-mono text-base outline-none transition ${
                          erreurTel
                            ? 'border-bissap-400 bg-bissap-50'
                            : 'border-[var(--hairline)] focus:border-nuit-400'
                        }`}
                        placeholder="07 08 09 10 11"
                        value={tel}
                        onChange={e => setTel(formaterTelephone(e.target.value))}
                      />
                      <p id="aide-tel" className="mt-1 text-xs text-chaux-600">
                        Le commerçant vous y écrit pour confirmer la commande.
                      </p>
                      {erreurTel && (
                        <p id="erreur-tel" role="alert" className="mt-1 text-xs text-bissap-600">
                          {erreurTel}
                        </p>
                      )}
                    </div>
                    {/* L'ADRESSE DISPARAIT EN RETRAIT, ET C'EST TOUT L'ENJEU.
                        Elle etait OBLIGATOIRE : sans elle le bouton restait
                        gris. Un client qui vient chercher sa commande n'a
                        aucune adresse a donner — il aurait invente n'importe
                        quoi, ou serait parti. */}
                    {modeChoisi === 'livraison' && (
                      <div>
                        <label htmlFor="champ-adresse" className="mb-1 block text-xs font-semibold text-nuit-800">
                          Adresse de livraison
                        </label>
                        <input
                          id="champ-adresse"
                          autoComplete="street-address"
                          className="min-h-11 w-full border border-[var(--hairline)] bg-white px-3 py-2.5 text-base outline-none transition focus:border-nuit-400"
                          placeholder="Quartier, rue, repère"
                          value={adresse}
                          onChange={e => setAdresse(e.target.value)}
                        />
                      </div>
                    )}

                    {/* OU ALLER — LA QUESTION QUE « RETRAIT » POSAIT SANS Y REPONDRE.
                        Le selecteur disait « Vous venez chercher. », et la page
                        ne portait que « Restaurant · Abidjan ». Le client
                        s'engageait a se deplacer sans savoir ou.

                        Affichee ICI et pas en haut de page : c'est au moment de
                        choisir le retrait qu'on se demande si c'est loin. Et
                        hors du selecteur, pour qu'une boutique qui ne fait QUE
                        du retrait — ou le selecteur n'existe pas — la montre
                        aussi.

                        Rien quand le marchand ne l'a pas renseignee : on ne
                        remplace pas une adresse par « sur place ». */}
                    {modeChoisi === 'retrait' && recuperation.adresse && (
                      <div className="border border-dashed border-chaux-300 bg-white px-3 py-2.5">
                        <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-chaux-600">
                          Où venir chercher
                        </p>
                        <p className="mt-1 break-words text-sm leading-relaxed text-nuit-900">
                          {recuperation.adresse}
                        </p>
                      </div>
                    )}

                    {modeChoisi === 'retrait' && (
                      <div>
                        <label
                          htmlFor="heure-retrait"
                          className="mb-1 block text-xs font-semibold text-nuit-800"
                        >
                          Heure de retrait souhaitée
                        </label>
                        <input
                          id="heure-retrait"
                          type="time"
                          className="w-full border border-[var(--hairline)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-nuit-400"
                          value={heureRetrait}
                          onChange={e => setHeureRetrait(e.target.value)}
                        />
                        {/* VIDE VEUT DIRE « DES QUE PRET », et on le dit :
                            un champ facultatif qu'on ne presente pas comme tel
                            se remplit au hasard.

                            ON N'AFFICHE PAS ICI LA PREMIERE HEURE POSSIBLE.
                            La calculer demanderait de lire l'horloge PENDANT
                            le rendu, et une heure figee au chargement se
                            perimerait pendant que le client compose son
                            panier — elle finirait par mentir. Le serveur, lui,
                            la calcule a la seconde ou il refuse, et la nomme
                            dans son message. */}
                        <p className="mt-1 text-xs text-chaux-600">
                          Laissez vide pour « dès que c’est prêt ».
                          {recuperation.preparationMin
                            ? ` Comptez environ ${recuperation.preparationMin} minutes de préparation.`
                            : ''}
                        </p>
                      </div>
                    )}

                    <div>
                      <label htmlFor="champ-instructions" className="mb-1 block text-xs font-semibold text-nuit-800">
                        Instructions <span className="font-normal text-chaux-600">(facultatif)</span>
                      </label>
                      <input
                        id="champ-instructions"
                        className="min-h-11 w-full border border-[var(--hairline)] bg-white px-3 py-2.5 text-base outline-none transition focus:border-nuit-400"
                        value={instructions}
                        onChange={e => setInstructions(e.target.value)}
                      />
                    </div>

                    <button
                      onClick={commander}
                      // Le bouton grise n'est qu'une politesse : c'est le
                      // serveur qui refuse pour de bon. Un onglet reste ouvert
                      // toute la nuit, et un client ne doit pas decouvrir la
                      // fermeture apres avoir tout saisi.
                      disabled={envoi || !ouvert || !nom || !telOk || (modeChoisi === 'livraison' && !adresse)}
                      className={`${classesBouton('action', 'md', 'carree')} w-full`}
                    >
                      {envoi
                        ? 'Envoi…'
                        : !ouvert
                          ? messageHoraire || 'Fermé actuellement'
                          : estMarchandSheets
                            ? 'Envoyer la commande'
                            : 'Commander sur WhatsApp'}
                    </button>

                    {/* CE QUI MANQUE, NOMME.
                        Ce fichier s'interdit lui-meme le defaut trois cents
                        lignes plus haut : « un bouton grise sans explication
                        passe pour une panne ». Seul le telephone avait son
                        message ; un client qui oubliait l'adresse voyait un
                        bouton mort et rien d'autre. */}
                    {ouvert && !envoi
                      && (!nom || !telOk || (modeChoisi === 'livraison' && !adresse)) && (
                      <p className="mt-2 text-xs text-chaux-600">
                        Il manque&nbsp;:{' '}
                        {[
                          !nom && 'votre nom',
                          !telOk && 'votre numéro',
                          // En retrait, l'adresse n'est ni demandee ni
                          // reclamee : la nommer ici renverrait le client
                          // chercher un champ qui n'existe pas a l'ecran.
                          modeChoisi === 'livraison' && !adresse && 'votre adresse',
                        ]
                          .filter(Boolean)
                          .join(', ')}
                        .
                      </p>
                    )}

                    {/* CE QUI EST ENREGISTRE AVANT L'ENVOI, DIT LA OU IL L'EST.
                        Des qu'un numero valide est saisi, il part avec le
                        panier pour mesurer les commandes interrompues — avant
                        que le client ait appuye sur quoi que ce soit. La
                        politique de confidentialite le decrit, mais personne
                        ne la lit avant de commander : l'information doit etre
                        au moment de la collecte, pas dans un document.

                        La mention n'apparait que la ou la mesure existe
                        (`estMarchandSheets`) : l'afficher ailleurs annoncerait
                        un enregistrement qui n'a pas lieu.

                        Le lien mene a la politique et non a « Vos donnees » :
                        cet ecran-la demande une reference de commande, que
                        n'a pas celui qui n'a pas encore commande. */}
                    {estMarchandSheets && (
                      <div className="text-xs leading-relaxed text-chaux-600">
                        <p>
                          Votre numéro et votre panier sont enregistrés dès la saisie, pour mesurer
                          les commandes interrompues. Ils sont supprimés au bout de{' '}
                          {JOURS_PANIER_ABANDONNE} jours si vous ne commandez pas.
                        </p>
                        {/* Sur sa propre ligne : dans le fil du texte, ses 44 px de
                            haut ecartaient la derniere ligne du paragraphe. */}
                        <Link
                          href="/legal/confidentialite"
                          className="inline-flex min-h-11 items-center font-medium text-nuit-800 underline decoration-chaux-300 underline-offset-4 transition hover:decoration-nuit-800"
                        >
                          Politique de confidentialité
                        </Link>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* Barre mobile : le ticket est hors écran, le total doit rester visible.

          ELLE S'EFFACE QUAND LE TICKET EST A L'ECRAN. Elle restait posee sous
          « Envoyer la commande » : meme rouge, meme largeur, et un geste qui
          ne menait nulle part puisqu'on y etait deja. Un client presse
          touchait le bouton du bas, croyait avoir commande et s'en allait.
          Un seul bouton rouge pleine largeur a la fois. */}
      {articles > 0 && !ticketVisible && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--hairline)] bg-chaux-50 p-3 lg:hidden">
          {/* SUR TELEPHONE, CETTE BARRE EST TOUT CE QUE LE CLIENT VOIT du
              panier : le ticket est hors ecran. Un objectif qui n'apparaitrait
              que dans le ticket ne servirait donc qu'aux clients sur
              ordinateur -- c'est-a-dire presque personne ici. */}
          {objectif && (
            <p
              className={`mb-2 px-1 text-xs font-semibold ${
                objectif.type === 'minimum' ? 'text-mangue-700' : 'text-chaux-600'
              }`}
            >
              {phraseObjectif(objectif)}
            </p>
          )}
          <button
            onClick={() => commandeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={`${classesBouton('action', 'md', 'carree')} w-full justify-between`}
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              {articles} article{articles > 1 ? 's' : ''}
            </span>
            <span className="font-mono font-bold">{fcfa(total)} FCFA</span>
          </button>
        </div>
      )}
    </div>
  );
}
