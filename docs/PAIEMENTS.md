# Encaisser pour de vrai — la plateforme est armée, il manque un paiement

> État au 4 septembre 2026. Ce document ne dit que ce qui a été **mesuré**
> contre la production. Ce qui n'a jamais été éprouvé est signalé comme tel.
>
> ⚠ Il a porté jusqu'au 4 septembre le titre « le jour où les clés arrivent »
> et s'ouvrait sur « Aujourd'hui, la plateforme n'encaisse rien ». **Les clés
> sont posées depuis le 26 août.** Un document qui décrit un état révolu est
> pire qu'un document absent : on le lit et on renonce.

---

## Aujourd'hui, la plateforme encaisse

Vérifié le 4 septembre 2026 à 16 h 20 UTC, contre la production, par
`/api/internal/billing/diagnostic` :

| Ligne | Valeur |
|---|---|
| `deploiement.commit` | `f00e8d3` |
| `prestataire.actif` | `geniuspay` |
| `prestataire.geniuspayBacASable` | **`false`** — clé de production |
| `prestataire.geniuspayClesCoherentes` | **`true`** |
| `pretAEncaisser` | **`true`** |
| `pourquoi` | **`null`** |
| `accepteBacASableEffectif` | `false` |
| `mode.simule` | `false` |

Un marchand qui clique « s'abonner » aujourd'hui est envoyé sur une vraie page
de paiement, et un paiement réel ouvre un accès réel.

---

## Les quatre gestes — trois sont faits

### 1. Poser les clés de production — ✅ 26 août 2026

`GENIUSPAY_API_KEY`, `GENIUSPAY_API_SECRET` et `GENIUSPAY_WEBHOOK_SECRET` sont
posées sur l'environnement **Production** de Vercel, et **vues** par le
déploiement servi.

⚠ La règle qui a coûté trois fois : **une variable ajoutée n'est pas vue tant
que le déploiement n'a pas été refait.** Déjà payé avec les clés VAPID, puis
avec `TELEGRAM_ALERTE_TOKEN`.

### 2. Retirer `GENIUSPAY_ACCEPTE_SANDBOX` — ✅ fait

Le diagnostic rend `accepteBacASableDemande: false`. La variable n'est plus
posée du tout, ce qui est mieux que « posée et ignorée ».

Pour mémoire, le défaut qu'elle a créé le 22 août : elle valait `1` **en
production**, là où la clé était encore une clé de bac à sable — donc n'importe
qui pouvait s'inscrire, régler dans le bac à sable et obtenir un Pro réel. Le
contrôle du montant ne protégeait rien : l'argent du bac à sable n'existe pas.
`bacASableAccepte()` exige désormais `VERCEL_ENV !== 'production'` **en plus**
du drapeau. *Une variable posée pour un test survit toujours au test.*

### 3. Déclarer le webhook CHEZ GeniusPay — ✅ 26 août 2026

`DjiguiFlow — production`, `environment: live`, `status: active`, les six
événements, sur :

```
https://www.djiguiflow.com/api/billing/geniuspay/notification
```

**Mais `success_count: 0` et `last_triggered_at: null` au 30 août : il n'a
jamais été déclenché.** Le premier vrai paiement sera son baptême.

La création d'un paiement n'envoie **aucune URL de notification** dans sa charge
utile — contrairement à CinetPay. Le webhook se déclare une fois, dans leur
interface, et il faut le refaire à chaque bascule Sandbox ↔ Production : **chaque
webhook porte son propre `whsec_`**, et Vercel n'en connaît qu'un.

### 4. Le premier vrai paiement — ⏳ IL RESTE CELUI-LÀ

C'est le seul geste qui manque, et il coûte 10 000 F. Voir la section suivante.

---

## Avant de payer : le contrôle qui ne coûte rien

**Le bouton « Tester » du webhook, dans l'interface GeniusPay, ne consomme
aucun jeton et se rejoue à volonté.** Il envoie un `webhook.test` ; notre route
le reconnaît et répond 200 **après** avoir vérifié la signature.

