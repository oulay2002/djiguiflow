---
name: DjiguiFlow
description: Le bon de commande d'un commerçant ivoirien, rendu numérique — teinture indigo, papier chaux, encre bissap.
colors:
  nuit: "#131c3d"
  nuit-profond: "#0c1229"
  nuit-filet: "#364a80"
  chaux: "#eeece5"
  chaux-clair: "#f8f7f3"
  chaux-encre: "#5f5b50"
  bissap: "#c4123f"
  bissap-profond: "#a50e36"
  feuille: "#1f9a70"
  mangue: "#e9a23b"
  filet: "rgba(19, 28, 61, 0.14)"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Trebuchet MS, sans-serif"
    fontSize: "clamp(2.75rem, 7vw, 4.25rem)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Bricolage Grotesque, Trebuchet MS, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3rem)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Bricolage Grotesque, Trebuchet MS, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  chapeau:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "normal"
  body:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
    fontFeature: "ss01, cv01"
  label:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.12em"
  donnee:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
rounded:
  nul: "0"
  champ: "8px"
  tuile: "12px"
  carte: "16px"
  tiroir: "32px"
  pilule: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  bouton-action:
    backgroundColor: "{colors.bissap}"
    textColor: "#ffffff"
    rounded: "{rounded.pilule}"
    padding: "0 20px"
    height: "44px"
  bouton-action-hover:
    backgroundColor: "{colors.bissap-profond}"
    textColor: "#ffffff"
  bouton-calme:
    backgroundColor: "rgba(255, 255, 255, 0.75)"
    textColor: "#1b2750"
    rounded: "{rounded.pilule}"
    padding: "0 20px"
    height: "44px"
  bouton-fantome:
    backgroundColor: "transparent"
    textColor: "#263566"
    rounded: "{rounded.pilule}"
    padding: "0 20px"
    height: "44px"
  bouton-vitrine:
    backgroundColor: "{colors.bissap}"
    textColor: "#ffffff"
    rounded: "{rounded.nul}"
    padding: "0 20px"
    height: "44px"
  carte:
    backgroundColor: "rgba(255, 255, 255, 0.75)"
    textColor: "{colors.nuit}"
    rounded: "{rounded.carte}"
    padding: "16px"
  tuile-stat:
    backgroundColor: "rgba(255, 255, 255, 0.75)"
    typography: "{typography.donnee}"
    textColor: "{colors.nuit-profond}"
    rounded: "{rounded.carte}"
    padding: "16px"
  champ-texte:
    backgroundColor: "#ffffff"
    textColor: "#131c3d"
    rounded: "{rounded.tuile}"
    padding: "12px 16px"
  champ-recherche:
    backgroundColor: "{colors.chaux-clair}"
    textColor: "#1b2750"
    rounded: "{rounded.pilule}"
    padding: "10px 16px 10px 36px"
  etiquette-fait:
    backgroundColor: "#d7f3e2"
    textColor: "#125d49"
    rounded: "{rounded.pilule}"
    padding: "4px 10px"
  etiquette-encours:
    backgroundColor: "#fbe9c8"
    textColor: "#7d4b13"
    rounded: "{rounded.pilule}"
    padding: "4px 10px"
  etiquette-urgent:
    backgroundColor: "#fadde3"
    textColor: "#a50e36"
    rounded: "{rounded.pilule}"
    padding: "4px 10px"
  talon-retour:
    backgroundColor: "rgba(255, 255, 255, 0.8)"
    textColor: "#263566"
    rounded: "0 9999px 9999px 0"
    padding: "8px 20px 8px 16px"
    height: "40px"
---

# Design System: DjiguiFlow

## Overview

**Creative North Star: "Indigo & ticket"**

Deux matières, et rien d'autre. L'**indigo** est la teinture : il tient la
structure, les bandeaux, les surfaces de nuit — l'heure où l'assistante
travaille seule pendant que le marchand dort. Le **ticket** est le papier :
chaux passée au mur, encre qui bave sous le tampon, bord déchiré, ligne de
perforation, talon qu'on arrache. Le produit remplace un carnet à souches ; le
système visuel ne s'en cache pas, il le revendique.

