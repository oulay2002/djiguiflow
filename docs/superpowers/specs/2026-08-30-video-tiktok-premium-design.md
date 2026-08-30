# La vidéo TikTok prête à publier, chaque semaine, pour le Premium

**Date** : 30 août 2026
**État** : conception validée, non implémentée

---

## Le problème

Le forfait Premium ne se distingue pas du Pro. Ce n'est pas une impression :
sur les six lignes annoncées dans `plans.ts`, **quatre sont identiques mot pour
mot** à celles du Pro. Il ne reste que « Plusieurs boutiques » et « Support
prioritaire ».

| | Pro | Premium |
|---|---|---|
| Prix | 10 000 F | **25 000 F** |
| Commandes incluses | 300 | 1 000 |
| Bot WhatsApp + IA | oui | oui |
| Suivi client et livreurs | oui | oui |
| Photos retravaillées | oui | oui |
| Contenus hebdomadaires | oui | **oui — identique** |

Le marchand paie donc 2,5 fois plus cher pour un compteur plus haut qu'il
n'atteindra pas avant longtemps : 1 000 commandes par mois, c'est 33 par jour.
Le Premium n'est pas un forfait supérieur, c'est le même forfait avec une
limite plus lointaine.

Il lui faut un contenu propre, et qui se voie.

---

## Ce que le dépôt fournit déjà

Trois choses, et elles portent la moitié du travail.

**Un générateur de visuel déterministe.** `src/app/api/contenus/visuel/route.tsx`
compose un PNG à partir de la base : nom de la boutique, plats vendus, prix,
note, photo du produit vedette. Sa doctrine est écrite dans le fichier — rendu
déterministe plutôt que généré par un modèle, parce que les modèles écrivent
mal le français accentué, coûtent à chaque envoi, et **peuvent inventer un
produit**. Cet argument vaut mot pour mot pour la vidéo, et la présente
conception s'y range.

**Un script TikTok déjà construit.** `hebdo.ts` choisit le produit le plus
vendu de la semaine, en tire une accroche, décrit trois plans, place le prix et
la chute. Il ne manque que les images qui bougent.

**Des photos exploitables.** Mesure du 30 août : Zahara 5 produits / 5 photos,
Rose Monde 3 / 3. Elles passent toutes par `ameliorerPhoto`, donc elles sont
déjà redressées, recadrées et calibrées.

Ce qui manque : `ffmpeg`, absent de la machine comme des dépendances.

---

## Les décisions tranchées

### 1. Des photos animées, jamais une vidéo générée par un modèle

Le mouvement vient d'un recadrage progressif sur les photos réelles du
catalogue. Un modèle image-vers-vidéo produirait une image plus flatteuse, mais
il **complète** ce qu'il voit : un attiéké peut ressortir avec des ingrédients
que le marchand ne vend pas. Le client commande, ne reconnaît rien, et c'est le
marchand qui répond.

C'est la même règle que le visuel fixe applique déjà. On ne l'assouplit pas
pour la vidéo, où le mensonge serait plus convaincant.

Corollaire : aucun coût par vidéo, et aucun appel sortant au moment du rendu.

### 2. Une vidéo part toujours, même sans vente

Le marchand Premium qui n'a rien vendu est celui qui a le plus besoin d'une
vidéo. Lui envoyer le silence, c'est lui dire deux choses à la fois — « vous
n'avez rien vendu » et « la plateforme est morte » — et il ne peut pas les
distinguer. Ce défaut nous a coûté cinq nuits de rapports quotidiens muets.

Le produit mis en avant est choisi automatiquement, dans cet ordre :

1. le plus vendu de la semaine ;
2. à défaut, le produit du catalogue le plus récemment ajouté ;
3. à défaut, le premier produit disponible.

L'accroche ne cite un chiffre que si `SEUIL_QUANTITE_PUBLIABLE` est atteint.
Sinon elle se rabat sur la forme sans chiffre déjà écrite dans `hebdo.ts`.

**Le marchand ne choisit pas.** Aucun écran à construire, aucun réglage à
comprendre, aucune option à oublier. Si le besoin de pousser un arrivage précis
se manifeste, il sera traité alors — pas avant.

### 3. La vidéo se livre par un lien

**La chaîne d'envoi ne transporte que du texte.** Vérifié le 30 août sur
« Envoyer réponse client » (`JkNvcqsZaY22dfk5`) : deux sorties seulement, *Send
a text message* pour Telegram et un appel HTTP pour WhatsApp, et zéro
occurrence de `photo`, `video` ou `document`.