Il prouve donc, en une seconde, les deux seules choses qui peuvent encore être
fausses :

- l'URL est joignable depuis chez eux ;
- le `whsec_` déclaré chez eux et celui posé dans Vercel **concordent**.

C'est le contrôle à faire en premier, parce qu'un secret discordant ne se
verrait autrement **qu'au premier vrai paiement** — et se traduirait par un 401
silencieux sur la notification.

Le 17 août, ce 401 avait deux causes indépendantes, toutes deux fermées :
trois webhooks déclarés sur la même URL, chacun avec son propre secret ; et une
signature calculée sur la charge **re-sérialisée à la façon de PHP** (`\/` pour
les barres obliques, accents en `\uXXXX`). Le contrôle essaie désormais **trois
candidats** — octets bruts, `JSON.stringify`, style PHP.

---

## Le premier vrai paiement, et pourquoi il compte

⚠ **La dernière marche n'a jamais été franchie en conditions réelles.**
`prolongerAcces()` — la fonction qui ouvre les droits — est éprouvée par
`scripts/eprouver-prolonger-acces.mjs` (16 contrôles sur un utilisateur jetable,
24 août) et par `tests/unit/prolonger-acces.test.ts`. Ce qui n'a jamais tourné,
c'est **le trajet complet depuis un encaissement authentique**.

Ne laissez pas un vrai marchand être le premier test. Faites-le vous-même :

1. Un compte à vous, le plan **Pro à 10 000 F**.
2. Payez pour de vrai.
3. Regardez la ligne :

```sql
select reference, statut, montant_fcfa, operateur, jeton_prestataire
from public.paiements order by created_at desc limit 3;
```

`statut = 'paye'` **et** l'accès ouvert dans le tableau de bord : c'est gagné.

**Deux repères de temps**, mesurés le 18 août en bac à sable :

- si le **webhook** fonctionne, le paiement est honoré en **~17 secondes** ;
- s'il ne fonctionne pas, le **rattrapage** le prend au prochain quart d'heure
  rond (`:00`, `:15`, `:30`, `:45`). Rien n'est perdu, l'accès arrive plus tard.

Donc : **si l'accès n'est pas ouvert au bout de 20 minutes, il s'est passé
quelque chose.** Avant cela, patienter n'est pas de la négligence.

### L'écran du marchand pouvait refuser le paiement — fermé le 2 septembre

Jusqu'à la PR #153, un compte **en essai** portait déjà `plan_key = 'pro'`, et
le bouton « Pro — 10 000 F » se grisait en « Plan actif ». Le seul bouton
cliquable était Premium à 25 000 F. **C'est ce qui rendait le premier
encaissement de 10 000 F impossible depuis l'écran du marchand.**

La règle est désormais : payé veut dire `active`, et rien d'autre. Un essai, un
retard, un impayé sont autant de moments où il faut justement pouvoir payer.

---

## Ce que chaque état veut dire quand ça ne va pas

`honorerPaiement` ne rend jamais un verdict qu'il n'a pas les moyens de rendre.
Les états sont conçus pour qu'aucun argent ne soit enterré :

| État | Ce qui s'est passé | Ce qu'il faut faire |
|---|---|---|
| `honore` | payé, accès ouvert | rien |
| `deja` | notification rejouée | rien, c'est l'idempotence |
| `introuvable` | la référence n'existe pas dans **notre** registre | **ne pas conclure** : c'est le cas d'une transaction créée sous d'autres clés, ou sur un autre environnement. Vérifier chez GeniusPay avant de supposer une fraude |
| `indetermine` | prestataire injoignable, ou statut `pending` | **rien, surtout pas conclure** — le rattrapage repassera |
| `sans_jeton` | pas de référence prestataire chez nous | l'argent a pu partir : vérifier chez GeniusPay |
| `refuse` (`statut`) | le prestataire dit non | rien |
| `refuse` (`montant`) | montant encaissé ≠ montant demandé | **regarder** : c'est le garde qui empêche de payer 200 F pour un plan à 25 000 |
| `sandbox` | transaction simulée | en production, c'est normal et sain |
| `acces_non_ouvert` | **payé, mais les droits n'ont pas été posés** | le seul cas qui mérite qu'on se lève la nuit |

