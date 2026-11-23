---
target: src/app/boutiques/[id]
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-11-23T19-48-28Z
slug: src-app-boutiques-id
---
Method: dual-agent (A : revue de design · B : détecteur et navigateur). Production, mobile 390×844 et bureau 1280×800, sur la boutique de démonstration et une boutique de mode. Aucune commande passée.

# Critique de la vitrine `/boutiques/[id]`

## Note de santé : 25/40 (acceptable)

| # | Heuristique | Note | Défaut principal |
|---|---|---|---|
| 1 | Visibilité de l'état | 3 | L'ajout au panier ne donne aucun retour autre que le compteur |
| 2 | Correspondance avec le réel | 3 | Un numéro collé en `+225…` est refusé |
| 3 | Contrôle et liberté | 2 | Ticket non modifiable ; le rechargement efface tout |
| 4 | Cohérence | 3 | Jusqu'à sept surfaces bissap à l'écran, contre la règle de DESIGN.md |
| 5 | Prévention des erreurs | 2 | Rien ne dit que le numéro doit être joignable sur WhatsApp |
| 6 | Reconnaître plutôt que se rappeler | 2 | Champs sans étiquette ; paiement absent au moment d'envoyer |
| 7 | Flexibilité | 2 | L'habitué ressaisit tout ; pas d'autocomplete sur nom et adresse |
| 8 | Esthétique et sobriété | 3 | 300 px d'informations avant le premier plat |
| 9 | Récupération d'erreur | 3 | Une coupure réseau s'affiche « REFUSÉE » |
| 10 | Aide | 2 | Aucun moyen de joindre le restaurant depuis sa page |

## Verdict de spécificité

Ancrée aux deux bouts, générique au milieu. Propre au produit : bandeau nuit perforé, bon de commande à encoches, prix en mono, angles vifs, phrase sur les frais du livreur. Interchangeable : la grille du menu (≈60 % de la page), carte photo + titre + prix + bouton rouge.

Détecteur : 2 trouvailles `design-system-font-size` (advisory) dans `Vitrine.tsx` — ligne 248 (`text-[5.5rem]`, initiale décorative `aria-hidden`, faux positif probable) et ligne 1102 (`text-[9px]`, libellé « Épuisé », réel). Injection dans le navigateur refusée par la CSP de production (`script-src 'self' 'unsafe-inline'`) : aucun surlignage.

## Ce qui fonctionne

1. Le ticket : encoches, perforation, ligne « Il manque : … » (`Vitrine.tsx:1862-1878`).
2. L'honnêteté sur les frais de livraison, avant le menu et sous le total (`Vitrine.tsx:1710-1716`).
3. Le rendu serveur : FCP 0,9 s sur zahara, 0 erreur de console, aucun débordement horizontal.

## Problèmes prioritaires

### [P1] Le premier écran mobile ne montre aucun plat
Bandeau 270 px, bloc d'informations 300 px, première photo à 690 px sur 844, premier « Ajouter » à 1 033 px. Correction : informations sur une ligne sous l'enseigne avec détail dépliable ; « Suivre ma commande » et « Retour aux boutiques » en liens discrets ; objectif nom + prix + bouton du premier plat au-dessus de 844 px. Lignes : `Vitrine.tsx:1198-1260`, `1249-1254`, `1363-1430`. Commande : `/impeccable layout`.

### [P1] Numéro : format `+225` refusé, et exigence WhatsApp tue
`+225 07 08 09 10 11` devient `22 50 70 80 91` (« Le numéro doit commencer par 0 »). Cause : `src/lib/telephone.ts:129` coupe à 10 chiffres avant le retrait de l'indicatif. La commande n'est préparée que si le client répond sur WhatsApp (`Vitrine.tsx:1290`) mais le champ dit « Téléphone ». Correction : retirer l'indicatif avant de tronquer ; étiquette « Votre numéro WhatsApp » + aide « Le commerçant vous y écrit pour confirmer. » Lignes : `Vitrine.tsx:1761-1775`. Commande : `/impeccable harden`.

### [P1] Ticket mobile : faux bouton et aucune correction possible
La barre fixe « N articles · total » reste sous « Envoyer la commande » (même couleur, même largeur, ne fait que défiler). Les lignes du ticket n'ont ni −, ni +, ni retrait. Correction : masquer la barre quand le ticket est visible ; compteur sur chaque ligne. Lignes : `Vitrine.tsx:1641-1663`, `1888-1913`. Commande : `/impeccable polish`.

### [P2] Champs sans étiquette et saisie volatile
4 champs sans `<label>` ni `aria-label`, 42 px de haut, texte 14 px, `autocomplete` seulement sur le téléphone ; le rechargement vide panier et champs. Correction : étiquettes visibles, `min-h-11`, 16 px, `autoComplete="name"` / `"street-address"`, `sessionStorage` par boutique, adresse multiligne « Quartier et repère ». Lignes : `Vitrine.tsx:1754-1836`, `308`, `333-336`. Commande : `/impeccable harden`.

### [P2] La fin du parcours ne rassure pas (lu dans le code)
Succès = paragraphe 14 px en haut de page ; consigne WhatsApp en deuxième phrase ; paiement non rappelé ; coupure réseau tamponnée « REFUSÉE ». Correction : reçu à la place du ticket (tampon « REÇUE », référence, total, « Vous payez à la livraison »), une consigne en gros, tampon « NON ENVOYÉE » pour le réseau. Lignes : `Vitrine.tsx:1280-1318`, `1323-1333`, `814-816`. Commande : `/impeccable clarify`.

## Signaux d'alerte par profil

- Casey (mobile, une main, 3G) : touche la barre du bas en croyant envoyer ; onglets de catégorie 36 px de haut, « + » des suggestions 36×36 ; un rechargement efface le panier.
- Jordan (première fois) : « Abidjan » sous « Quartiers livrés » ne dit pas si son quartier est servi ; ni adresse ni contact du restaurant ; « Retrait » sans lieu.
- Riley (bords) : boutique inexistante affichant quand même le bon de commande (`Vitrine.tsx:1583`, `1603-1607`) ; nom de 90 caractères sans limite visible ; « + » des suggestions actif au plafond de stock (`Vitrine.tsx:1567-1573`, déduit).
- Client ivoirien : numéro en `+225` refusé ; adresse par repères à l'étroit sur une ligne ; ne sait pas quand il paie par Wave.

## Observations mineures

- 6 images sur 6 sans `width`/`height` (CLS non mesuré).
- `h3` des plats sous le `h1` sans `h2`.
- Bureau : quatrième case vide dans la grille d'informations (`Vitrine.tsx:1368`).
- Boutique fermée : refus visible seulement dans le bouton grisé (`Vitrine.tsx:1844-1863`).
- « Votre commande » répète « Bon de commande ».
- Pied « Vous tenez un commerce ? » sur la page du client.
- zahara : 859 Ko au premier chargement, dont 510 Ko d'images.
- `text-[9px]` sur « Épuisé » (`Vitrine.tsx:1102`).

## Questions

1. Pourquoi un formulaire, plutôt qu'ouvrir WhatsApp avec le panier et laisser l'assistante demander nom et adresse ?
2. Pourquoi le menu d'un maquis ressemble-t-il à une application de livraison plutôt qu'à une ardoise ?
3. Le client veut-il connaître délai et paiement avant d'avoir faim ?