Lui ajouter le transport de médias signifierait modifier le workflow le plus
critique de la plateforme — quatorze appelants, et il vient d'être rendu
capable de lever correctement — pour une nouveauté hebdomadaire. On ne le fait
pas.

La vidéo voyage donc comme le visuel voyage déjà : par son adresse, dans le
message du lundi.

### 4. Une voix off, jamais de musique

**Aucune musique.** Y coller une piste que nous ne possédons pas ferait couper
le son de la publication du marchand par TikTok, ou retirer la vidéo. Le
message du lundi dira au marchand d'ajouter lui-même un son tendance dans
l'application, où le choix est libre et où se joue la portée.

**Une voix off, en revanche, oui** — elle est produite par nous, elle
n'appartient à personne d'autre, et elle n'interdit rien : TikTok mélange
l'audio d'origine avec le son ajouté et laisse régler l'équilibre. Surtout, le
même fichier sert au **statut WhatsApp**, où aucun son ne peut être ajouté :
là, muet veut dire muet.

**La voix ne prononce jamais le nom du produit.** Une synthèse vocale française
lit « attiéké », « garba », « alloco », « kedjenou » avec un accent
métropolitain et les écorche souvent. Devant un public abidjanais, cela
s'entend immédiatement — et une voix qui sonne mécanique donnerait à la
publication du marchand l'air d'avoir été fabriquée par une machine, ce que la
plateforme refuse partout ailleurs.

Elle ne dit donc que ce qu'une synthèse française lit sans faute : des nombres,
un prix, une phrase courante. Le nom du plat reste à l'écran, où il est déjà
écrit correctement.

> « Douze commandes cette semaine. Deux mille cinq cents francs, livré chez
> vous. Commandez sur WhatsApp. »

Le problème de prononciation est contourné, pas combattu.

**Le coût n'entre pas dans la décision** : environ 200 caractères par vidéo,
dix Premium sur quatre semaines, soit 8 000 caractères par mois — de l'ordre de
0,10 $ mensuel chez les fournisseurs courants.

**Ce qui entre dans la décision, c'est la dépendance** : un appel sortant de
plus sur le chemin du lundi. Il suit la règle générale — synthèse injoignable
ou en erreur, **la vidéo se fabrique quand même, muette**. Jamais de vidéo
manquante parce qu'un service de voix était en panne.

**Cette décision est conditionnée à une écoute** : voir « La réserve à lever ».
Si aucune voix ne convient, la vidéo reste muette et rien d'autre ne change
dans la présente conception.

### 5. n8n déclenche, Vercel fabrique, Supabase range

C'est le schéma que la plateforme applique déjà partout. Aucune infrastructure
nouvelle, rien de neuf à surveiller.

Les deux autres voies ont été écartées :

- **Rendu à la demande**, quand le marchand clique : il attend quinze à vingt
  secondes devant un écran blanc, sur une connexion mobile ivoirienne, et
  chaque re-clic refait le travail.
- **Rendu sur le VPS par n8n** : il faudrait installer `ffmpeg` dans le
  conteneur, l'appeler depuis un nœud *Execute Command* souvent désactivé, et
  surtout faire tourner un encodage vidéo sur la machine qui encaisse les
  commandes en direct.

---

## Les deux contraintes mesurées

**Le bucket `images` refuse le MP4.** Ses `allowed_mime_types` s'arrêtent à
`image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`. Il faut un
bucket **`videos`** distinct — ce qui est de toute façon préférable : plafond
de taille propre, purge propre, et `images` conserve sa garantie de ne contenir
que des images.

Réglages du nouveau bucket : public, `video/mp4` seul, plafond à **20 Mo**.

**Le forfait est porté par le compte, pas par la boutique.** `quota.ts` lit
`subscriptions` par `user_id`, et un Premium peut tenir plusieurs boutiques. Le
droit à la vidéo se détermine donc par `boutiques.user_id` → `subscriptions` →
`planApplicable()`, jamais par un champ posé sur la boutique. Un abonnement
expiré ou suspendu perd la vidéo comme il perd le reste : `accesOuvert()` est
seul juge.

---

## L'architecture

Trois pièces neuves, chacune avec un seul rôle.

