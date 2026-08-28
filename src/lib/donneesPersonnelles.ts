/**
 * L'inventaire de ce que la plateforme détient sur une personne.
 *
 * ── POURQUOI UN SEUL FICHIER POUR TROIS CHOSES ─────────────────────────────
 *
 * Cet inventaire alimente trois usages qui doivent dire la MÊME chose :
 *
 *   1. l'écran des droits — ce qu'on montre au client qui demande à voir ;
 *   2. l'effacement       — ce qu'on retire quand il le demande ;
 *   3. le registre        — le document que le régulateur lit.
 *
 * Recopiés dans trois endroits, ils divergeraient, et la divergence serait
 * invisible : le registre annoncerait une donnée que l'effacement ne retire
 * pas, ou l'écran en montrerait une que le registre ne déclare pas. C'est le
 * motif qu'on paie sans cesse ici — deux copies d'une même règle finissent
 * toujours par se contredire en silence.
 *
 * ── LA RÈGLE QUI TIENT L'ENSEMBLE ──────────────────────────────────────────
 *
 * TOUT CE QUE L'ÉCRAN MONTRE, L'EFFACEMENT DOIT POUVOIR L'ATTEINDRE.
 *
 * Sans quoi on documente proprement une donnée dont on ne sait pas se
 * séparer — le pire des deux mondes : on prouve qu'on la détient, et on prouve
 * qu'on ne peut pas l'effacer. Un test fige cette correspondance.
 *
 * ── CE QUI EST HORS DE PORTÉE EST DÉCLARÉ AUSSI ────────────────────────────
 *
 * Voir `HORS_DE_PORTEE`. Taire ce qu'on ne peut pas effacer serait la seule
 * faute vraiment grave de ce fichier : une personne croirait ses données
 * parties alors qu'une copie subsiste ailleurs.
 */

/**
 * La date de dernière revue de l'inventaire, à la main.
 *
 * ELLE NE SE CALCULE PAS. Une date automatique — celle du build, celle du jour —
 * dirait « revu aujourd'hui » chaque fois qu'on déploie autre chose, et ce
 * serait un mensonge sur la seule ligne d'un registre qui engage. On la change
 * en même temps qu'on change les traitements, jamais autrement.
 */
export const REGISTRE_MIS_A_JOUR = '28 août 2026';

/** Qui la donnée concerne. Le registre les sépare, l'écran ne montre que `client`. */
export type Personne = 'client' | 'marchand' | 'livreur';

/**
 * Ce que devient un traitement quand la personne demande l'effacement.
 *
 * - `anonymise` : la ligne reste, la personne en sort. C'est le cas des
 *   commandes — elles sont aussi la comptabilité du marchand.
 * - `supprime`  : la ligne part entièrement.
 * - `garde`     : on ne touche pas, et il faut une raison écrite dans
 *   `pourquoi`. Sans justification obligatoire, « garde » deviendrait la
 *   valeur commode qu'on pose sans y penser.
 */
export type Sort = 'anonymise' | 'supprime' | 'garde';

export type Traitement = {
  /** Identifiant stable : c'est lui que l'effacement et les tests désignent. */
  cle: string;
  nom: string;
  concerne: Personne[];
  /** Où la donnée vit réellement, en clair. */
  ou: string;
  /** Les données, dites comme on les dirait à la personne — pas des noms de colonnes. */
  donnees: string[];
  finalite: string;
  /**
   * La durée, en deux ou trois mots — de quoi la LIRE EN COLONNE.
   *
   * POURQUOI CE CHAMP EXISTE, ALORS QUE `conservation` DIT DÉJÀ LA DURÉE.
   * Parce que `conservation` est une phrase, et que quatre d'entre elles
   * dépassent cent signes — jusqu'à 147. L'écran des droits les affichait en
   * monospace, au nom de « la règle du chiffre en mono », et rendait donc de
   * la prose en police de code : huit résumés de 48 à 116 px de haut, un
   * registre « replié » de 800 px. DESIGN.md dit pourtant que « IBM Plex Mono
   * n'est pas une police de code ici ».
   *
   * Ce champ porte ce que la règle visait réellement : une valeur que l'œil
   * compare d'une ligne à l'autre. `conservation` garde l'explication, et
   * n'est pas modifiée — le registre de l'admin et les documents juridiques
   * la citent telle quelle.
   *
   * Court veut dire COURT : au-delà d'une vingtaine de signes, la colonne
   * cesse de se lire et le résumé redevient un paragraphe.
   */
  duree: string;
  conservation: string;
  /** Qui d'autre y a accès. Un hébergeur en est un. */
  destinataires: string[];
  effacement: Sort;
  /** Obligatoire dès que `effacement` vaut `garde`. */
  pourquoi?: string;
};

