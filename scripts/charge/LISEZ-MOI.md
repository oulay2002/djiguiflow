# Tests de charge

Deux scenarios, deux questions differentes.

    k6 run scripts/charge/vitrines.js

Combien de **visiteurs** la plateforme encaisse-t-elle ? Parcours reel : la
page de la vitrine, la fiche de la boutique, le catalogue. Deux enseignes a
dessein — une mesure sur une seule cacherait un cache qui ne se partage pas.

    k6 run scripts/charge/n8n-concurrence.js

Combien de **conversations** le VPS n8n mene-t-il en meme temps ? Le webhook
vise attend 3 secondes puis repond : la duree d'un appel au modele de langage,
sans en payer un seul.

⚠ Ce webhook n'existe plus. Il etait porte par un workflow jetable, archive
apres la mesure : un point d'entree public qui dort est une porte ouverte. Pour
refaire le test, recreer un workflow `Webhook -> Wait 3s -> Set`.

## CE QU'ON NE TESTE JAMAIS

**La prise de commande.** Elle creerait de vraies commandes, alerterait de
vrais livreurs sur Telegram et previendrait de vrais marchands. Un test de
charge qui derange des gens n'est pas un test, c'est un incident.

**L'assistante.** Chaque appel coute des jetons Mistral et passe par un
limiteur de rafale : on mesurerait le limiteur, pas la plateforme.

## Mesures du 21 aout 2026

| Scenario | Pointe | Requetes | Echecs | p95 |
|---|---|---|---|---|
| Vitrines | 60 visiteurs | 3 963 | 0 | 593 ms |
| Vitrines | 250 visiteurs | 24 039 | 0 | 471 ms |
| n8n | 60 conversations | 622 | 0 | 4,8 s (dont 3 s voulues) |

La p95 est MEILLEURE a 250 qu'a 60 : les fonctions etaient chaudes. Le premier
visiteur paie le demarrage, pas les suivants.