| Fichier | Rôle | Dépend de |
|---|---|---|
| `src/lib/contenus/video.ts` | Décide **ce qu'on montre** : les quatre plans, leur photo, leur texte, leur durée. Pure, sans effet de bord. | `hebdo.ts` |
| `src/lib/video/rendu.ts` | Fabrique le MP4 à partir d'un plan de tournage. Ne sait rien du métier. | `sharp`, Satori, `ffmpeg` |
| `src/app/api/internal/contenus/video/route.ts` | Reçoit `{ boutique }`, vérifie le forfait, range dans `videos/`, rend l'URL. | les deux ci-dessus |

La séparation est le point important : `video.ts` répond à « quoi montrer »,
`rendu.ts` à « comment le fabriquer ». On teste le premier sans jamais encoder
une image, et on peut changer l'encodeur sans toucher au métier.

### Le flux du lundi

```
Chaque lundi 8 h
  ├─ Contenus de la semaine        (existant, sortie enrichie)
  ├─ Lire le registre              (existant, inchangé)
  ├─ Boutique Premium ?            ← NOUVEAU filtre
  ├─ Vidéo de la semaine           ← NOUVEAU, un appel par boutique
  │    POST /api/internal/contenus/video  { boutique: slug }
  │    → { urlVideo }              onError: continueRegularOutput
  ├─ Composer les envois           ← une ligne de plus si urlVideo existe
  └─ Envoi Telegram / WhatsApp     (INCHANGÉ — texte seul)
```

Un appel par boutique, et non un appel qui les rendrait toutes : dix Premium à
une minute de rendu chacun dépasseraient tout délai raisonnable sur une seule
requête. Le nœud HTTP de n8n s'exécute naturellement une fois par article
entrant.

**n8n ne peut pas savoir qui est Premium** : le forfait vit dans
`subscriptions`, qu'il n'interroge pas. Le drapeau doit donc lui être donné.
`/api/internal/contenus/hebdo` ajoute à chaque contenu un champ **`premium:
boolean`**, calculé côté serveur par `planApplicable()`. Le filtre n8n ne fait
que le lire.

La route de rendu **revérifie le forfait** au lieu de faire confiance à son
appelant. C'est la règle habituelle des routes `/api/internal` : le secret
partagé prouve que l'appel vient de nous, pas que la boutique y a droit.

### Le changement dans `hebdo.ts`

`contenusHebdo` n'émet aujourd'hui **rien** pour une boutique sans vente — c'est
délibéré et documenté ligne 269. Or sans message, la vidéo n'a nulle part où
voyager.

`contenusHebdo` gagne donc un chemin pour les boutiques **Premium** sans vente :
un contenu bâti sur le catalogue au lieu des ventes, avec `vide: true` — un
champ qui existe déjà dans le type et qui vaut toujours `false` depuis
l'origine. Le comportement des boutiques Essai et Pro **ne change pas** : sans
vente, elles restent absentes.

---

## Ce qu'on voit à l'écran

Quinze secondes, 1080×1920, 24 images par seconde, H.264, audio AAC mono.
Quatre plans, tirés du script qui existe déjà.

| Plan | Durée | Image | Texte incrusté | Voix off |
|---|---|---|---|---|
| 1 | 0-4 s | Photo du produit vedette, zoom lent avant | L'accroche — avec le chiffre si le seuil est atteint | « Douze commandes cette semaine. » — muette si le seuil n'est pas atteint |
| 2 | 4-8 s | Deuxième photo, panoramique latéral | Le prix, en gros | Le prix, en toutes lettres |
| 3 | 8-12 s | Troisième photo, zoom arrière | « Livré chez vous » | « Livré chez vous. » |
| 4 | 12-15 s | Fond `NUIT`, palette maison | Nom de la boutique + « Commandez sur WhatsApp » | « Commandez sur WhatsApp. » |

Aucune de ces quatre phrases ne contient de nom de produit, et c'est la règle,
pas un hasard du présent tableau.

S'il n'y a que deux photos, le plan 3 reprend la première sous un autre cadrage.

**Rien à l'écran qui ne soit publiable.** Le fichier est déposé dans un bucket
public, comme le visuel, et pour la même raison. Donc : ni chiffre d'affaires,
ni panier moyen, ni volume de commandes. Seulement ce que le marchand
publierait de toute façon — ce qu'il vend, à quel prix, et sa note si elle est
bonne. La même règle et le même seuil que le visuel fixe.

### Comment le mouvement est fabriqué

Sans moteur vidéo, avec ce qui est déjà en dépendance.

- **`sharp`** produit le mouvement : un zoom lent est une suite de recadrages
  progressifs sur la photo source. 15 s × 24 images = 360 recadrages.
