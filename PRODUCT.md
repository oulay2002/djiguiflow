# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Le marchand, sur son téléphone.** Une boutique ou un restaurant de quartier
en Côte d'Ivoire. Il ouvre `/dashboard` depuis un Android, debout, entre deux
clients, pour voir ses commandes, son stock, ses livreurs et ses chiffres. Il
n'a pas d'ordinateur et n'en aura pas. C'est le public principal.

**Le client final, sur la vitrine.** Il arrive sur `/boutiques/[id]` par un
lien, commande sans créer de compte, et suit sa livraison sur `/suivi`. Il ne
verra jamais le tableau de bord. Beaucoup de clients ne passent même pas par
la vitrine : ils écrivent sur WhatsApp.

**L'admin de la plateforme.** Une seule personne. Provisionne les marchands,
pilote l'ensemble, surveille n8n. Ses besoins n'ont rien à voir avec ceux des
deux autres publics et ne doivent pas contaminer leurs écrans.

**Le livreur n'est pas un public de l'application web.** Il vit dans Telegram :
il reçoit ses courses, accepte, annonce ses frais par boutons. Aucun écran web
ne lui est destiné aujourd'hui — c'est un choix confirmé, pas un oubli.

## Product Purpose

Remplacer le carnet, le téléphone et le calcul de tête d'un commerçant ivoirien
par une chaîne qui tourne toute seule : la commande arrive, le livreur est
alimenté, le paiement est tracé, la note client revient.

Le succès n'est pas « le marchand utilise l'app tous les jours ». C'est qu'il
n'ait plus rien à recompter le soir, et qu'un client qui écrit à 23 h reçoive
une réponse.

## Positioning

**La chaîne complète sans ordinateur.** Commande, livreur, paiement Mobile
Money, note client : toute la boucle tourne alors que le marchand ne possède
qu'un téléphone. Ce n'est pas un outil de plus à ouvrir, c'est le remplacement
du carnet.

Un concurrent peut copier l'assistante IA, la vitrine ou l'annuaire de
livreurs. Il ne peut pas prétendre à la boucle entière sans la construire —
et c'est précisément la partie que le marchand n'a pas les moyens d'assembler
lui-même.

## Operating Context

- **WhatsApp est le lieu de vie**, pas un canal secondaire. Le client y écrit
  en langage normal ; l'assistante lit, confirme et enregistre la commande.
  Contrainte physique : un numéro WhatsApp = une boutique (branchement
  WasenderAPI). Le canal `app` (vitrine), lui, est multi-marchand nativement.
- **Telegram porte les livreurs et les alertes.** Le livreur se rattache à sa
  fiche par un lien d'invitation à usage unique ; Telegram n'expose jamais le
  numéro de ses utilisateurs, donc aucun autre appariement n'est possible.
- **n8n, auto-hébergé sur VPS**, orchestre la chaîne. Supabase tient la base.
  L'application web est à la fois la vitrine, le tableau de bord et le point
  de sortie unique des envois : le jeton d'un marchand ne quitte jamais ce
  serveur.
- **L'heure de référence est celle d'Abidjan** : UTC+0 toute l'année, sans
  heure d'été. Aucune conversion, donc aucune erreur de conversion.
- Le registre Marchands a **quitté Google Sheets pour Supabase**, mais une
  indirection slug → uuid subsiste dans `src/lib/boutiques.ts`. Le dossier
  v10.3, qui présente Google Sheets comme « le moteur interne », décrit un
  état dépassé.

## Capabilities and Constraints

**Facturation au volume, jamais « illimité ».** Une commande menée jusqu'à la
livraison consomme 37 exécutions n8n (mesuré le 12 août 2026). Le coût marginal
est le poste dominant. Grille : essai 30 jours / 30 commandes (ne se renouvelle
pas), Pro 10 000 FCFA / 300 commandes par mois, Premium au-dessus. Relever un
plafond est un cadeau ; en introduire un après coup est un reniement.

**Stripe n'est pas une option.** Il n'accepte pas les entreprises établies en
Côte d'Ivoire, et les marchands d'ici n'ont pas de carte. D'où du prépayé par
périodes plutôt que de l'abonnement : aucun opérateur Mobile Money local
n'offre de mandat de prélèvement récurrent fiable.

