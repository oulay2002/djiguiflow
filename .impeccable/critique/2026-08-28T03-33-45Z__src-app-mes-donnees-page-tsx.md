---
target: src/app/mes-donnees/page.tsx
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-28T03-33-45Z
slug: src-app-mes-donnees-page-tsx
---
Method: dual-agent (A : revue de design isolée · B : détecteur + preuves navigateur isolées). Seconde passe, après cinq passes d'amélioration. Les trois constats les plus lourds ont été vérifiés à la source avant relais.

## Note de santé du design

| # | Heuristique | Note | Constat principal |
|---|---|---|---|
| 1 | Visibilité de l'état | 3 | Deux états terminaux sur quatre changent toute la page sans déplacer le focus. |
| 2 | Correspondance au monde réel | 3 | Vocabulaire de registre jamais expliqué là où il apparaît. |
| 3 | Contrôle et liberté | 3 | « Déjà effacé » est un cul-de-sac ; aucun chemin de rectification. |
| 4 | Cohérence et standards | 2 | Trois opacités de filet inventées, aucune ombre, aucun motif papier ; `ApresEffacement` écrit « commande(s) ». |
| 5 | Prévention de l'erreur | 3 | Verrou par `ref`, clés distinctes, `confirme:true`. Le bouton désactivé ne dit pas ce qui manque. |
| 6 | Reconnaître plutôt que rappeler | 2 | Libellés de compteur définis ~1 500 px plus bas ; deux listes non concordantes de « ce qui reste ». |
| 7 | Souplesse et efficacité | 3 | Aucune copie ni export : le droit d'accès s'arrête à l'écran. |
| 8 | Esthétique et minimalisme | 2 | Quatre rectangles plats ; registre en prose monospace. |
| 9 | Diagnostic et récupération | 2 | La réécriture du message d'échec avale le 429 et le 503. |
| 10 | Aide et documentation | 3 | Aide de champ exemplaire ; aucun contact ni recours. |
| **Total** | | **26/40** | **Acceptable** — fondations solides, finitions à reprendre |

Progression 18 → 26. Les deux notes qui n'ont pas bougé, cohérence et esthétique, sont celles que la passe `typeset` prétendait traiter.

## Charge cognitive

6 échecs sur 8 → bande critique (5 sur 8 à la première passe). Le repliage a réduit la hauteur, pas la charge : il cache finalité et destinataires mais laisse visible le champ le plus long. Hauteurs de résumé avec les vraies données : 112, 64, 48, 96, 64, 48, 116, 80 px ; le registre « replié » fait ~800 px.

## Verdict de spécificité

La voix appartient à DjiguiFlow, la matière n'appartient à personne.

Authentique : le refus de demander le numéro et son explication à l'écran ; « les 4 derniers chiffres du numéro qui a commandé, même si ce n'est pas le vôtre » ; `porteeDuGeste` ; la souche « hors de portée » qui nomme WhatsApp et le carnet du marchand.

Générique : zéro matière. Mesuré — `boxShadow: none` sur toutes les sections, `.tear` 0, `.perf-line` 0, `.souche` 0, `.soft-shadow` 1. DESIGN.md pose l'ombre douce comme permanente ; `/suivi` porte bandeau indigo, `.tear`, deux `.perf-line` et `soft-shadow`. Trois filets inventés (`nuit-900/12`, `/10`, `/20`) là où `var(--hairline)` est le jeton.

Scan déterministe : 0 défaut, sortie 0 — troisième fois de suite. Prouvé plutôt que supposé : avertissement sur chemin bidon, sortie 2 avec deux défauts sur les fichiers frères (`legal:75`, `onboarding:153`). Le fichier cible ne contient aucune classe `text-[…]`.