- **Satori**, via le même `ImageResponse` que le visuel, rend les textes en PNG
  transparent — **une fois par plan**, soit quatre rendus, que `sharp` compose
  ensuite sur chaque image. On ne rend pas 360 fois du texte.
- **`ffmpeg`** ne fait que l'encodage final et le mixage de la piste vocale.
  Binaire statique d'environ 70 Mo, très en dessous de la limite de 5 Go d'une
  fonction Vercel.

La voix off est demandée **en une seule fois**, pour les quatre phrases mises
bout à bout avec leurs silences, et non en quatre appels : un seul aller-retour
réseau, et une diction continue plutôt que quatre fragments recollés.

Même palette, même typographie, même source de vérité que le visuel.

---

## Ce qui peut casser, et ce qu'on fait

C'est la section qui compte le plus.

| Panne | Conséquence |
|---|---|
| Moins de deux photos au catalogue | **Aucune vidéo.** Un diaporama de cartes de texte n'est pas publiable ; mieux vaut ne rien livrer. |
| Rendu ou encodage en échec | Le message du lundi part **exactement comme aujourd'hui** — visuel et script compris. |
| Dépôt dans le bucket en échec | Idem. |
| Le nœud vidéo est injoignable | `Composer les envois` continue. La vidéo est un supplément, jamais une dépendance. |
| **Synthèse vocale injoignable ou en erreur** | **La vidéo est produite muette.** Le son est un supplément du supplément ; il ne fait échouer personne. |
| Abonnement expiré ou suspendu | Pas de vidéo, sans erreur : ce n'est pas une panne. |

Le marchand ne reçoit jamais moins qu'aujourd'hui. Aucune de ces pannes ne peut
faire échouer l'envoi hebdomadaire.

**Et le point sans lequel tout ce qui précède est un piège :** chaque absence de
vidéo qui n'est pas un cas normal prévient l'exploitant par `prevenirExploitant`,
plafonnée à trois par jour. Un repli qui fait survivre une panne la rend
invisible à la surveillance — c'est exactement le motif qui a produit cinq nuits
de rapports silencieux et des exécutions vertes. Ici le repli protège le
marchand *et* parle.

L'alerte est levée **côté serveur, dans la route**, et non par n8n : une route
injoignable ne peut pas s'alerter elle-même, mais un rendu qui échoue le peut.

---

## Conservation

Un MP4 par boutique et par semaine s'accumule sans fin. La purge nocturne
existante prend en charge le bucket `videos`, avec une durée déclarée dans
`conservation.ts` : **90 jours**.

Le chemin de dépôt est `${boutiqueId}/${AAAA-Www}.mp4` — l'uuid de la boutique
en premier segment, comme la convention l'exige déjà pour les photos, et la
semaine ISO ensuite, ce qui rend le dépôt idempotent : relancer le lundi deux
fois écrase le même fichier au lieu d'en créer un second.

---

## Comment on le prouve

**Unitaire, sur `video.ts`** : quel produit est choisi selon les ventes, quels
textes, combien de plans, et le seuil de publication du chiffre. Sans encoder
une seule image.

**Par mutation** — la méthode qui a trouvé sept défauts sur neuf lors de la
revue d'août :

1. Zéro photo au catalogue → aucune vidéo n'est produite **et** le message
   hebdomadaire reste identique à celui d'aujourd'hui.
2. Encodage forcé en erreur → l'envoi du lundi a bien lieu **et** l'alerte
   exploitant part.
3. Abonnement expiré → pas de vidéo, et **pas** d'alerte : ce n'est pas une
   panne.
4. Synthèse vocale forcée en erreur → la vidéo est produite **et lisible**,
   sans piste audio. Une vidéo muette, pas une vidéo corrompue : c'est le
   mixage qui doit être sauté, pas seulement l'appel au fournisseur.

Un garde qu'on n'a jamais vu rouge ne protège de rien. Les trois mutations
doivent échouer avant que le correctif ne soit écrit.

**Un banc**, sur le modèle de ceux qui existent : il fabrique une vraie vidéo
depuis Zahara et contrôle la durée, les dimensions, le poids, et que le fichier
est décodable.

---

## Ce qui change pour le commerce

Dans `plans.ts`, la ligne Premium passe de :

> Contenus hebdomadaires prêts à publier — visuel, légende, hashtags, script
> TikTok et statut WhatsApp

à :

> **Vidéo TikTok prête à publier, chaque semaine** — plus visuel, légende,
> hashtags et statut WhatsApp