**Un paiement indéterminé n'est pas un paiement refusé.** Les confondre enterre
de l'argent encaissé. Le statut reste `en_attente` à dessein, et le rattrapage
le reprend.

---

## Le filet, et la preuve qu'il travaille

`Rattrapage paiements` (n8n, `XfUZn8V2TAOXG7yV`) tourne toutes les 15 minutes.
Vérifié le 4 septembre **dans les données d'exécution, pas sur le drapeau
« actif »** — la distinction a déjà menti ailleurs :

```
16:15:00 → examines:0  interroges:0  honores:0  bloques:0
           seuilAlerteH:2  fenetreJours:7
```

`examines: 0` est correct aujourd'hui : le registre ne porte **aucun** paiement
`en_attente` (6 lignes, toutes `echoue`, aucune `paye`).

Le nœud **`Signaler les paiements bloques`** lève quand un paiement reste
inhonoré plus de **2 heures**, ce qui déclenche `Alerte Erreurs` par
`settings.errorWorkflow`. **Ne jamais lui poser `onError`** : c'est sa levée qui
réveille l'exploitant. Deux heures laissent passer le normal — une transaction
`pending` que le client n'a pas encore validée sur son téléphone.

Ce nœud existe parce que le rattrapage **ratait en silence** : il rendait
`honores: 0` et l'exécution restait verte. Un paiement bloqué, c'est un marchand
qui a peut-être payé sans recevoir son accès.

---

## Deux pièges de configuration, vérifiés

**`BILLING_MODE` ne choisit rien.** `prestataireActif()` prend GeniusPay dès
qu'il est configuré, quoi que dise la variable — elle valait `cinetpay` le
22 août pendant que GeniusPay encaissait. Le diagnostic le signale par
`billingModeIgnore` (`false` au 4 septembre : les deux s'accordent).

**La sonde du diagnostic (`POST`) n'interroge que CinetPay.** Elle rendait
`INVALID_TOKEN` — un vrai refus, mais du prestataire qui n'encaisse plus. Elle
dit maintenant qui elle a interrogé ; ne lisez pas son résultat comme un verdict
sur GeniusPay.

---

## Le repli n'est pas celui qu'on croit

Le sélecteur permet techniquement de revenir à CinetPay en retirant les deux
variables GeniusPay, sans redéploiement de code — et `cinetpay.ts` est gardé
vivant exprès. **Mais le compte n'est pas ouvert chez CinetPay**, et le gérant
juge leurs exigences administratives trop lourdes. Ce n'est donc **pas** une
porte de sortie utilisable un jour de panne.

Le vrai recours, en cas d'indisponibilité de GeniusPay, est l'**activation
manuelle**, déjà dans le produit. Le 17 août, tout `geniuspay.ci` est devenu
injoignable pendant une soirée — page d'accueil comprise. La réserve « produit
jeune » n'est pas théorique.

Ce jour-là, la page de facturation affichait *« Le paiement en ligne n'est pas
encore ouvert. Écrivez-nous. »* — le message des clés manquantes, réutilisé pour
un prestataire injoignable. Il décrit un état **définitif** : le marchand
renonce, alors qu'il suffisait de réessayer. **Deux messages distincts
désormais ; ne jamais les refusionner.**

---

## Ce qui reste non éprouvé

- **Aucun paiement réel n'a jamais été honoré.** `prolongerAcces()` n'a jamais
  tourné après un encaissement véritable.
- **Le webhook GeniusPay n'a jamais livré une notification acceptée** en
  production (`success_count: 0`). Le rattrapage, lui, a déjà fonctionné en bac
  à sable.

Ces deux lignes disparaîtront le jour où le premier paiement passera. Tant
qu'elles sont là, elles disent la vérité.