La conséquence pratique, c'est que **la matière décide avant le goût**. Un
élément n'est pas arrondi parce que c'est joli : le tableau de bord est un
outil, ses commandes sont des pilules qu'on touche au pouce ; la vitrine est un
imprimé, elle n'a pas un seul angle arrondi. Une couleur n'est pas choisie
parce qu'elle s'accorde : le bissap dit le prix et l'urgence, la mangue dit
« commencé, pas fini », la feuille dit « livré ». Le lecteur repère l'état
d'une commande à la couleur avant d'avoir lu le mot — c'est le seul repérage
fiable dont il dispose sur un écran de téléphone, en plein soleil, entre deux
clients.

L'indigo n'est jamais une couleur d'accent. Toute sa rampe échoue au plancher
de chromie qui rendrait un accent lisible : c'est une couleur de structure, et
la traiter autrement produit des écrans mous où plus rien ne ressort.

**Key Characteristics:**

- Papier posé sur papier : chaque carte est une feuille physique légèrement soulevée.
- Cinq rôles de couleur, tous empruntés au métier, aucun décoratif.
- Deux silhouettes qui ne se mélangent pas : pilule pour l'outil, angle vif pour l'imprimé.
- Les chiffres sont en monospace, toujours — une donnée s'aligne, elle ne danse pas.
- Cibles de 44 px minimum : le marchand pilote au pouce, debout.

## Colors

Cinq rampes, cinq rôles métier. Aucune n'existe pour faire joli, et aucun écran
n'a le droit d'en introduire une sixième.

### Primary

- **Bissap** (`#c4123f`) : la couleur du prix et de l'action. Le bouton
  principal, le montant à encaisser, l'échec qui demande un geste maintenant,
  l'anneau de focus. C'est le rouge de la fleur d'hibiscus, pas un rouge
  d'alerte système.

### Secondary

- **Indigo de nuit** (`#131c3d`) : la structure. Bandeaux, barre système du
  navigateur, fonds de section, texte courant. C'est aussi la nuit pendant
  laquelle la chaîne tourne sans personne.
- **Indigo profond** (`#0c1229`) : le fond le plus sombre, réservé aux
  surfaces qui portent la trame `.indigo-weave`.

### Tertiary

- **Feuille** (`#1f9a70`) : confirmé, livré, encaissé, disponible. Le vert
  n'annonce jamais une action — il constate un fait accompli.
- **Mangue** (`#e9a23b`) : en cours, en attente, à surveiller. Sert aussi
  d'unique touche chaude sur les surfaces indigo (l'initiale d'une enseigne
  sur fond de nuit).

### Neutral

- **Chaux** (`#eeece5`) : le fond du produit, un mur passé à la chaux. C'est le
  papier sur lequel tout est imprimé.
- **Chaux claire** (`#f8f7f3`) : les surfaces creusées — champs de recherche,
  fonds de bouton secondaire.
- **Chaux encre** (`#5f5b50`) : le texte secondaire, les intitulés, les unités.
  Jamais du gris pur : la chaux est chaude, un gris neutre trahit la matière.
- **Filet** (`rgba(19, 28, 61, 0.14)`) : la séparation par défaut. C'est de
  l'indigo dilué, pas une bordure grise.

### Named Rules

**La règle du vocabulaire clos.** Cinq rampes existent : nuit, chaux, bissap,
feuille, mangue. Un écran qui invente son bleu ou son violet fait perdre au
lecteur le seul repérage fiable qu'il a. La couleur dit où en est la commande.

**La règle du bissap unique.** Un seul bouton bissap par écran. Sa rareté est
ce qui le rend lisible ; deux le réduisent à de la décoration. Sur une surface
indigo, l'action passe en blanc (`bouton-contraste`) — c'est la surface qui
décide, pas le geste.

