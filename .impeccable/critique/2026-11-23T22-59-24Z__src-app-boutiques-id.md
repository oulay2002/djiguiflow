---
target: src/app/boutiques/[id]
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-11-23T22-59-24Z
slug: src-app-boutiques-id
---
Method: dual-agent (A : revue de design · B : détecteur et navigateur). Production, mobile 390×844 et bureau 1280×800, sur la boutique de démonstration, une boutique de mode et la boutique de test. Aucune commande réelle : 10 requêtes d'envoi émises, toutes interceptées dans le navigateur. Réserves : deux boutiques sur trois fermées ; mode retrait non vu à l'écran pendant cette passe.

# Critique de la vitrine `/boutiques/[id]`, troisième passe (après les PR #200, #201, #202)

## Note de santé : 29/40 (bon) — 25, puis 27 aux passes précédentes

| # | Heuristique | Note | Avant | Défaut principal |
|---|---|---|---|---|
| 1 | Visibilité de l'état | 3 | 3 | Réseau lent : boutons affichés mais inertes plusieurs secondes |
| 2 | Correspondance avec le réel | 4 | 3 | « 30 min », « Livraison en plus » sans intitulé dans la ligne repliée |
| 3 | Contrôle et liberté | 3 | 2 | Pas de « vider le panier » |
| 4 | Cohérence | 3 | 3 | Trois boutons bissap à l'écran ; onglets à 36 px ; pas de `<form>` |
| 5 | Prévention des erreurs | 3 | 3 | Numéro jamais relu ; nom d'espaces accepté ; formulaire remplissable boutique fermée |
| 6 | Reconnaître plutôt que se rappeler | 3 | 3 | Quartiers livrés en haut, adresse saisie 1 600 à 2 500 px plus bas |
| 7 | Flexibilité | 2 | 2 | Entrée ne fait rien ; rien pour le client qui revient |
| 8 | Esthétique et sobriété | 3 | 3 | Plaque sans photo de 96 px par plat |
| 9 | Récupération d'erreur | 3 | 3 | Verdict en haut de page, loin du geste, sans bouton |
| 10 | Aide | 2 | 2 | Aucun contact de la boutique ; rien si le message n'arrive pas |

## Verdict de spécificité

Ancrée, sauf la grille. Propre au produit : bon de commande à encoches, perforation, tampons « REÇUE » et « SANS RÉPONSE », prix en mono, bandeau tramé, textes du métier. Interchangeable : la grille de cartes avec photo.

