# Le client place son point de livraison sur une carte

**Date** : 24 août 2026
**État** : conception validée, non implémentée

---

## Le problème

À Abidjan, l'adresse est un repère, pas une rue. Les vraies adresses en base le
disent : `akouedo`, `akouedo, terrain de basket`, `pharmacie livie`,
`Cocody, Val Doyen`. Le livreur téléphone systématiquement.

Un bouton GPS existe depuis le 17 août sur la page de confirmation. **Il n'a
jamais capturé un seul point.** Mesure du 24 août : `latitude` et `longitude`
sont NULL sur **toutes** les commandes de la base, y compris celles confirmées
le jour même sur cette page.

Deux causes possibles, et il faut les traiter toutes les deux :

1. **Un appui unique ne suffit pas.** Le GPS d'un téléphone donne un point à
   quelques dizaines de mètres. Dans une cour, cela ne désigne pas une porte —
   et le client n'a aucun moyen de corriger.
2. **Le point ne va nulle part.** Même capturé, il mourrait en base :
   `/api/confirmation/position` écrit `latitude`, `longitude`,
   `position_recue_le`, **et s'arrête là**. Aucune notification. Et
   `/api/internal/commandes/fiche`, qui alimente « Acceptation Livraison », ne
   rend **ni latitude ni longitude**.

La seconde cause est la plus grave : sans elle, toute amélioration de la
première serait de la décoration.

---

## La décision antérieure qu'on ne défait pas

**Le géocodage automatique reste écarté.** Décision du 17 août : sur cet
adressage il rend souvent un point faux, et *un point faux est pire que pas de
point* — le livreur lui fait confiance et se perd avec assurance.

Cette conception ne la contredit pas, elle s'appuie dessus. **La différence
tient en un mot : c'est le CLIENT qui place le point.** Personne d'autre ne
sait où est sa porte. On ne devine pas, on lui donne de quoi montrer.

---

## Périmètre

**Dedans** : les commandes prises par l'assistante — WhatsApp et Telegram —
qui reçoivent un lien de confirmation.

**Dehors, et assumé** : les commandes passées depuis la vitrine
(`canal = 'app'`). Elles ne reçoivent aucun lien de confirmation :
`commande-app` n'en fabrique aucun. Elles ne verront donc jamais cette carte.
C'est la conséquence directe du choix d'emplacement, prise en connaissance de
cause.

**Dehors également** : le suivi du livreur en direct. `livreurs.latitude` et
`livreurs.longitude` attendent depuis toujours ; ce n'est pas le sujet ici.

---

## Le trajet du point

```
CLIENT                        NOUS                         LIVREUR
──────                        ────                         ───────
« Je confirme »
    │
    ├─ bouton « Indiquer ma position »        (existe déjà)
    │       │
    │       └─ GPS ──► une IMAGE de carte centrée sur ce point
    │                        │
    ├─ le client fait glisser l'épingle ──────┤
    │                                          │
    └─ « C'est bien ici » ──► POST /api/confirmation/position
                                     │   (existe déjà, INCHANGÉE)
                                     └─► commandes.latitude / longitude
                                                  │
                                                  │  ◄── LE MAILLON MANQUANT
                                                  │
                          /api/internal/commandes/fiche rend le point
                                                  │
                          « Acceptation Livraison » compose un lien Maps
                          sur les COORDONNÉES, non sur le texte
                                                  │
                                                  └────►  « 🚩 Point exact »
                                                          dans le message
                                                          du livreur
```

### Les quatre pièces

| Pièce | État |
|---|---|
| `POST /api/confirmation/position` | existe — **inchangée**. Validation, fenêtre de 24 h, refus des commandes terminées, refus des points absurdes. |
| `pointValide()` et son banc de 24 cas | existe — **réutilisé tel quel**. |
| Le bloc HTML de la page de confirmation | **remplacé** : l'image et l'épingle s'insèrent entre le GPS et l'envoi. |
| `fiche` + « Acceptation Livraison » | **complétés** : le point voyage enfin jusqu'au livreur. |

### Où exactement, dans n8n

Le nœud est **`Notifier groupe - Course acceptée`**, dans « Acceptation
Livraison » — le message que voit le livreur qui vient de prendre la course.
Son bloc `📍 Adresse` porte déjà l'adresse texte et un lien Maps bâti sur ce
texte, qui ouvre le quartier et non la porte.

**La règle** : quand `latitude` et `longitude` existent, ajouter une ligne
« 🚩 Point exact » avec un lien sur les **coordonnées**. Le lien sur le texte
**reste** — il sert quand il n'y a pas mieux. Les deux se lisent alors sans
ambiguïté : le quartier, et la porte.

