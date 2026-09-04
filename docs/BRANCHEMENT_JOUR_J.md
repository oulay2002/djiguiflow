# Brancher un marchand — le jour J

Guide de terrain, à garder ouvert **pendant** le rendez-vous.
Écrit le 4 septembre 2026 en relisant les écrans réels, pas de mémoire.

> Pour comprendre ce qui se passe sous les boutons, voir
> `docs/BRANCHER_UN_MARCHAND.md`. Ici, on agit.

---

## ⚠ À FAIRE AVANT, PAS DEVANT LE MARCHAND

### 1. Prendre le forfait wasender **Plus**

30 $/mois, **6 sessions**. Zahara plus trois marchands font quatre : il vous
reste deux places d'avance.

Ne prenez pas Business (45 $, 10 sessions) : à trois marchands, il coûte plus
qu'il ne rapporte. Le changement de forfait chez wasender est immédiat, vous
monterez le jour où vous en aurez besoin.

### 2. Faire un essai à blanc — **c'est le point le plus important de ce guide**

**Le branchement WhatsApp en libre-service n'a jamais abouti une seule fois.**
Sa seule tentative s'est arrêtée sur un « forfait plein ». Tout est éprouvé par
des tests, mais **aucun n'a réellement parlé à wasender**.

Faites-le donc une première fois **sur une boutique factice**, seul, avant le
rendez-vous. Si ça coince, vous l'apprenez tranquillement — pas avec un
commerçant qui vous regarde.

Prévenez-moi quand vous le faites : je lis les journaux pendant que c'est
frais.

---

## CE QU'IL FAUT OBTENIR DU MARCHAND

À demander **au début**, pour ne pas devoir le rappeler ensuite.

**L'indispensable**

- Le **numéro WhatsApp** de son commerce, celui qu'il donne à ses clients
- Livre-t-il, fait-il du retrait, ou **les deux** ?
- S'il livre : a-t-il **ses propres livreurs** ?

**Les cinq questions que sa vitrine doit savoir répondre**

Ce sont exactement celles que son tableau de bord lui réclamera. Autant les
recueillir maintenant :

1. Que vend sa boutique, en une phrase
2. En combien de temps il livre
3. Dans quels quartiers
4. Comment on le paie — espèces, Wave, Orange Money
5. Ses horaires d'ouverture

**Son catalogue**

Nom, prix, et **une photo** par article.

> La photo compte plus que tout le reste. Une vitrine sans images ne vend pas,
> quelle que soit la qualité du texte. S'il a des photos sur son téléphone,
> demandez-les **tout de suite** — pas « il enverra plus tard ».

---

## LE BRANCHEMENT, ÉTAPE PAR ÉTAPE

Le marchand s'inscrit, puis suit l'écran `/onboarding`. Il porte **quatre
étapes numérotées**, et l'ordre compte : chacune suppose la précédente.

### Étape 1 — Son numéro WhatsApp

Format international **sans le plus** : `2250759486701`.

C'est le numéro sur lequel la ligne sera ouverte. Vérifiez-le à voix haute
avec lui : un chiffre faux ici consomme une place du forfait pour rien.

### Étape 2 — Ses comptes de messagerie

**Pour WhatsApp**, il clique **« Connecter mon WhatsApp »**. Un QR code
apparaît.

Il le scanne depuis son téléphone : **WhatsApp → Réglages → Appareils
connectés → Connecter un appareil**.

L'écran passe au vert tout seul. **Vous n'avez rien à coller nulle part.**

**Pour Telegram** (facultatif, mais utile) : il crée son bot avec `@BotFather`
et colle le jeton. L'application branche le webhook seule.

### Étape 3 — Son identifiant Telegram

Il ne peut venir qu'après l'étape 2 : le bot doit exister pour qu'il puisse lui
écrire et relever son identifiant.

### Étape 4 — Le groupe de ses livreurs

**Seulement s'il livre.** Une boutique de retrait seul n'a pas cette étape, et
c'est normal.

### Puis, sans numéro : « Faire monter le panier »

Un bloc marqué **Facultatif**. Ce n'est pas une étape à cocher — c'est un
levier commercial : minimum de commande, et livraison offerte à partir d'un
montant.

Il n'est pas obligatoire. Mais **aucune boutique ne l'a jamais posé**, et le
seuil de livraison offerte est le levier le plus fiable du commerce pour faire
monter un panier. Ça vaut la conversation.

### Enfin : « Tester ma boutique »

Faites-le **avec lui**, avant qu'il parte. Une commande passée devant lui vaut
toutes les explications — et s'il manque quelque chose, vous le voyez tout de
suite.

---

## SI ÇA COINCE

Trois messages possibles, et ils ne veulent pas dire la même chose.

| Ce qu'il lit | Ce que ça veut dire | Ce que vous faites |
|---|---|---|
| « Nous vous rappelons très vite » | **Le forfait est plein.** Ce n'est pas une panne. | Montez de forfait, ou libérez une place |
| « Le service WhatsApp ne répond pas » | wasender est injoignable, passagèrement | Réessayez dans un instant |
| « La ligne a été ouverte mais nous n'avons pas pu la relier » | **Rare et grave.** La place est prise, mais le secret n'est pas arrivé au coffre | Prévenez-moi : l'identifiant est dans les journaux, il faut libérer la place |

**Recliquer ne coûte rien.** La plateforme refuse d'ouvrir une seconde ligne
dès qu'une existe — un second clic remontre simplement le QR. Un marchand
inquiet peut cliquer autant qu'il veut.

---

## APRÈS LE DÉPART DU MARCHAND

**Prévenez-moi le jour même.** Je vérifie ce que l'écran ne montre pas : que la
clé d'envoi **et** le secret d'entrée sont bien arrivés au coffre. Une ligne
peut envoyer sans jamais rien recevoir, et rien à l'écran ne le dirait.

Le contrôle, si vous voulez le faire vous-même :

```sql
select nom, slug,
       (wasender_secret_id is not null)           as whatsapp_connecte,
       (webhook_secret_hash is not null)          as webhook_protege,
       (telegram_secret_id is not null)           as telegram_connecte,
       (telegram_webhook_secret_hash is not null) as telegram_protege
from boutiques
order by nom;
```

**Les quatre colonnes doivent être vraies.** `whatsapp_connecte` seul ne suffit
pas : sans `webhook_protege`, il peut écrire à ses clients mais ne reçoit
jamais leurs messages.

---

## CE QU'IL NE FAUT PAS FAIRE

**Ne branchez pas deux marchands sur le même numéro.** Rien dans la base ne
l'interdit aujourd'hui, et ça poserait un vrai problème entre deux commerces
réels. Vérifiez le numéro avant l'étape 1.

**Ne supprimez pas Chez Zahara.** Elle occupe une place du forfait de façon
durable, et ce n'est pas une place perdue : c'est votre vitrine de
démonstration, celle que vous montrez pour convaincre le marchand suivant.

**Ne promettez pas une vitrine complète le jour même.** Son tableau de bord lui
dira, calmement, à quelles questions elle ne répond pas encore. C'est fait pour
qu'il complète à son rythme — sa boutique vend quand même entre-temps.

---

## APRÈS LE PREMIER MARCHAND RÉEL

- `Rose Monde` peut être supprimée. Avant, lancez `npm run verifier:production`
  une fois : s'il passe, la suppression est sans risque.
- La **libération d'une place** n'est pas automatique. Si un marchand s'en va,
  sa session se paie tous les mois tant que personne ne la supprime chez
  wasender.