Détecteur : 2 trouvailles `design-system-font-size` (advisory) — `Vitrine.tsx:254` (`5.5rem`, initiale décorative `aria-hidden`, rendue à 88 px sur la boutique de test) et `Vitrine.tsx:1280` (`9px`, « Épuisé », jamais observé à l'écran). Injection navigateur sautée : CSP de production.

## Mesures confirmant les corrections

- Rechargement : 1 ligne au ticket, nom, numéro, instructions revenus (4 configurations) ; `sessionStorage` = `djiguiflow:brouillon:<slug>`, `localStorage` vide.
- Reçu : titre « Il vous reste à confirmer sur WhatsApp », focus `h2#titre-recu`, haut à 16 px, 0 cible sous 44 px, revient après rechargement, `sessionStorage` vide après « Masquer ».
- Coupure : tampon « SANS RÉPONSE », `role=alert`, panier et saisie conservés, bouton actif, clé d'envoi identique sur deux envois.
- « Il manque : … » se met à jour champ par champ, puis disparaît.
- Numéro : `+225 07 08 09 10 11` et `2250708091011` acceptés.
- zahara mobile : premier « Ajouter » à 720 → 764 px ; 862 ko dont 498 d'images.

## Ce qui fonctionne

1. Le reçu : même papier que le ticket, tampon vert, bloc mangue, étape 1 en gras.
2. « SANS RÉPONSE » distinct de « REFUSÉE », consigne et panier conservé.
3. Le brouillon et le numéro.

## Problèmes prioritaires

### [P1] Le reçu ne dit ni où arrive le message, ni quoi faire s'il n'arrive pas
Pas de rappel du numéro saisi, aucun délai, aucun recours, aucun contact de la boutique. Correction : « Répondez au message WhatsApp envoyé au 07 08 09 10 11 » ; « Rien reçu ? Écrire à la boutique ». Arbitrage : le reçu ne porte volontairement aucune donnée personnelle. Lignes : `src/lib/vitrine/recu.ts:146`, `Recu.tsx:92-103`, `Vitrine.tsx:935-950`. Commande : `/impeccable clarify`.

### [P1] Réseau lent : page visible mais sourde
Mesure synthétique (750 kb/s, 300 ms, CPU ×4) sur zahara : premier plat à 2,0 s, « Ajouter » réactif à 11,4 s. À confirmer sur un vrai téléphone. Correction : alléger les deux photos immédiates ; marquer les boutons en attente jusqu'à l'hydratation. Lignes : `Vitrine.tsx:210-241`, `1340-1345`. Commande : `/impeccable optimize`.

### [P1] Verdict d'échec en haut, geste de correction en bas
Après un échec la page remonte ; « Envoyer » est 1 600 à 2 500 px plus bas ; rien ne dit que le réessai est sans doublon. Correction : verdict dans le ticket au-dessus du bouton ; bouton « Renvoyer la même commande » pour « SANS RÉPONSE ». Lignes : `Vitrine.tsx:1484-1505`, `986-999`. Commande : `/impeccable layout`.

### [P2] Sans photo, un plat coûte un demi-écran
Plaque de 96 px ; 2 plats par écran ; 25 plats ≈ 6 000 px. Correction : ligne compacte sans image, carte haute réservée aux plats photographiés. Lignes : `Vitrine.tsx:250-264`, `1054-1055`. Commande : `/impeccable distill`.

### [P2] Boutique fermée : formulaire remplissable, bouton mort
Correction : heure de réouverture en tête du ticket et dans la barre du bas ; champs repliés. Lignes : `Vitrine.tsx:2004`, `2150-2160`, `2200-2224`. Commande : `/impeccable harden`.

## Signaux d'alerte par profil

- Casey : touche « Ajouter » pendant la phase sourde ; barre du bas centrée et sans verbe ; Entrée inerte (pas de `<form>`, pas d'`enterKeyHint`).
- Jordan : « Livraison en plus » ambigu ; ne sait pas qu'il ne paie rien maintenant ; « Instructions » sans exemple ; « Suivre ma commande » avant toute commande.
- Riley : nom de trois espaces accepté ; « + » du ticket grisé sans explication au plafond de stock (`Vitrine.tsx:1894-1901`) ; 720 caractères acceptés dans « Instructions » ; adresse de boutique inconnue = enseigne fantôme et bon vide.
- Client ivoirien : adresse tronquée sur une ligne (`Vitrine.tsx:2062-2069`) ; pas de pont vers WhatsApp ; « Il manque » en 12 px gris et bouton désactivé à 45 % d'opacité.

## Observations mineures

- Onglets de catégorie 36 px (`Vitrine.tsx:1662`, `1688`), « + » des suggestions 36 px (`1778`, `1836`).
- Carte soulevée après un appui tactile (`hover:-translate-y-1`, `1150`).
- Bureau : « Ajouter » au bord droit des cartes de 227 px.
- Lignes du ticket sans unité.
- Titre d'onglet « momentanement » sans accent.
- Reçu : « Paiement accepté » absent si non renseigné ; adresse de livraison non rappelée.
- Images sans `width`/`height` ; `h1 → h3`.

## Questions

1. Pourquoi « REÇUE » si la commande n'existe qu'après la réponse WhatsApp ?
2. Le nom et le numéro partent vers `/panier` environ 2,5 s après une saisie valide, avant tout envoi (`Vitrine.tsx:825-851`) : la page ne le dit pas. À vérifier contre la politique de confidentialité.
3. Grille de cartes ou carte en lignes serrées pour un restaurant sans photos ?