`Notifier groupe - Course refusée` porte le même bloc d'adresse et n'est
**pas** modifié : une course refusée n'a pas besoin d'un point précis.

⚠ **URL sans paramètre de requête** — `google.com/maps/search/<lat>,<lon>` et
non `?api=1&query=`. Le `&` devrait s'écrire `&amp;` dans un `href` en mode
HTML Telegram et casserait le lien en silence. Cette règle est déjà notée
depuis le 17 août ; ne pas la redécouvrir.

### La limite de synchronisation, nommée

Le client appuie sur sa position **quelques secondes** après avoir confirmé ;
le livreur accepte la course plus tard. Dans la pratique, le point est donc là
avant l'acceptation.

**Mais rien ne le garantit.** Un point envoyé *après* l'acceptation
n'atteindra pas le livreur : son message est déjà parti. La parade existe
— `/api/confirmation/position` pourrait prévenir le groupe quand la course est
déjà acceptée, comme le fait déjà `Prevenir le groupe de la position` pour les
positions arrivées par WhatsApp — mais **elle n'est pas dans ce périmètre**.
On mesure d'abord si le cas se produit.

**Le découpage a une propriété qu'il faut préserver** : le trajet du point est
indépendant de la carte. Si l'épingle glissante déçoit, on la retire sans rien
casser — le bouton GPS d'origine alimente le même chemin, qui lui sera enfin
utile.

---

## Le fournisseur d'image

### Pourquoi pas les autres

| Fournisseur | Palier gratuit | Verdict |
|---|---|---|
| Tuiles OpenStreetMap publiques | politique explicite : **pas d'usage commercial** | écarté |
| MapTiler | 100 000 requêtes/mois, **non commercial** | écarté |
| Stadia Maps | développement, évaluation, **non commercial** | écarté |
| **Geoapify** | 3 000 crédits/jour, **usage commercial autorisé** | **retenu** |

La FAQ de Geoapify : *« Yes, we do not restrict that. However, you must provide
an appropriate Geoapify attribution or link to our website. »*

### Ce que 3 000 crédits/jour valent réellement

Le coût suit `1 + tuiles/4 + icônes`, avec
`tuiles = ceil(largeur/256) × ceil(hauteur/256)`.

Pour une image de **640 × 400** — largeur d'un téléphone, assez haute pour
reconnaître un quartier :

```
tuiles  = 3 × 2 = 6
icônes  = 0        ← l'épingle est la NÔTRE, en HTML par-dessus
crédits = 1 + 6/4 + 0 = 2,5

3 000 ÷ 2,5 = 1 200 images par jour
```

À vingt marchands faisant trente commandes chacun : 600 par jour, **la moitié
du plafond**, avant même le cache.

**L'épingle est la nôtre, et ce n'est pas une économie de bout de chandelle.**
Chaque icône demandée au fournisseur coûterait un crédit entier — +40 % par
image. Et il nous la faut glissante de toute façon.

**Attribution obligatoire** : « Powered by Geoapify » sous la carte. C'est le
prix du gratuit, et il n'est pas négociable.

---

## La route d'image, et ses gardes

**L'image est demandée par le serveur, jamais par le navigateur.** Une clé
placée dans le HTML serait lisible par n'importe qui, et n'importe qui pourrait
vider le quota.

```
GET /api/confirmation/carte?ref=…&t=…&lat=…&lon=…
   → demande l'image à Geoapify, avec la clé
   → renvoie l'image au navigateur
```

La clé vit dans une variable d'environnement **sans `NEXT_PUBLIC_`** — voir la
leçon des clés VAPID : `NEXT_PUBLIC_` côté serveur est une faute, et toute
variable nouvelle exige un redéploiement.

### Trois gardes

- **La même preuve que la page elle-même** — référence *et* jeton. Sans cela,
  la route est un mandataire d'images ouvert à tous.
- **Un frein par appelant**, comme sur `/suivi` et `/confirmation`.
- **Coordonnées arrondies à trois décimales** (≈ 100 m) avant d'atteindre le
  fournisseur. Deux clients du même quartier demandent alors la **même** image,
  que le cache sert sans rien consommer. C'est ce qui rend le zéro coût réel
  plutôt que théorique.

⚠ **L'arrondi ne concerne que l'image de fond.** L'épingle garde ses
coordonnées exactes, et c'est elle qu'on enregistre. Confondre les deux
reviendrait à livrer à 100 m près.

---

## Ce qui casse, et la réponse

