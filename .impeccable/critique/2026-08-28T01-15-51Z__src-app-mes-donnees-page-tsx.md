---
target: src/app/mes-donnees/page.tsx
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
timestamp: 2026-08-28T01-15-51Z
slug: src-app-mes-donnees-page-tsx
---
Method: dual-agent (A : revue de design isolée · B : détecteur + preuves navigateur isolées).

Réserves de provenance : la PR #113 a été fusionnée pendant la critique et HEAD est passé de `droits-des-personnes` à `main` ; le commit `9c4c732` était déjà inclus dans la version lue par les deux passes (vérifié). La passe B a jeté ses premiers relevés, pris sur des onglets de la passe A, et tout repris sur ses propres pages.

## Note de santé du design

| # | Heuristique | Note | Constat principal |
|---|---|---|---|
| 1 | Visibilité de l'état | 2 | L'arrivée par lien magique affiche « Prouvez que c'est bien vous » pendant tout le chargement (`page.tsx:199`). |
| 2 | Correspondance au monde réel | 2 | « Dossier de la personne joignable au », « Paniers non validés », « finalité / destinataires » : vocabulaire de registre. |
| 3 | Contrôle et liberté | 2 | Les états *déjà effacé* et *après effacement* sont des culs-de-sac. |
| 4 | Cohérence et standards | 2 | Diverge de `/suivi` sur trois axes et de DESIGN.md sur cinq règles nommées. |
| 5 | Prévention de l'erreur | 1 | Le bouton d'effacement définitif naît aux mêmes coordonnées que le précédent et hérite du focus. |
| 6 | Reconnaître plutôt que rappeler | 2 | `placeholder="ZH-1042"` enseigne un format de référence qui n'existe pas. |
| 7 | Souplesse et efficacité | 2 | Aucun `<form>`, aucun `onKeyDown` : la touche « OK » du clavier Android ne fait rien. |
| 8 | Esthétique et minimalisme | 1 | 5 097 px, 1 114 mots, 6,9 écrans à 360×740. Les 8 traitements sont dépliés. |
| 9 | Diagnostic et récupération | 1 | Un seul message accuse la référence dans quatre situations distinctes. |
| 10 | Aide et documentation | 3 | Le « pourquoi » est excellent ; aucune voie de recours ni contact. |
| **Total** | | **18/40** | **Insuffisant** — mécanisme à refondre, fond éditorial excellent |

## Charge cognitive

5 échecs sur 8 → bande critique. Échecs : focus unique, découpage, hiérarchie visuelle, mémoire de travail, dévoilement progressif. Réussites : une décision à la fois, ≤4 options par décision.

## Verdict de spécificité

La tête est écrite pour ce produit, le corps est à tout le monde.

Authentique : le refus du formulaire évident expliqué dans l'intérêt du client (`page.tsx:208-213`) ; les limites avant le bouton (`page.tsx:360-372`) ; la justification écrite rendue obligatoire par le type `Sort` (`donneesPersonnelles.ts:52-55`) ; la commande en cours (`page.tsx:374-380`) ; l'état « déjà effacé » (`page.tsx:259-270`).

Interchangeable : aucun vocabulaire de la maison, là où `/suivi` porte bandeau `indigo-weave`, `.perf-line` et référence mono (`suivi/page.tsx:263-320`). `CADRE` (`page.tsx:85`) rend `box-shadow: none` alors que DESIGN.md pose l'ombre douce comme permanente. Panneau « danger zone » importé, avec `text-chaux-600` sur `bg-bissap-50` (`page.tsx:366`).

Scan déterministe : `detect.mjs` sur la cible → **0 défaut, sortie 0**. Comparaison même invocation : 1 défaut sur `legal/page.tsx:75` (`design-system-font-size`, `0.65rem`), 0 sur `suivi/page.tsx`. Le détecteur ne voit aucune des cinq règles nommées manquées — un écran peut passer au vert et manquer cinq règles écrites du projet.

Superpositions navigateur : injection réussie (contournement CSP par injection en ligne), 2 résultats, tous deux écartés. `gradient-text` est faux (0 correspondance `background-clip:text` sur les éléments rendus ; règle Tailwind livrée non appliquée). `cream-palette` est exact comme fait et faux comme défaut : `rgb(238,236,229)` est la chaux, sol de marque assumé.

## Impression d'ensemble

Écran pensé par quelqu'un qui a compris le problème mieux que la plupart des pages de ce type, et assemblé sans regarder ni son voisin ni son propre système visuel. `/suivi` a déjà corrigé, avec commentaire à l'appui, trois des défauts que `/mes-donnees` réintroduit : exigence des quatre chiffres, touche Entrée, `id="contenu"`.

## Ce qui fonctionne

1. Le modèle de preuve, et le fait de l'expliquer (`page.tsx:208-213`) : la contrainte technique convertie en réassurance.
2. Les limites imposées avant le geste (`page.tsx:360-372`, `donneesPersonnelles.ts:280-309`), garanties par le type et non par la discipline.
3. Les deux états que personne ne code jamais : « déjà effacé » (`page.tsx:259-270`) et « commande en cours » (`page.tsx:374-380`).

## Défauts prioritaires

### [P0] Le bouton irréversible naît sous le doigt et hérite du focus