**Décision ouverte — l'encaissement Mobile Money n'est pas opérationnel.**
`api-checkout.cinetpay.com` répond NXDOMAIN ; l'hôte `api.cinetpay.net` existe
mais n'expose aucune route de vérification connue. GeniusPay est l'alternative
étudiée. Tant que ce n'est pas tranché, un paiement non vérifiable reste EN
ATTENTE et jamais « échoué » : confondre un indéterminé avec un refus enterre
de l'argent réellement encaissé.

**Règles métier qui ne se négocient pas :**

- Horaires : `NULL` veut dire « toujours ouvert », jamais « fermé ». Le verrou
  vit dans `src/lib/horaires.ts`, seul et sans import, parce qu'il sert au
  navigateur, au serveur et à l'assistante — une règle recopiée finit par
  diverger.
- Stock : `NULL` veut dire « pas de suivi », jamais zéro. La vitrine affiche,
  le serveur décide.
- Frais de livraison : annoncés par le livreur à l'acceptation, jamais ajoutés
  au total. `NULL` ne veut pas dire gratuit.
- Pause boutique : une durée qui expire d'elle-même, jamais un interrupteur —
  un oui/non oublié ferme la boutique une semaine.
- Relances : liste STOP, une relance par client tous les 30 jours, 25 par jour
  maximum. WhatsApp bannit au premier signalement, pas au volume ; perdre le
  canal coûte au marchand bien plus qu'une campagne.
- Un compte peut posséder plusieurs boutiques. Toute requête qui suppose
  l'inverse casse en silence.

**Vocabulaire du produit** (à ne pas traduire en jargon logiciel) : marchand,
gérant, boutique, vitrine, commande, livreur, course, suivi, relance, pause.

## Brand Commitments

Le nom est **DjiguiFlow**. Tout est en français, en FCFA, avec des numéros
normalisés `225…`.

**La voix ne promet que ce qui est mesuré.** La vitrine affiche « 24 h/24 »,
« 0 carnet à recompter », « 1 endroit » — des faits sur le mécanisme. Elle
n'annonce aucun pourcentage de croissance, aucune moyenne, aucun témoignage,
parce que la plateforme ouvre et n'a pas l'historique qui le permettrait. Cette
retenue est un engagement, pas une timidité à corriger : une preuve inventée
coûte plus cher qu'une preuve modeste.

Le ton parle du métier du marchand, pas du logiciel — « chercher qui peut
livrer », « compter au stylo », « courir après les paiements ».

## Evidence on Hand

- **Zahara** — boutique de démonstration. Ses chiffres n'ont aucune valeur
  commerciale et ne doivent jamais être présentés comme un résultat client ;
  les bugs qu'elle révèle, eux, sont réels.
- **Rose MonDE** — second marchand, qui a servi à prouver le multi-tenant.
- **Atelier Témoin** — compte de test pour ouvrir le tableau de bord sans
  compte réel.
- **Aucun témoignage, aucun logo client, aucune métrique d'usage réelle
  n'existe.** Rien de futur ne doit en fabriquer, ni en suggérer par la mise en
  page (bandeau de logos, carrousel d'avis, compteur qui monte).

## Product Principles

1. **Le carnet d'abord, l'app ensuite.** Chaque écran se juge à ce qu'il
   retire au marchand, pas à ce qu'il lui ajoute.
2. **Une valeur absente n'est pas une valeur nulle.** `NULL` en base veut dire
   « on ne sait pas » ; le traduire par zéro, gratuit ou fermé produit des
   pannes que personne ne voit.
3. **La règle vit à un seul endroit.** Recopiée, elle diverge — ça s'est déjà
   payé deux fois.
4. **Ne jamais promettre ce qu'on n'a pas mesuré.** Vaut pour la vitrine comme
   pour les chiffres du tableau de bord.
5. **Le canal du marchand est son gagne-pain.** Tout ce qui risque un
   bannissement WhatsApp passe après tout le reste.

## Accessibility & Inclusion

Trois réalités de terrain, confirmées, qui contraignent chaque écran :

- **Téléphone d'entrée de gamme.** Écran étroit, processeur lent, mémoire
  courte. Pas de page lourde, pas de longue liste non paginée, pas d'animation
  coûteuse.
- **Données mobiles chères, réseau instable.** Chaque image compte, chaque
  requête coûte. La page doit rester utile en 3G et ne pas se vider à la
  première coupure.
- **Consulté debout, en plein travail, une main libre, parfois en plein
  soleil.** Cibles larges, contraste fort, rien qui demande de la précision.