**La règle de l'indigo structurel.** L'indigo n'accentue rien. Il porte,
il encadre, il fait fond. Un indigo utilisé comme accent est un défaut.

## Typography

**Display Font:** Bricolage Grotesque (avec Trebuchet MS en secours)
**Body Font:** Instrument Sans (avec system-ui en secours)
**Label/Mono Font:** IBM Plex Mono (avec ui-monospace en secours)

**Character:** Bricolage Grotesque est une grotesque à contraste variable, un
peu écrasée, qui a la densité d'un titre imprimé au tampon — elle porte les
titres en `font-extrabold` avec un interlettrage négatif serré. Instrument Sans
tient le texte courant sans se faire remarquer, avec `ss01` et `cv01` activés
sur `body`. IBM Plex Mono n'est pas une police de code ici : c'est la police
des données, celle des chiffres et des heures d'un ticket de caisse.

### Hierarchy

- **Display** (800, `clamp(2.75rem, 7vw, 4.25rem)`, interligne 0.95, `-0.03em`) :
  le titre héros de la vitrine, un par page, souvent contraint à `max-w-[15ch]`.
- **Headline** (800, `2.25rem` → `3rem`, interligne 1.02, `-0.02em`) : les
  titres de section de la vitrine.
- **Title** (700, `1.5rem`, `-0.01em`) : les titres de carte et de bloc. Sa
  déclinaison courte (`1.125rem`, 900) sert aux en-têtes du tableau de bord.
- **Chapeau** (400, `1.0625rem`, interligne 1.625) : le paragraphe qui suit un
  grand titre et porte la promesse de la section. Il n'existe que sur la
  vitrine, toujours contraint à `max-w-lg`, et s'écrit `text-chapeau` — jamais
  une valeur littérale. Ni `1rem`, qui se lit comme du texte courant alors que
  ce paragraphe porte l'argument, ni `1.125rem`, qui crie sur une page dense.
- **Body** (400, `0.875rem`, interligne 1.5) : tout le texte courant. Le
  tableau de bord vit en `0.875rem`, pas en `1rem` : l'écran est étroit et la
  densité compte.
- **Label** (600, `0.75rem`, `0.12em`, capitales) : intitulés de tuile,
  catégories, mentions de service. Toujours en chaux encre.
- **Donnée** (700, `1.875rem`, interligne 1, monospace) : les chiffres. Montants,
  compteurs, heures.

### Named Rules

**La règle du chiffre en mono.** Tout nombre que le marchand compare — un
montant, un compteur, une heure — est en IBM Plex Mono. Une donnée doit
s'aligner d'une tuile à l'autre et ne pas danser quand elle change.

**La règle de l'unité détachée.** L'unité (`FCFA`, `cmd`) est un `<span>` à
part, plus petit et en chaux encre. Collée au nombre, « 29 500 FCFA » se coupe
en deux au milieu du montant sur un écran étroit.

## Layout

Le tableau de bord est une coque à deux états, et la bascule est à `1024px`.
Au-dessus, une barre latérale fixe de `18rem` (`w-72`), translucide, séparée
par un filet. En dessous, elle disparaît au profit d'une barre fixe de `5rem`
posée en bas de l'écran, plus un tiroir en feuille de bas de page
(`rounded-t-[2rem]`, `max-h-[85vh]`, poignée de `1.5rem`).

Cette barre du bas impose une soustraction, pas une addition : les pages
portent `min-h-screen`, donc la classe `.coque-dashboard` réserve `5rem` de
padding **et** retire ces `5rem` du `min-height` (`calc(100dvh - 5rem)`).
Ajouter la marge sans retirer la hauteur donnerait `100vh + 5rem` — chaque
écran, même vide, se terminerait par cinq rem de défilement inutile.

`viewportFit: "cover"` est posé pour que `env(safe-area-inset-bottom)` ait une
valeur non nulle : sans lui, les deux derniers onglets passent sous
l'indicateur d'accueil de l'iPhone et deviennent intouchables.