`page.tsx:382-403`. Les deux boutons sont chacun premier enfant d'un `div.mt-5` au même point du flux ; React réutilise le nœud. Vérifié : mêmes coordonnées (`left: 41px`, `height: 44px`) et `document.activeElement` = « Oui, effacer définitivement » après le clic. Un second tap impatient sur Android d'entrée de gamme efface définitivement. Correctif : `key` distinct sur le conteneur de confirmation ; « Annuler » en premier dans le DOM et porteur du focus ; paragraphe intercalé redisant la portée exacte. → `/impeccable harden`

### [P1] La porte, dans ses trois défauts

`page.tsx:244` — `disabled={chargement || !ref.trim()}` n'exige pas les quatre chiffres que le serveur exige toujours ; `/suivi` fait l'inverse (`suivi/page.tsx:319`). `page.tsx:221` — `placeholder="ZH-1042"` ne correspond à aucune des trois familles réelles (`reference.ts:44-46`). `page.tsx:138-140, 199` — la condition `!dossier && !efface` affiche le contrôle d'identité pendant tout le chargement du lien magique, et en cas de jeton expiré accuse une saisie non faite. → `/impeccable clarify` puis `/impeccable harden`

### [P1] Lien d'évitement mort, erreurs muettes, champs trop bas

`page.tsx:174` — `<main>` sans `id`, alors que le gabarit vise `#contenu` (`layout.tsx:150`) ; `/suivi` le porte (`suivi/page.tsx:265`). Paragraphes d'erreur sans `role="alert"` ni `aria-live` (mesuré `null`). Focus éjecté sur `<body>` pendant l'appel. Champs à 38 px et talon à 40 px, sous le plancher de 44 px. → `/impeccable audit`

### [P1] 6,9 écrans et 1 114 mots avant la décision

`page.tsx:320-349`, `page.tsx:296-318`. `scrollHeight = 5 097 px` à 360×740, huit traitements dépliés, `donnees.join(' · ')` jusqu'à 7 items par ligne. Conséquence : les limites placées avant le bouton ne sont jamais lues. Deux titres identiques « Vos commandes » en `h2` et `h3`. Correctif : `<details>` par traitement, `<ul>` pour `donnees`, renommage du `h2`, ancre « Demander l'effacement » sous les compteurs. → `/impeccable distill`

### [P1] L'écran ne parle pas la langue de la maison

`page.tsx:85` ombre douce absente · `page.tsx:418-425` compteurs en `font-display` au lieu du mono, et tuile retournée · h1 30 px / h2 20 px hors barème · `page.tsx:178` jeton `chapeau` contourné par `style`, interligne 1,625 perdue au profit de 1,5 · `page.tsx:366` texte chaux sur fond bissap. S'y ajoute le bouton principal désactivé à l'accueil : contraste mesuré **1,51:1**, seul échec de contraste de la page (le reste : 15,66 · 17,60 · 6,44 · 13,49). → `/impeccable typeset` puis `/impeccable polish`

## Signaux par persona

**Casey (mobile, distraite).** « OK » du clavier Android ne fait rien (0 `<form>`, 0 `onKeyDown` ; `/suivi` gère Entrée sur ses deux champs). Part sans les quatre chiffres, corrige une référence juste. Second tap sur la confirmation, au même pixel.

**Sam (lecteur d'écran, basse vision).** « Aller au contenu » ne mène nulle part. Focus sur `<body>` après validation, erreur sans `role="alert"` : silence total. « Vos commandes » deux fois dans la liste des titres. Focus posé sur « Oui, effacer définitivement » sans annonce. Champs 38 px et tout-en-14 px imposent un zoom qui casse `sm:grid-cols-2`.

**Aïcha (Abidjan, Android d'entrée de gamme, forfait compté, cliente WhatsApp).** Aucun mot qu'elle chercherait dans le titre. Placeholder qui ne ressemble pas à sa référence : abandon à la porte. « Dossier de la personne joignable au » en français administratif, numéro masqué coupé en deux à 360 px. « Paniers non validés : 2 » alors qu'elle a écrit un message. 5 097 px payés. Sortie sur la page de vente aux marchands, pas chez son commerçant.

## Observations mineures

- `demandesAnterieures` collecté, typé, transmis, jamais affiché (`page.tsx:71`, `route.ts:78`) : une demande restée `recue` est invisible, elle sera refaite.
- `Commande.total` et `Commande.statut` transmis et jamais rendus.
- `ApresEffacement` : les `(s)` de pluralisation ; un bilan tout à zéro ressemble à un échec.
- L'état « déjà effacé » contredit le chapeau affiché au-dessus, et n'offre ni recours ni contact.
- Pas de métadonnées propres : `<title>` = slogan d'acquisition marchand ; `robots: noindex` manquant.
- `CADRE` en `border-nuit-900/12` et `bg-white/70` au lieu de `var(--hairline)` et blanc 75 %.
- Une seule erreur console au chargement : `eval()` bloqué par la CSP en développement React. Aucun échec réseau.

## Questions à considérer

1. Pourquoi cet écran demande-t-il une preuve, alors que WhatsApp en est déjà une ?
2. Si le tableur du marchand garde nom, téléphone et adresse hors de portée, le bon geste est-il une meilleure mise en garde ou la suppression du miroir ?
3. L'écran montre le risque de garder ses données, jamais le coût de les effacer.
