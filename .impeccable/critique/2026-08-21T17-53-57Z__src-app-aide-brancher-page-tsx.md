---
target: src/app/aide/brancher/page.tsx
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-21T17-53-57Z
slug: src-app-aide-brancher-page-tsx
---
⚠️ DEGRADED: single-context (le sous-agent d'évaluation A s'est enlisé à 33 min sans rien produire et a été arrêté ; sa moitié a été refaite en contexte parent APRÈS lecture des mesures de l'évaluation B. La revue de design est donc ancrée par le déterministe. L'évaluation B, elle, a bien tourné en sous-agent isolé.)

## Design Health Score

| # | Heuristique | Note | Point clé |
|---|---|---|---|
| 1 | Visibilité de l'état du système | 2 | 5 400 px, 30 min, aucun indicateur de progression ni marquage d'étape faite |
| 2 | Correspondance système / monde réel | 4 | Vocabulaire du métier. « Le numéro commence par un tiret », jamais « chat ID négatif » |
| 3 | Contrôle et liberté | 1 | Aucun retour, aucun sommaire. 5 liens en tout : 4 ancres + 1 sortie |
| 4 | Cohérence et standards | 4 | Anatomie identique pour les 8 feuillets |
| 5 | Prévention des erreurs | 4 | L'ordre justifié, le tiret, les deux-points, le verrou bloquant |
| 6 | Reconnaissance plutôt que rappel | 2 | Deux numérotations concurrentes ; le jeton à retenir entre l'étape 3 et la 4 |
| 7 | Flexibilité et efficacité | 1 | Rien pour reprendre à l'étape 6 sans refaire défiler les cinq précédentes |
| 8 | Esthétique et minimalisme | 4 | Rien de décoratif ; chaque motif porte une fonction |
| 9 | Récupération d'erreur | 3 | Vraie table de diagnostic, mais ne couvre que 4 étapes sur 8 |
| 10 | Aide et documentation | 2 | C'est LA documentation, et elle n'a aucune issue de secours |
| **Total** | | **27/40** | **Solide — on comprend très bien, on se repère très mal** |

## Design Specificity Verdict

Non transplantable. La métaphore du carnet à souches EST la structure, pas un habillage : la souche porte la vérification, la couture perforée ouvre les actes, le verrou est un feuillet arraché au fond de la page. Retirer le monde visuel ferait perdre le dispositif, pas seulement le décor.

Ce qui manque n'est pas de la spécificité, c'est de la navigabilité.

**Scan déterministe.** 0 relevé sur le fichier cible (exit 0). Les 2 relevés viennent de `globals.css` : `border-radius: 2px` ligne 124 (anneau de focus global) et `3px` ligne 171 (`.stamp`, explicitement documenté dans DESIGN.md). Faux positifs pour cette cible.

**Trouvé par le détecteur / navigateur, et non par la revue :**
- `document.title` = « Brancher sa boutique — DjiguiFlow — DjiguiFlow » (nom en double)
- Les 4 liens « Sinon : étape N » font 18 px de haut (`display:inline`, padding 0)
- L'anneau `:target` déclare 2,2 s mais tombe à 21 % d'opacité à 500 ms et 3 % à 1,1 s
- L'anneau de focus s'estompe sur 150 ms (`transition-colors` inclut `outline-color` en Tailwind v4)

**Sain, mesuré :** 0 débordement aux deux largeurs · 31 paires de contraste, 0 échec, minimum 5,99:1 · plancher 12 px · plan h1→h2→h3 sans saut · 5/5 noms accessibles · `lang="fr"` · 0 erreur console · 341 nœuds DOM, 0 image, 25 Ko de balisage · tabulation = ordre DOM · focus 2 px bissap · repli `reduced-motion` vérifié à l'exécution.

**Superpositions visuelles : aucune.** Serveur de visualisation non lancé, `detect.js` non injecté — aucun calque dans le navigateur de l'utilisateur.

## Overall Impression

Un document remarquablement écrit, posé sur une page qui ne sait pas où on en est. Tout ce qui relève de comprendre est excellent ; tout ce qui relève de se repérer manque. La plus grande occasion est de rendre le document parcourable.

## What's Working