Superpositions navigateur : injection réussie (bundle tiré par le contexte `request` pour contourner la CSP, serveur d'overlay arrêté et port vérifié fermé). Un seul résultat réel : `line-length`, 86 à 98 signes par ligne à 1280 px, sur le chapeau, deux avertissements mangue et deux items de liste — un seul paragraphe avait été borné au typeset. Écartés avec preuve : `gradient-text` (aucun `background-clip: text` rendu ni en source), `cramped-padding` (lit le padding en ignorant `min-height: 44px`), `cream-palette` et `overused-font` (visent `<body>`, donc `layout.tsx`).

## Impression d'ensemble

L'écran a gagné son mécanisme et perdu de vue sa matière. Les deux défauts les plus graves de cette passe sont dans du code que les cinq passes précédentes ont écrit ou traversé sans le voir.

## Ce qui fonctionne

1. La porte explique sa propre exigence, et l'aide de champ ajoute au lieu de répéter.
2. `porteeDuGeste` : une confirmation qui ne décrit pas votre dossier n'est qu'un second clic ; « rien à effacer aujourd'hui » est traité comme un droit exercé.
3. Le verrou physique du double toucher, écrit contre la réalité de l'appareil.

## Défauts prioritaires

### [P0] Un second effacement affiche un faux échec

`page.tsx:290` · `api/mes-donnees/effacement/route.ts:62-64` — vérifié à la source. La route renvoie `{ ok: true, dejaEfface: true, horsDePortee }` sans `bilan` ; le client teste `if (res.ok && corps?.bilan)` et tombe dans la branche d'échec : « L'effacement n'a pas abouti. » sous un `role="alert"`. Or rouvrir le lien gardé dans son message est le geste le plus probable après un effacement — la route de consultation l'a explicitement prévu (`9c4c732`). C'est le seul endroit de l'écran qui ment. Correctif : traiter `dejaEfface === true` comme un succès et rendre le panneau vert.

### [P0] Le registre rend des phrases en monospace — calibrage faux

`page.tsx:704-717` · `donneesPersonnelles.ts` — dix chaînes mesurées. Le champ `conservation` ne contient pas des durées mais des phrases : 147, 116, 115, 60, 57, 48, 36, 27, 26 et 21 signes ; quatre sur dix dépassent 100. Le `min-w-0` avait été calibré contre « 3 ans après la dernière commande », valeur qui n'existe pas dans l'inventaire. DESIGN.md : « IBM Plex Mono n'est pas une police de code ici ». Correctif : scinder en `duree` court (mono, dans le résumé) et phrase explicative (corps déplié) ; le registre replié tiendrait en ~400 px au lieu de 800.

### [P1] La réécriture du message d'échec avale le 429 et le 503

`page.tsx:517-528`, reproduit en direct avec un vrai 429. Le texte du serveur n'est jamais rendu : la personne lit « Saisissez la référence de votre commande » alors que le champ la contient déjà, pré-remplie depuis l'URL. Le budget de 20 appels par 10 minutes étant par adresse, et les opérateurs d'ici partageant massivement leurs IP, ce message envoie consommer un second appel du budget du quartier pour rien. Correctif : ne réécrire que sur 404 ; sur 429 et 503, afficher le message du serveur et le délai de `Retry-After`.

### [P1] L'écran d'après-effacement est le plus faible, et c'est la dernière image

`page.tsx:914-942` — vérifié. « commande(s) », « panier(s) supprimé(s) », « trace(s) » : le gabarit interdit à la ligne 98 du même fichier, et l'affichage inconditionnel d'un zéro interdit à la ligne 96 — deux règles écrites dans la docstring de `porteeDuGeste` trente lignes plus haut. S'y ajoutent : aucun focus déplacé, `refusEnregistres` jamais montré, aucune action suivante, catalogue des traitements payé sur le réseau et non rendu. Règle du pic-fin : on sort d'un acte définitif sur une liste à parenthèses.

### [P2] La section de synthèse n'a ni titre, ni tuile, ni explication

`page.tsx:548-577`. Aucun `h2` : la navigation par titres saute par-dessus les quatre compteurs. Ni surface ni séparateur — à 1280 px un libellé et le chiffre voisin se lisent comme un seul bloc. « 1 RELANCES REÇUES » : pluriel sur un singulier. C'est aussi là que se joue le débordement à 200 %, mal attribué au typeset : les intitulés en capitales à `0.12em` réclament 189 px (« Commandes ») dans une colonne de 94 — document à 382 px pour 345 en dossier, 356 à la porte.

## Signaux par persona

**Casey (mobile, distrait).** Huit blocs de gris monospace qui ressemblent à des conditions générales ; le chevron de 16 px à droite d'un paragraphe de cinq lignes est une décoration, pas une invitation. Puis : il tape sa référence, ignore le second champ, touche le bouton rose pâle — rien ne se passe et rien ne dit pourquoi.

**Sam (lecteur d'écran, basse vision).** « Déjà effacé » et « après effacement » changent toute la page en silence. `document.title` annonce « DjiguiFlow — vos commandes tournent sans vous » : un slogan commercial à l'ouverture d'un écran de droits, faute de `metadata` sur cette route. Le bouton principal désactivé, état d'accueil, mesure ≈ 2,6 : 1.

**Le client d'Abidjan.** Le titre et le chapeau n'emploient aucun mot qu'il chercherait ; rien ne le raccroche à la boutique ni à sa commande. Puis le 429 réécrit lui fait retaper une référence déjà présente et brûler un second appel du budget partagé.

## Mesures déterministes

Contraste : aucun échec, le plus bas mesuré est 5,73 : 1 (composition peinte sur canvas, seule méthode juste sous un `bg-white/70`). Cibles : 11 sur 13 passent ; échecs = lien d'évitement (40 px focalisé) et « Lire la politique de confidentialité » (18 px), quand l'ancre voisine porte `min-h-11`. Largeurs : rien ne déborde à 360, 320 ni 1280 ; à 200 % de texte, porte +11 px, dossier +37 px. Poids : 5 fichiers de fonte, 99,1 Kio, latin uniquement. Une seule erreur console, l'`eval()` de React en développement, identique sur `/legal` et `/suivi`.

## Observations mineures

- La mangue porte deux sens : un fait permanent et un état transitoire. DESIGN.md la réserve à « commencé, pas fini ».
- `variante="fantome"` sur bissap-50 : `hover:bg-nuit-50` pose un rectangle bleu-lavande froid sur le rose — indigo en surface d'accent, interdit.
- Deux réponses non concordantes à « ce que l'effacement n'atteint pas », à 900 px de distance : le principe 3 de PRODUCT.md enfreint au niveau du contenu.
- `ShieldCheck` dans un `h2` en `items-center` : l'icône flotte et indente le titre dès qu'il passe sur deux lignes.
- Le chapeau contredit l'état « déjà effacé ».
- Aucun export, aucune copie du dossier, aucun contact de rectification.

## Questions à considérer

1. Les trois traitements « conservé même après un effacement » sont la réponse à la seule question qui engage la décision. Pourquoi sont-ils dispersés dans une liste de huit, en 12 px, plutôt que d'être le contenu du bloc « Ce que cet effacement ne peut pas atteindre » ?
2. Le fichier interdit ligne 98 le gabarit « commande(s) » et ligne 96 l'affichage d'un zéro, puis commet les deux ligne 923. Qu'est-ce qui fait qu'une règle est écrite dans un fichier sans être appliquée huit cents lignes plus bas ?
3. `traitementsDuClient()` ne prend aucun argument : le catalogue est identique pour tout le monde. Pourquoi cette partie universelle n'est-elle pas lisible sans preuve, sur la page de politique ?
