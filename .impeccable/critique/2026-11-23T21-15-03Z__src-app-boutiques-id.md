---
target: src/app/boutiques/[id]
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-11-23T21-15-03Z
slug: src-app-boutiques-id
---
Method: dual-agent (A : revue de design · B : détecteur et navigateur). Production, mobile 390×844 et bureau 1280×800, sur la boutique de démonstration et une boutique de mode. Aucune commande passée. Réserves : boutiques fermées pendant le contrôle (bouton final actif, « Il manque », bandeaux REÇUE/REFUSÉE non vus) ; l'examen A a aperçu un titre de la critique précédente dans une sortie de graphe.

# Critique de la vitrine `/boutiques/[id]`, seconde passe (après la PR #197)

## Note de santé : 27/40 (acceptable), 25 à la passe précédente

| # | Heuristique | Note | Avant | Défaut principal |
|---|---|---|---|---|
| 1 | Visibilité de l'état | 3 | 3 | La barre du bas ne relaie pas « Fermé » |
| 2 | Correspondance avec le réel | 3 | 3 | « Instructions », « Retrait », « Détails » : mots de logiciel |
| 3 | Contrôle et liberté | 2 | 2 | Un rechargement efface panier et saisie |
| 4 | Cohérence | 3 | 3 | Trois tailles de bouton « + » (44, 40, 36 px) |
| 5 | Prévention des erreurs | 3 | 2 | Coupure réseau : réessai sans savoir si la commande est partie |
| 6 | Reconnaître plutôt que se rappeler | 3 | 2 | Délai et paiement en haut, besoin en bas |
| 7 | Flexibilité | 2 | 2 | Rien n'est retenu pour le client qui revient |
| 8 | Esthétique et sobriété | 3 | 3 | Bureau : le pied des cartes déborde |
| 9 | Récupération d'erreur | 3 | 3 | Erreur du numéro dès le premier chiffre |
| 10 | Aide | 2 | 2 | Aucun moyen de joindre le commerce |

## Verdict de spécificité

Ancrée, inégalement. Propre au produit : bon de commande à perforation, chiffres en mono, angle vif, bandeau à couture, pastille carrée, lexique par métier. Interchangeable : la carte produit. La page ne porte aucune phrase du commerçant.

Détecteur : 2 trouvailles `design-system-font-size` (advisory) — `Vitrine.tsx:248` (`5.5rem`, glyphe décoratif `aria-hidden`) et `Vitrine.tsx:1120` (`9px`, « Épuisé » sur un coloris, réel). Injection navigateur sautée : CSP de production.

## Mesures confirmant les corrections de la PR #197

- zahara mobile : premier « Ajouter » à 720 → 764 px sur 844 (1 033 avant).
- Bloc d'informations mobile : 65 px replié, 361 déplié.
- Barre fixe : 1 avant le ticket, 0 une fois le ticket à l'écran.
- Ticket : « Retirer un … » / « Ajouter un … » en 44×44, quantité 1 → 2 → 1.
- Champs : 4 sur 4 étiquetés, 46 px, 16 px, `autocomplete` sur nom, tel, adresse.
- Numéro : `+225 07 08 09 10 11` et `2250708091011` → `07 08 09 10 11` sans erreur ; `0708` et `+228…` refusés.
- Cibles du ticket sous 44 px : 0 (16 avant).

## Ce qui fonctionne

1. Le champ du numéro : toutes les formes acceptées, erreur qui compte les chiffres, libellé qui dit pourquoi.
2. Le premier écran : nom, état, première photo et premier bouton sans défiler.
3. Le ticket se corrige là où on le relit ; la barre du bas s'efface.

## Problèmes prioritaires

### [P1] Un rechargement efface tout
Mesuré sur les 4 configurations : ticket vide, champs absents, `localStorage`/`sessionStorage` vides. Correction : conserver panier, mode, nom, numéro, adresse par boutique ; revalider contre le catalogue au montage ; purger le panier au succès. Lignes : `Vitrine.tsx:326`, `351-354`, `417`, `807`. Commande : `/impeccable harden`.

### [P1] La fin du parcours ne dit pas que ce n'est pas fini (lu dans le code)
`Vitrine.tsx:1309-1347` : bandeau `text-sm` en haut du catalogue, « Répondez au message WhatsApp » en incise ; rien avant l'envoi (`1977-1993`). Correction : reçu à la place du ticket (tampon REÇUE, récapitulatif, étapes, bouton vers WhatsApp) ; ligne « Ensuite : vous confirmez sur WhatsApp » sous le bouton d'envoi. Commande : `/impeccable clarify`.

### [P1] Le retrait ne dit pas où aller ; commerce injoignable
« Retrait — Vous venez chercher. » sans adresse ; ni adresse, ni téléphone, ni horaires de la semaine. Correction : adresse/repère du commerce dans la fiche, affiché au choix du retrait et dans la confirmation ; lien « Écrire au restaurant sur WhatsApp ». Lignes : `src/lib/vitrine/donnees.ts:56-65`, `Vitrine.tsx:1826-1853`, `1930-1963`. Commande : `/impeccable shape`.

### [P2] Aucune réassurance au moment de payer
Paiement accepté visible seulement dans la ligne du haut ; sous le total, seule la mention des frais. Correction : « Rien à payer maintenant. Vous réglez à la livraison : … » sous le total. Lignes : `Vitrine.tsx:1770-1819`. Commande : `/impeccable clarify`.

### [P2] Une coupure réseau est tamponnée « REFUSÉE » (lu dans le code)
`Vitrine.tsx:832-834`, `1357` ; aucune clé d'idempotence (`776-800`) ; déduplication serveur non vérifiée. Correction : tampon « NON ENVOYÉE », texte « Nous ne savons pas si elle est partie », clé par panier. Commande : `/impeccable harden`.

## Signaux d'alerte par profil

- Casey : rechargement efface tout ; pastilles de catégorie 36 px, « + » des suggestions 36×36 (`Vitrine.tsx:1545`, `1693`, `1635`) ; barre du bas sans verbe (`2048-2057`) ; première photo à moitié chargée à 12 s en 3G lente simulée.
- Jordan : « Livraison en plus » sans ordre de grandeur ; « Instructions (facultatif) » ambigu (`1966-1968`) ; placeholder « 07 08 09 10 11 » lu comme une valeur.
- Riley : nom d'un seul espace active le bouton (`1983`) ; adresse sur une ligne tronquée (`1919`) ; anneau de focus bissap identique à l'état d'erreur ; pas de plafond de quantité sans stock suivi.
- Client ivoirien : aucun pont vers WhatsApp ; Wave sans mode d'emploi ; boutique fermée, formulaire rempli pour rien, bouton désactivé à faible contraste.

## Observations mineures

- Bureau : cartes de 227 px, compteur au bord, « Choisissez votre pointure » hors carte (`Vitrine.tsx:895`, `1132`).
- Bureau : quatrième case vide du bloc d'informations (`1431`).
- Échelle : 5 plats = 3 129 px en mobile ; pastilles de filtre non collantes.
- Erreur du numéro dès le premier caractère (`623`).
- Le ticket ne montre pas le coloris (`1724`).
- `h1 → h3` sans `h2` ; images sans `width`/`height`.
- État vide commun au catalogue vide et au filtre sans résultat (`1578-1584`).
- Puces de catégorie sans attribut `type`.

## Questions

1. Pourquoi le bouton final n'ouvre-t-il pas directement WhatsApp avec le message prêt ?
2. Photos d'un demi-écran ou carte en liste, quatre plats par écran ?
3. À qui appartient cette page, au commerçant ou à DjiguiFlow ?