/**
 * Les traitements, dans l'ordre où ils comptent pour une personne.
 *
 * Les entrées `marchand` et `livreur` ne s'affichent pas sur l'écran des
 * droits — un marchand a son compte, un livreur son espace — mais elles
 * DOIVENT figurer ici : un registre qui ne déclare que les clients est un
 * registre faux.
 */
export const TRAITEMENTS: Traitement[] = [
  {
    cle: 'commandes',
    nom: 'Vos commandes',
    concerne: ['client'],
    ou: 'Base de données (table « commandes » et son détail d’articles)',
    donnees: [
      'votre nom',
      'votre numéro de téléphone',
      'votre adresse de livraison, et vos instructions éventuelles',
      'votre identifiant WhatsApp ou Telegram',
      'les articles commandés et le montant',
      'votre position GPS, uniquement si vous l’avez partagée',
      'l’heure de retrait, si vous venez chercher la commande',
    ],
    finalite: 'Préparer votre commande, vous la livrer, et vous permettre de la suivre.',
    duree: '12 mois',
    conservation:
      '12 mois après la fin de la commande, puis votre identité est effacée. '
      + 'Le montant et la date restent, sans vous : c’est la comptabilité du marchand. '
      + 'Votre position GPS, elle, part bien plus tôt — 30 jours après la fin de la '
      + 'commande — car elle ne sert qu’à trouver votre porte le jour de la livraison. '
      + 'Votre adresse écrite, elle, reste jusqu’aux 12 mois.',
    // Google Sheets figurait ici jusqu'au 28 août 2026 : une copie complète de
    // chaque commande partait dans un tableur, avec le nom, le téléphone et
    // l'adresse. L'écriture est débranchée et les colonnes supprimées — voir
    // le bloc au-dessus de `journaux_techniques`.
    destinataires: [
      'le marchand chez qui vous avez commandé',
      'le livreur qui prend votre commande en charge',
      'Supabase (hébergeur de la base) et le serveur d’automatisation',
    ],
    effacement: 'anonymise',
  },
  {
    cle: 'paniers',
    nom: 'Vos paniers non validés',
    concerne: ['client'],
    ou: 'Base de données (table « paniers »)',
    donnees: ['votre nom', 'votre numéro de téléphone', 'les articles que vous aviez choisis'],
    finalite:
      'Reprendre une commande interrompue, et permettre au marchand de mesurer '
      + 'combien de paniers n’aboutissent pas.',
    duree: '30 jours',
    conservation: '30 jours, puis suppression complète.',
    destinataires: ['le marchand concerné', 'Supabase (hébergeur de la base)'],
    effacement: 'supprime',
  },
  {
    cle: 'relances',
    nom: 'Les relances qui vous ont été envoyées',
    concerne: ['client'],
    ou: 'Base de données (table « relances_envoyees »)',
    donnees: ['votre numéro de téléphone', 'la boutique, le canal, la date et le motif'],
    finalite:
      'Tenir la règle « une relance par personne et par mois ». Sans cette trace, '
      + 'on vous relancerait à nouveau faute de se souvenir de l’avoir déjà fait.',
    duree: '90 jours',
    conservation: '90 jours, puis suppression.',
    destinataires: ['le marchand concerné', 'Supabase (hébergeur de la base)'],
    effacement: 'supprime',
  },
  {
    cle: 'avis_livraison',
    nom: 'Votre appréciation d’une livraison',
    concerne: ['client'],
    ou: 'Base de données (table « livraisons »)',
    donnees: ['la note que vous avez donnée', 'le commentaire que vous avez écrit'],
    finalite: 'Permettre au marchand de suivre la qualité du service de livraison.',
    duree: 'Avec la livraison',
    conservation:
      'Aussi longtemps que la livraison, dont elle fait partie. Le commentaire '
      + 'est retiré en même temps que votre identité.',
    destinataires: ['le marchand concerné', 'Supabase (hébergeur de la base)'],
    effacement: 'supprime',
  },
  {
    cle: 'refus_demarchage',
    nom: 'Votre refus d’être démarché',
    concerne: ['client'],
    ou: 'Base de données (table « relances_stop »)',
    donnees: ['votre numéro de téléphone', 'la boutique et la date du refus'],
    finalite: 'Ne plus jamais vous envoyer de relance commerciale.',
    duree: 'Sans limite',
    conservation: 'Sans limite de durée, tant que le refus doit être honoré.',
    destinataires: ['le marchand concerné', 'Supabase (hébergeur de la base)'],
    effacement: 'garde',
    pourquoi:
      'Effacer ce refus le retournerait contre vous : plus rien n’empêcherait '
      + 'de vous démarcher à nouveau, et vous devriez redemander ce que vous aviez '
      + 'déjà demandé. On n’y garde que votre numéro et une date — le strict '
      + 'nécessaire pour tenir parole.',
  },
  {
    cle: 'demandes_droits',
    nom: 'Vos demandes d’accès et d’effacement',
    concerne: ['client'],
    ou: 'Base de données (table « demandes_droits »)',
    donnees: ['votre numéro de téléphone', 'la nature de la demande et sa date'],
    finalite: 'Pouvoir prouver, plus tard, que votre demande a bien été honorée.',
    duree: 'Sans limite',
    conservation: 'Sans limite de durée.',
    destinataires: ['l’administrateur de la plateforme', 'Supabase (hébergeur de la base)'],
    effacement: 'garde',
    pourquoi:
      'C’est la trace de votre demande elle-même. L’effacer reviendrait à '
      + 'effacer la preuve qu’on vous a obéi.',
  },
  /*
   * LE TRAITEMENT « messages » A DISPARU LE 28 AOÛT 2026, et il faut savoir
   * pourquoi il a existé.
   *
   * Chaque message envoyé à un client — son texte entier, et le numéro auquel
   * il partait — était consigné dans une feuille de calcul Google
   * (« Logs_Envois », 568 lignes). La purge nocturne ne l'atteignait pas : les
   * durées de conservation ne valaient que pour la base.
   *
   * Deux issues étaient possibles : porter la purge jusqu'à la feuille, ou
   * cesser d'y écrire. On a mesuré d'abord — treize nœuds Google Sheets, dont
   * neuf déjà morts, et RIEN qui relise jamais ces colonnes — puis le marchand
   * a confirmé qu'il n'ouvrait pas la feuille. Le journal a donc été débranché
   * et ses colonnes supprimées, plutôt que d'entretenir un second système de
   * conservation dans un endroit qu'on ne maîtrise pas.
   *
   * Le texte des messages ne vit plus que là où il a toujours vécu : sur le
   * téléphone de la personne et chez WhatsApp ou Telegram — ce que
   * `HORS_DE_PORTEE` dit toujours, parce que c'est toujours vrai.
   */
  {
    cle: 'journaux_techniques',
    nom: 'Journaux techniques',
    concerne: ['client', 'marchand', 'livreur'],
    ou: 'Journaux de l’hébergeur du site (Vercel) et du serveur d’automatisation',
    donnees: [
      'votre adresse IP lors d’un accès refusé ou anormal',
      'la date et la nature de l’appel',
    ],
    finalite:
      'Détecter les tentatives d’accès aux commandes d’autrui et les pannes. '
      + 'Ces lignes ne portent pas votre nom.',
    duree: 'Chez l’hébergeur',
    conservation: 'Selon la durée propre à l’hébergeur, hors de notre maîtrise.',
    destinataires: ['Vercel', 'l’hébergeur du serveur d’automatisation'],
    effacement: 'garde',
    pourquoi:
      'Ces journaux ne sont pas indexés par votre numéro : on ne peut pas y '
      + 'retrouver vos lignes sans les parcourir toutes. Ils ne portent pas votre '
      + 'identité et s’effacent d’eux-mêmes selon la durée de l’hébergeur.',
  },
  {
    cle: 'compte_marchand',
    nom: 'Compte marchand et boutique',
    concerne: ['marchand'],
    ou: 'Base de données (« boutiques », « subscriptions », « paiements », « notification_settings », « push_subscriptions »)',
    donnees: [
      'l’adresse e-mail et l’identifiant du compte',
      'le nom, la description et le téléphone de la boutique',
      'les identifiants de connexion aux canaux WhatsApp et Telegram',
      'l’abonnement, les paiements et les préférences de notification',
    ],
    finalite: 'Faire fonctionner la boutique, encaisser l’abonnement, envoyer les alertes.',
    duree: 'Durée du compte',
    conservation: 'Tant que le compte existe.',
    destinataires: [
      'Supabase (hébergeur de la base)',
      'le prestataire de paiement, pour les transactions',
    ],
    effacement: 'garde',
    pourquoi:
      'Un marchand ferme son compte depuis son tableau de bord, pas par cet '
      + 'écran, qui ne sert que les clients.',
  },
  {
    cle: 'livreurs',
    nom: 'Fiche livreur',
    concerne: ['livreur'],
    ou: 'Base de données (« livreurs », « livraisons »)',
    donnees: [
      'le nom, le téléphone et l’e-mail éventuel',
      'le véhicule et son immatriculation',
      'la position GPS pendant une course',
      'les livraisons effectuées et la rémunération associée',
    ],
    finalite: 'Affecter les livraisons, suivre la course, calculer la rémunération.',
    duree: 'Durée du rattachement',
    conservation: 'Tant que le livreur est rattaché à une boutique.',
    destinataires: ['le marchand qui l’emploie', 'Supabase (hébergeur de la base)'],
    effacement: 'garde',
    pourquoi:
      'Un livreur est rattaché par son marchand : sa fiche se retire auprès de '
      + 'lui, pas par cet écran.',
  },
];