Le rythme d'espacement suit l'échelle Tailwind par pas de 4 px, avec `16px`
comme respiration intérieure par défaut d'une carte et `20px` pour les
conteneurs de page. Les grilles du tableau de bord sont à deux colonnes sur
mobile (`grid-cols-2`, `gap-2.5`), jamais plus.

### Named Rules

**La règle du pouce.** Toute cible interactive fait au moins 44 px de haut
(`min-h-11`). Le marchand pilote debout, à une main, sans viser.

## Elevation & Depth

**Du papier posé sur du papier.** Chaque carte est une feuille physique
légèrement soulevée, et l'ombre douce est permanente : c'est elle qui dit
« ceci est un bon distinct ». Le système n'est pas plat.

L'ombre est toujours large et très diffuse, jamais dure : `--shadow-soft`
vaut `0 18px 44px rgba(19, 28, 61, 0.1)` — un décalage vertical important, un
flou trois fois plus grand, une opacité faible. Elle est **teintée d'indigo**,
jamais noire ; une ombre neutre sur de la chaux vire au gris sale.

Les surfaces sont translucides (`rgba(255, 255, 255, 0.75)`) sur le fond chaux,
posées sur un filet d'indigo dilué. Le flou d'arrière-plan
(`backdrop-blur-xl`) existe sur la barre latérale, mais il reste l'exception
et ne doit pas se répandre : c'est le poste le plus coûteux à rendre sur un
téléphone d'entrée de gamme.

### Shadow Vocabulary

- **Douce** (`0 18px 44px rgba(19, 28, 61, 0.1)`) : la feuille au repos. Cartes,
  tuiles, panneaux. C'est le défaut.
- **Encre de tampon** (`0 8px 20px -8px rgba(196, 18, 63, 0.8)`) : sous le
  bouton d'action seulement. Elle imite l'encre qui bave sous un tampon appuyé,
  et sa teinte est celle du bouton — jamais une ombre neutre.
- **Bon empilé** (`0 24px 50px rgba(6, 10, 25, 0.4)`) : les tickets de la
  démonstration héros, superposés sur fond indigo. Ombre portée forte parce que
  le fond est sombre.
- **Tiroir** (`0 -20px 60px rgba(12, 18, 41, 0.25)`) : le tiroir de navigation
  mobile, projetée vers le haut.

### Named Rules

**La règle de l'ombre teintée.** Aucune ombre n'est noire. Elle emprunte sa
teinte à l'indigo, ou à la couleur de l'élément qu'elle porte.

## Shapes

Deux silhouettes coexistent, et elles ne se mélangent jamais sur un même écran.

**Le tableau de bord est un outil.** Ses commandes sont des pilules
(`rounded-full`), ses cartes ont des angles franchement adoucis (`16px`), ses
tuiles un peu moins (`12px`), ses champs de saisie encore moins (`8px`). Le
tiroir mobile monte avec un arrondi de `32px`.

**La vitrine est un imprimé.** Bon de commande, carte affichée au mur : elle
n'a pas un seul angle arrondi (`rounded-none`). C'est pour cela que le composant
`Bouton` porte une propriété `forme` séparée de sa `variante` — sans elle,
adoucir la vitrine aurait arrondi tous les écrans du marchand par ricochet.

Quatre motifs portent la métaphore du papier, et ils sont dessinés en CSS, pas
en images :

- **`.tear`** — le bord déchiré : un filet pointillé plus deux encoches rondes
  de 14 px aux extrémités. Les encoches sont de vrais trous : `--tear-bg` doit
  valoir la couleur du fond *derrière* le ticket, sinon elles se voient comme
  des pastilles.
- **`.perf-line`** — la couture entre deux sections : un dégradé répété de 7 px
  d'encre pour 9 px de vide, à 30 % d'opacité.
- **`.stamp`** — le tampon encreur : filet de 1,5 px, arrondi de 3 px,
  interlettrage de `0.2em`, incliné de −5°.
