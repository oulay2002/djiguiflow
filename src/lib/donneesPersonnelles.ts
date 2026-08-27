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
export const REGISTRE_MIS_A_JOUR = '27 août 2026';

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
    conservation:
      '12 mois après la fin de la commande, puis votre identité est effacée. '
      + 'Le montant et la date restent, sans vous : c’est la comptabilité du marchand.',
    destinataires: [
      'le marchand chez qui vous avez commandé',
      'le livreur qui prend votre commande en charge',
      'Google Sheets — une copie de la commande y est écrite (voir plus bas)',
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
    conservation: 'Sans limite de durée.',
    destinataires: ['l’administrateur de la plateforme', 'Supabase (hébergeur de la base)'],
    effacement: 'garde',
    pourquoi:
      'C’est la trace de votre demande elle-même. L’effacer reviendrait à '
      + 'effacer la preuve qu’on vous a obéi.',
  },
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
  {
    quoi: 'La copie de vos commandes dans la feuille de calcul du marchand',
    pourquoi:
      'Chaque commande est aussi écrite dans un tableur Google que le marchand '
      + 'utilise pour son suivi. Cette copie porte votre nom, votre téléphone et '
      + 'votre adresse. Elle n’est pas effacée par cet écran : demandez-la au '
      + 'marchand, qui en est responsable.',
  },
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