1. **La souche est un vrai dispositif** : elle ne répète pas la consigne, elle donne la preuve. Structurellement portée — pleine largeur, sous le corps, séparée par une perforation.
2. **La prévention est tissée dans la copie aux bons endroits** : l'intro de l'acte 2 dit POURQUOI l'ordre compte, pas seulement qu'il compte.
3. **Les schémas Telegram au lieu de captures** : ne vieillissent pas, lisibles sur écran étroit, disent quoi envoyer et quoi attendre.

## Priority Issues

**[P1] Aucun retour, aucun sommaire.** 5 liens sur toute la page (4 ancres + 1 sortie). Un marchand arrivant par une URL partagée atterrit sur 5 400 px sans porte de sortie ni vue d'ensemble ; celui qui reprend à l'étape 6 refait défiler cinq étapes. Fix : talon `.stub` en haut (`LienRetour` existe déjà) + index des trois actes, ancré. → `/impeccable layout`

**[P1] Le lecteur perd sa place et rien ne la garde.** 30 min annoncées, une main libre, téléphone qui se verrouille. Fix : en-tête d'acte en `position: sticky` (coût de rendu nul) ; version ambitieuse, reprise persistée en `localStorage`. → `/impeccable layout` puis `/impeccable onboard`

**[P1] Deux numérotations concurrentes.** L'étape 5 du guide s'adresse à « Onboarding · étape 3 ». Charge parasite au passage le plus dur. Fix : nommer le champ plutôt que son rang, ou aligner les deux numérotations. → `/impeccable clarify`

**[P2] La commande d'essai ne teste que la moitié.** Ses 4 preuves couvrent les étapes 4, 5, 6, 7. Rien ne teste 1, 2, 3 et 8. Un marchand dont les horaires sont faux passe le test et reçoit des commandes à 3 h du matin. Fix : ajouter les preuves manquantes, ou dire ce qui n'est pas couvert. → `/impeccable clarify`

**[P2] Aucune issue de secours.** Toute l'audience est bloquée, et le pied de page répond « le tableau de bord désigne l'étape ». S'il ne la désigne pas, il n'y a rien. Pas de lien WhatsApp alors que PRODUCT.md en fait le lieu de vie du produit. Fix : une dernière ligne avec un vrai canal. → `/impeccable harden`

## Persona Red Flags

**Jordan (première fois)** : l'étape 3 dit « Gardez-la » d'un jeton de 46 caractères sans dire comment — il le perd et refait `/newbot`. « Onboarding » nomme un écran par un mot anglais dans un produit français, alors que la navigation l'appelle « Branchement ». Bloqué, il n'a personne à qui s'adresser.

**Sam (accessibilité)** : socle bon (focus 2 px bissap 5,99:1, titres sans saut, 5/5 noms accessibles, `lang="fr"`, 0 image, repli `reduced-motion` vérifié). Deux échecs : les 4 liens « Sinon » font 18 px de haut, sous le plancher de 44 px de DESIGN.md, et `display:inline` empêche le padding de les agrandir ; leur anneau de focus (décalage 3 px sur une ligne de 18 px) chevauche la ligne du dessus.

**Marchand, Android d'entrée de gamme, plein soleil, données chères** : poids honnête (341 nœuds, 0 image, 25 Ko de balisage) mais trois familles de police pour 101 Ko sur une page sans image ni script applicatif — premier poste de coût, et IBM Plex Mono ne sert qu'aux localisateurs, compteurs, puces de code et tampon. En plein soleil, la moitié droite du localisateur (chaux encre 12 px, 6,78:1) est le texte le plus petit et le moins contrasté — et c'est celui qui dit OÙ ALLER.

## Minor Observations

- `document.title` répète « DjiguiFlow » deux fois. Correctif d'une ligne.
- La page se termine sur trois mises en garde (règle du pic-fin) : il manque un « voici ce qui se passe maintenant ».
- L'anneau `:target` promet 2,2 s et en tient ~600 ms (l'ease front-load l'effacement).
- L'anneau de focus s'estompe sur 150 ms au lieu d'apparaître net.
- Le 4e lien « Sinon : étape 7 » passe sur deux lignes à 390 px.

## Questions to Consider

- Que voit un marchand qui arrive ici APRÈS avoir tout réussi ? La page ne parle qu'à celui qui échoue.
- Si la commande d'essai est la vraie table de diagnostic, pourquoi est-elle en bas ?
- Le guide numérote 8 étapes, le formulaire en numérote 5. Lequel devrait céder ?
- Qu'est-ce qui prouverait que ce guide fonctionne ? Aucune mesure aujourd'hui.