- **`.stub`** — le talon détachable, qui est le bouton « retour ». Bord gauche
  plat et perforé, bord droit arrondi. C'est la **silhouette** qui porte le
  motif, pas des encoches peintes : celles-ci auraient exigé de connaître la
  couleur du fond, qui change d'un écran à l'autre.

### Named Rules

**La règle des deux mondes.** Pilule dans l'outil, angle vif dans l'imprimé.
Un bouton arrondi sur la vitrine, ou un angle vif dans le tableau de bord,
est un défaut — pas une variation.

## Components

### Buttons

Cinq variantes, et chacune porte un rôle du système plutôt qu'une nuance
décorative. Les deux dernières existent parce qu'un bouton bissap jurerait sur
un bandeau coloré.

- **Shape:** pilule dans le tableau de bord (`9999px`), angle vif sur la
  vitrine (`0`). Hauteur minimale `44px` en taille `md`, `36px` en `sm`.
- **Action** (`bissap` sur blanc, ombre d'encre teintée) : le geste principal.
  Un par écran.
- **Calme** (blanc à 75 % sur filet, texte indigo) : les gestes secondaires.
- **Fantôme** (sans surface, texte indigo) : les gestes de service — fermer,
  annuler.
- **Contraste** (blanc plein, texte indigo) : l'action posée sur une surface
  teintée.
- **Voile** (blanc à 15 % sur filet blanc) : le secondaire sur surface teintée.
- **Hover / Focus:** transition de 150 ms, `active:translate-y-px` — le bouton
  s'enfonce comme un tampon. Le focus est un contour bissap de 2 px avec
  `outline-offset: 3px`, défini globalement.
- **Disabled:** opacité 45 % et pas 55 % — au-dessus, le bissap reste trop vif
  pour se lire comme inactif.

### Talon de retour (composant signature)

Dans le monde du bon de commande, on ne « revient » pas — on arrache le talon.
Bord gauche pointillé, bord droit en demi-pilule, fond blanc à 80 %. Au survol
il se décolle : `translateX(-3px)`, le pointillé passe au bissap, l'ombre
s'épaissit, et la flèche recule de 2 px. En `prefers-reduced-motion`, il garde
son changement de couleur et perd son déplacement.

### Étiquettes d'état

- **Style:** pilule, `4px 10px`, `0.75rem` semi-gras, fond clair de la rampe et
  texte foncé de la même rampe.
- **State:** `urgent` bissap, `encours` mangue, `fait` feuille, `neutre` nuit,
  `eteint` chaux. Le jeu complet vit dans `TONS` (`src/components/ui/Etat.tsx`)
  avec quatre facettes par ton : pastille, texte, surface, filet.

### Cards / Containers

- **Corner Style:** `16px` (`rounded-2xl`) pour les cartes, `12px` pour les
  tuiles denses.
- **Background:** blanc à 75 % sur le fond chaux.
- **Shadow Strategy:** « Douce », permanente (voir Elevation & Depth).
- **Border:** un filet de `1px` en indigo dilué (`var(--hairline)`).
- **Internal Padding:** `16px`, `20px` pour un conteneur de page.

### Tuile de comptage

Le chiffre en haut, l'intitulé en dessous — l'inverse de l'habitude, et c'est
délibéré : c'est le chiffre qu'on compare d'une tuile à l'autre, il doit rester
sur la même ligne quelle que soit la longueur de l'intitulé. Nombre en mono
`1.875rem` sur indigo profond, unité détachée en chaux encre, pastille d'icône
de `36px` (`rounded-xl`) teintée par le ton, intitulé en label capitales.

### Inputs / Fields

- **Champ texte:** `12px` d'arrondi, fond blanc, filet `chaux-200`,
  `12px 16px` de padding, texte `0.875rem`.
- **Champ de recherche:** pilule, fond `chaux-clair`, icône à gauche
  (`pl-9`).
- **Focus:** le filet passe en `primary-400` et un anneau de 2 px en
  `primary-100` apparaît. `outline: none` est explicite, remplacé par cet
  anneau.

### Navigation

- **Bureau (`≥1024px`):** barre latérale de `18rem`, blanc à 80 %,
  `backdrop-blur-xl`, filet à droite. Entrées en `rounded-2xl`, `0.875rem`
  semi-gras. L'entrée active porte un dégradé tonal indigo
  (`from-primary-600 to-primary-500`) en texte blanc avec une ombre portée ;
  les autres sont en chaux encre et se teintent en `chaux-100` au survol.
- **Mobile:** barre fixe de `5rem` en bas, plus un tiroir en feuille
  (`rounded-t-[2rem]`) avec grille à deux colonnes et cibles de `3.5rem`.
- **Marque:** carré de `44px` en indigo profond, initiale en Bricolage `font-black`
  mangue — l'enseigne est un tampon, pas un logo.

### Enseigne (composant signature)

Trois cas, dans cet ordre : le logo si le marchand en a déposé un, l'emoji s'il
en a choisi un, l'initiale sinon. Le troisième cas n'est pas une exception :
l'emoji proposé à l'inscription (`🏪`) est le même pour tout le monde, et
l'afficher tel quel revient à coller la même vignette sur chaque boutique. Le
cadre vaut autant que ce qu'il contient — sans lui, l'emoji se lit comme un
caractère au fil du texte. Deux variantes : `jour` (filet + fond chaux) et
`nuit` (filet blanc à 30 % + fond blanc à 8 %).

## Do's and Don'ts

### Do:

- **Do** emprunter la couleur au rôle métier : bissap pour l'action et le prix,
  mangue pour ce qui est commencé, feuille pour ce qui est fait, nuit pour la
  structure, chaux pour l'inactif.
- **Do** mettre tout chiffre comparable en IBM Plex Mono, unité détachée.
- **Do** teinter les ombres d'indigo ou de la couleur de l'élément — jamais de
  noir.
- **Do** garder `44px` de hauteur minimale sur toute cible interactive.
- **Do** utiliser la pilule dans le tableau de bord et l'angle vif sur la
  vitrine, sans jamais croiser les deux.
- **Do** poser `--tear-bg` à la couleur du fond derrière le ticket chaque fois
  qu'on emploie `.tear`, sinon les encoches cessent d'être des trous.
- **Do** prévoir le repli `prefers-reduced-motion` : les animations sont
  coupées, mais les changements de couleur restent.

### Don't:

- **Don't** introduire un dégradé violet-bleu, une tuile d'icône arrondie
  au-dessus de chaque titre, une carte imbriquée dans une carte imbriquée dans
  une carte, ni du texte gris sur fond coloré. Ce sont les quatre marques qui
  trahissent une page générée.
- **Don't** inventer une couleur hors des cinq rampes. Pas de bleu, pas de
  violet, pas de gris neutre — la chaux est chaude et l'indigo dilué remplace
  le gris.
- **Don't** poser deux boutons bissap sur un même écran. Sur une surface
  teintée, l'action passe en blanc.
- **Don't** écrire un champ sans jeton : `rounded-lg border p-2` nu n'appartient
  pas au système. Le filet est `chaux-200`, l'arrondi `12px`, le focus un anneau
  `primary-100`. *(Dérive constatée dans `src/app/dashboard/products/page.tsx` :
  les quatre champs du formulaire d'article, alors que
  `dashboard/customers/page.tsx` respecte les jetons.)*
- **Don't** utiliser l'indigo comme accent. Toute sa rampe échoue au plancher de
  chromie ; c'est une couleur de structure.
- **Don't** répandre `backdrop-blur`. Il est réservé à la barre latérale de
  bureau : c'est le poste le plus coûteux à rendre sur un téléphone d'entrée de
  gamme.
- **Don't** peindre les encoches du talon plutôt que d'en faire une silhouette.
  Une encoche peinte oblige à connaître la couleur du fond, qui change d'un
  écran à l'autre.