| La panne | La réponse |
|---|---|
| **Le GPS est refusé** | **Pas de carte.** `boutiques` n'a aucune coordonnée — seulement une `zone` en texte — donc aucun centre de repli. Centrer sur « Abidjan » codé en dur serait le point faux qu'on refuse depuis le 17 août, et serait faux au premier marchand hors d'Abidjan. Le client garde le message actuel. |
| **Fournisseur en panne, clé absente, quota vide** | L'image ne charge pas ; la page retombe sur le bouton GPS seul. **Le point est capturé quand même.** Une panne de carte ne doit jamais coûter une position. |
| **Le script en ligne casse** | Le plus sournois : ni le typecheck ni le build ne le voient, seulement le client, en silence. `scripts/verifier-position.mjs` le contrôle déjà à part — on l'étend **et on le branche au job `verifier`**, pour qu'il cesse de dépendre de la mémoire de quelqu'un. |
| **Épingle déposée n'importe où** | Bornée deux fois : l'image ne couvre que quelques centaines de mètres, et `pointValide()` refuse déjà (0,0) et une latitude à 95. **Rien à ajouter.** |
| **Martèlement de la route d'image** | Référence + jeton + frein par appelant. |

---

## Les tests

- **La route d'image** : refus sans jeton ; arrondi à trois décimales
  effectivement appliqué ; dégradation propre quand la clé manque.
- **`fiche` rend le point** : extension du test posé le 24 août sur cette même
  route, qui verrouille déjà `jeton_suivi`.
- **Le script embarqué** : syntaxe vérifiée par le banc, en CI.
- **n8n** : le lien Maps bâti sur les coordonnées, vérifié sur la version
  **ACTIVE** — jamais sur le brouillon.

### Le critère d'acceptation

> La fonction est finie quand une commande **réelle** porte `latitude` et
> `longitude`, **et** que le message reçu par le livreur contient le lien
> précis.

Pas « quand la carte s'affiche ». Zéro position capturée en trois semaines
d'existence du bouton : c'est la preuve que l'affichage ne prouve rien.

---

## À vérifier AVANT d'écrire une ligne

1. **Les conditions générales de Geoapify, ligne à ligne.** La FAQ autorise
   l'usage commercial ; les CGU n'ont pas été lues. C'est le genre de détail
   qui se retourne mal une fois en production.
2. ~~**Vos quartiers sont-ils lisibles ?**~~ — **VÉRIFIÉ le 24 août, et la
   réponse est oui.** Voir ci-dessous.

Le premier reste bloquant.

### La lisibilité, mesurée sur les tuiles réelles

Tuiles OpenStreetMap récupérées et regardées, aux zooms 16 et 17 :

| Quartier | Ce qu'on y voit |
|---|---|
| **Riviera** (5.3534, -3.9584) | rues **nommées** (Rue Serge Grah, Rue Jean-Marie Adiaffi, Rue Dr Seibo Alexise Ikossié), immeubles nommés (« Immeuble Konaté »), et surtout des **numéros de rue** — 1044, 985, 279, 137, 106, 85… Un client peut y retrouver son numéro. |
| **Akouédo** (5.3523, -3.9407) | bâtiments dessinés **un par un**, le nom du quartier, une pharmacie nommée, une mosquée, et **« Route G11 » nommée**. |

**Le détail qui emporte la décision** : une adresse réelle de la base est
`Akouedo SYNACASSCI RUE G11`. La rue que ce client a tapée à la main **est
nommée sur la carte**. Il n'aurait pas eu à chercher.

⚠ **Deux réserves honnêtes.** L'échantillon est de deux quartiers ; Abobo et
les zones périphériques n'ont pas été regardées. Et ces tuiles sont celles du
rendu OSM standard : Geoapify sert les mêmes **données**, mais son style peut
afficher moins d'étiquettes. À confirmer sur une image Geoapify réelle le jour
où la clé existe — c'est le style qui est en cause, pas la donnée.

---

## Ce qu'on ne fait pas

- **Pas de carte glissante** (zoom, déplacement libre) : trente à quatre-vingts
  requêtes de tuiles par client, un quota consommé vite, une bibliothèque
  chargée depuis un CDN, et un script en ligne bien plus gros dans la zone que
  rien ne relit. Si l'épingle sur image ne suffit pas, on y viendra — **sans
  rien jeter**, le stockage, la validation et le message au livreur étant
  identiques.
- **Pas de page React dédiée** : une navigation de plus, donc des clients qui
  décrochent, à l'étape précise où l'engagement mesuré est déjà nul.
- **Pas de géocodage**, ni maintenant ni plus tard, sans raison neuve.