/**
 * Ce que l'effacement NE PEUT PAS atteindre — et il faut le dire.
 *
 * ── POURQUOI CETTE LISTE EST LA PARTIE LA PLUS IMPORTANTE DU FICHIER ───────
 *
 * Une personne qui clique « effacer mes données » et à qui l'on répond
 * « c'est fait » croit que tout est parti. Si une copie subsiste ailleurs,
 * on ne lui a pas rendu service : on lui a menti proprement. Ces limites
 * s'affichent donc SUR L'ÉCRAN, avant le bouton, et pas seulement ici.
 */
export const HORS_DE_PORTEE: { quoi: string; pourquoi: string }[] = [
  {
    quoi: 'Les messages déjà reçus sur votre WhatsApp ou votre Telegram',
    pourquoi:
      'Ils sont sur votre téléphone et sur les serveurs de la messagerie. '
      + 'Vous seul pouvez les y supprimer.',
  },
  /*
   * DEUX LIMITES ONT ÉTÉ RETIRÉES LE 28 AOÛT 2026 — parce qu'elles ont cessé
   * d'exister, et c'est la bonne façon de faire disparaître une limite.
   *
   * On avouait ici que la copie des commandes et le journal des messages
   * vivaient dans une feuille de calcul Google, avec nom, téléphone et adresse,
   * hors de portée de tout effacement. Plutôt que de mieux le formuler, on a
   * débranché l'écriture et supprimé quarante-quatre colonnes d'identité dans
   * le classeur.
   *
   * Une limite qu'on explique bien reste une limite ; celle-ci n'est plus là.
   */
  {
    quoi: 'Les sauvegardes des jours précédents',
    pourquoi:
      'La base est sauvegardée chaque nuit. Vos données disparaissent des '
      + 'sauvegardes à mesure que celles-ci sont remplacées ; elles ne servent '
      + 'qu’à remettre la plateforme en marche après une panne.',
  },
];

/** Les traitements qu'un client peut voir sur l'écran des droits. */
export function traitementsDuClient(): Traitement[] {
  return TRAITEMENTS.filter((t) => t.concerne.includes('client'));
}

/**
 * Les clés que l'effacement doit traiter, et le sort attendu de chacune.
 *
 * La route d'effacement s'y adosse : ajouter un traitement client ici sans le
 * traiter là-bas fait échouer un test, plutôt que de laisser une donnée
 * derrière soi sans que personne ne le voie.
 */
export function sortsAttendus(): Record<string, Sort> {
  return Object.fromEntries(traitementsDuClient().map((t) => [t.cle, t.effacement]));
}