Le Pro garde le script. C'est là que se crée l'écart.

---

## Les deux réserves à lever avant d'écrire le rendu

### ~~Le temps d'encodage n'est pas mesuré~~ — LEVÉE le 30 août 2026

Budget fixé : **60 secondes et 1 Go de mémoire** par vidéo. Mesuré par
`npm run mesurer:video`, sur une photo réelle du catalogue de Zahara — un aplat
de couleur se compresse en presque rien et aurait donné un chiffre flatteur qui
ne veut rien dire.

| Résolution | Images | Encodage | Total | Poids | Mémoire | |
|---|---|---|---|---|---|---|
| **1080×1920** | 27 494 ms | 8 621 ms | **36 115 ms** | 0,88 Mo | 103 Mo | dans le budget |
| 720×1280 | 12 994 ms | 7 447 ms | 20 441 ms | 0,50 Mo | 104 Mo | dans le budget |

**Décision : 1080×1920.** La marge est de 40 % sur le temps et de 90 % sur la
mémoire, et `maxDuration` vaut 300 s : même une fonction trois fois plus lente
que ce poste ne toucherait pas le plafond dur.

**Deux angles morts de cette mesure, à ne pas oublier.**

1. **Le calque de texte n'y figure pas.** La mesure anime la photo mais ne
   compose aucun texte par-dessus. Le rendu réel ajoutera un calque PNG par
   image : compter une dizaine de secondes de plus, ce qui reste dans le
   budget mais en réduit la marge.
2. **La photo est décodée 360 fois.** Le banc appelle `sharp(source)` à chaque
   image, ce qui refait le décodage JPEG à chaque fois — 76 ms par image, soit
   l'essentiel des 27 s. **Le rendu doit décoder une seule fois** vers des
   pixels bruts et recadrer ensuite. Bien fait, il sera plus rapide que cette
   mesure, pas plus lent.

Autrement dit : la mesure est **pessimiste sur le décodage** et **optimiste sur
le texte**, et les deux se compensent à peu près. Elle suffit à trancher la
résolution ; elle ne dispense pas de mesurer à nouveau le rendu complet.

**Note d'installation.** `ffmpeg-static` télécharge son binaire par un script
d'installation — 82,8 Mo, ffmpeg 6.1.1. npm peut bloquer ce script sans que
l'installation échoue : le chemin se résout alors vers un fichier absent.
Vérifier par `ffmpeg -version`, jamais par l'existence du chemin.

### La voix off n'a pas été entendue

Une voix ne se juge pas sur le papier, et une voix qui sonne mécanique
abîmerait la publication du marchand plus qu'elle ne l'aiderait.

Avant de l'inscrire comme acquise : **le même script généré avec trois voix
françaises**, chez deux fournisseurs au moins, et une écoute par l'exploitant —
seul juge de ce qui sonne juste à Abidjan. Le fournisseur retenu devient une
variable d'environnement, comme les autres clés.

Trois issues, toutes acceptables :

1. une voix convient → elle entre dans la conception telle que décrite ;
2. aucune ne convient → **la vidéo reste muette**, et rien d'autre ne change ;
3. une voix convient mais écorche les chiffres ou le prix → on retire la phrase
   fautive, on garde les autres. La voix off se réduit, elle ne s'abandonne pas.

Tant que cette écoute n'a pas eu lieu, **la vidéo muette est le comportement de
référence**, et la voix off une option non activée.

---

## Hors périmètre, et pourquoi

- **Publier à la place du marchand.** Ni Facebook ni Instagram ne l'autorisent
  sans App Review et connexion OAuth par marchand ; TikTok encore moins. La
  raison est déjà écrite dans `/api/internal/contenus/hebdo`. On lui donne le
  contenu fini, il le publie : cela ne dépend de personne.
- **La musique.** Voir décision 4.
- **Le choix du produit par le marchand.** Voir décision 2.
- **L'envoi du fichier sur le canal.** Voir décision 3.
- **Le SMS et la diffusion WhatsApp promotionnelle.** Étudiés le 30 août,
  reportés. Le SMS attend un coût réel chez un agrégateur ivoirien. La
  diffusion WhatsApp exige d'abord un consentement recueilli, une finalité
  déclarée au registre et un article de plus à la politique de confidentialité
  — celle-ci ne déclare aujourd'hui qu'un seul traitement de sollicitation, la
  relance d'un panier non converti, sur intérêt légitime.
