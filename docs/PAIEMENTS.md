# Encaisser pour de vrai — le jour où les clés arrivent

> État au 22 août 2026. Ce document ne dit que ce qui a été **mesuré** contre la
> production. Ce qui n'a jamais été éprouvé est signalé comme tel.

---

## Aujourd'hui, la plateforme n'encaisse rien

Vérifié de bout en bout avec un vrai compte : `POST /api/billing/checkout` rend
`200`, crée une ligne `paiements` en attente, avec le bon montant — et l'URL de
paiement est

```
https://geniuspay.ci/checkout/SANDBOX_UEXVLKMHFNDL9UZW
```

La clé GeniusPay active est une clé de **bac à sable**. Un marchand qui clique
« s'abonner » est envoyé sur une page de paiement simulée.

**La plomberie est saine ; il n'y a que les clés.** C'est la bonne nouvelle de
ce document : rien de ce qui suit n'est du développement, tout est de la
configuration et de la vérification.

---

## Les quatre gestes, dans cet ordre

### 1. Poser les clés de production

Dans Vercel → Settings → Environment Variables, sur l'environnement
**Production** :

```
GENIUSPAY_API_KEY       la clé live
GENIUSPAY_API_SECRET    le secret live
GENIUSPAY_WEBHOOK_SECRET
```

⚠ **Redéployer ensuite.** Une variable ajoutée n'est pas vue tant que le
déploiement n'a pas été refait — c'est déjà arrivé avec les clés VAPID, puis
avec `TELEGRAM_ALERTE_TOKEN`.

### 2. Retirer `GENIUSPAY_ACCEPTE_SANDBOX`

Elle vaut `1` aujourd'hui. Le code l'ignore désormais en production — mais la
laisser garde une porte ouverte sur les préproductions, et surtout elle ment sur
l'intention. Une variable posée pour un test survit toujours au test.

### 3. Déclarer le webhook CHEZ GeniusPay

**C'est le geste qu'on oublie, et il a déjà coûté.** Le 17 août 2026, GeniusPay
a confirmé un paiement de 10 000 XOF que la base a laissé `en_attente` : l'URL
du webhook n'était pas déclarée chez eux.

La création d'un paiement n'envoie **aucune URL de notification** dans sa charge
utile — contrairement à CinetPay. Le webhook se déclare une fois, dans
l'interface GeniusPay :

```
https://www.djiguiflow.com/api/billing/geniuspay/notification
```

**Le filet existe quand même** : `Rattrapage paiements` interroge le prestataire
toutes les quinze minutes et honore ce qui a été payé sans notification. Un
marchand attendra donc au pire un quart d'heure — pas son argent, mais son
accès. Ce n'est pas une raison de sauter ce geste : *une plateforme qui
n'encaisse que si un message arrive n'encaisse pas de façon fiable.*

### 4. Vérifier, avant d'ouvrir à quiconque

```bash
curl -s https://www.djiguiflow.com/api/internal/billing/diagnostic \
  -H "x-sync-secret: $SYNC_SECRET" | jq
```

Quatre lignes à lire, et rien d'autre :

| Ligne | Ce qu'on veut |
|---|---|
| `pretAEncaisser` | **`true`** |
| `pourquoi` | **`null`** |
| `prestataire.geniuspayBacASable` | **`false`** |
| `prestataire.geniuspayClesCoherentes` | **`true`** |

`geniuspayClesCoherentes` mérite un mot : une clé publique de bac à sable avec
un secret de production authentifie mal, et le message d'erreur du prestataire
ne dira **jamais** pourquoi. La valeur `null` signifie « je ne peux pas
conclure » — pas « tout va bien ».

---

## Le premier vrai paiement, et pourquoi il compte

⚠ **La dernière marche n'a jamais été franchie.** Toute la chaîne est vérifiée
jusqu'au garde du bac à sable ; ce qui vient après — `prolongerAcces()`, qui
ouvre réellement les droits — n'a jamais tourné avec un paiement réel.

Ne laissez pas un vrai marchand être le premier test. Faites-le vous-même :

1. Un compte à vous, un plan, **le plus petit montant possible**.
2. Payez pour de vrai.
3. Regardez la ligne dans `paiements` :

```sql
select reference, statut, montant_fcfa, operateur, jeton_prestataire
from public.paiements order by created_at desc limit 3;
```

`statut = 'paye'` **et** l'accès ouvert dans le tableau de bord : c'est gagné.

---

## Ce que chaque état veut dire quand ça ne va pas

`honorerPaiement` ne rend jamais un verdict qu'il n'a pas les moyens de rendre.
Les états sont conçus pour qu'aucun argent ne soit enterré :

| État | Ce qui s'est passé | Ce qu'il faut faire |
|---|---|---|
| `honore` | payé, accès ouvert | rien |
| `deja` | notification rejouée | rien, c'est l'idempotence |
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

## Deux pièges de configuration, vérifiés

**`BILLING_MODE` ne choisit rien.** `prestataireActif()` prend GeniusPay dès
qu'il est configuré, quoi que dise la variable — elle valait `cinetpay` le
22 août pendant que GeniusPay encaissait. Le diagnostic le signale par
`billingModeIgnore`.

**La sonde du diagnostic (`POST`) n'interroge que CinetPay.** Elle rendait
`INVALID_TOKEN` — un vrai refus, mais du prestataire qui n'encaisse plus. Elle
dit maintenant qui elle a interrogé ; ne lisez pas son résultat comme un verdict
sur GeniusPay.

---

## Ce qui reste non éprouvé

- **Aucun paiement réel n'a jamais été honoré.** `prolongerAcces()` n'a jamais
  tourné après un encaissement véritable.
- **Le webhook GeniusPay n'a jamais livré une notification acceptée** en
  production. Le rattrapage, lui, a déjà fonctionné.

Ces deux lignes disparaîtront le jour où le premier paiement passera. Tant
qu'elles sont là, elles disent la vérité.
