# Brancher un marchand — la procédure

Ce document décrit ce qui se passe réellement quand un marchand s'inscrit, et
**ce que vous devez faire à la main**. Il a été écrit en relisant le code, pas
de mémoire.

À garder ouvert le jour du premier vrai marchand.

---

## Ce que le marchand fait seul

Il s'inscrit, puis suit `/onboarding` :

1. **Son numéro WhatsApp**, au format international sans le plus —
   `2250759486701`.
2. **Telegram** : il crée son bot avec `@BotFather` et colle le jeton.
   L'application branche le webhook toute seule. **Rien à faire de votre côté.**
3. **Son catalogue**, ses horaires, ses zones de livraison.

**WhatsApp n'est pas automatisé.** L'écran le lui dit :

> « C'est nous qui ouvrons la session et la relions à votre boutique. Vous
> n'avez qu'un QR code à scanner, aucune clé à manipuler. »
> — *écrivez-nous pour recevoir votre QR*

Il vous écrit donc. La suite vous revient.

---

## Ce que vous faites, dans l'ordre

### 1. Ouvrir la session wasender

Dans votre tableau de bord wasender, créez une session pour **son** numéro.
Vous en ressortez avec une **clé d'API propre à cette session**.

> ⚠ **La session coûte ~6 USD par mois dès qu'elle est ouverte**, essai gratuit
> compris — soit environ **3 600 F par inscrit**, à votre charge tant qu'il n'a
> pas payé. Ne l'ouvrez pas avant qu'il ait fini son catalogue : une session
> ouverte pour quelqu'un qui ne revient pas est de l'argent perdu tous les mois.

### 2. Poser la clé dans le coffre

Dans l'éditeur SQL de Supabase :

```sql
select definir_jeton_canal('<slug-du-marchand>', 'wasender', '<clé API wasender>');
```

La clé part dans Vault. Seul son identifiant reste dans `boutiques` ; la valeur
ne réapparaîtra sur aucun écran, et personne d'autre ne peut la lire.

### 3. Poser le secret d'entrée

C'est le **second facteur** : il prouve qu'un message entrant vient bien de
*ce* marchand, et pas d'un autre.

```sql
select definir_secret_webhook('<slug-du-marchand>', '<un secret que vous inventez>');
```

Vous passez le secret **en clair** ; la fonction n'en garde que l'empreinte.
Notez-le de votre côté : vous en avez besoin à l'étape suivante, et il ne sera
plus jamais lisible.

> Une empreinte absente vaut **refus** depuis le 17 août 2026. Un marchand sans
> ce secret ne recevra aucun message — c'est voulu : le repli précédent
> acceptait n'importe quel POST forgé.

### 4. Déclarer le webhook chez wasender

Adresse à renseigner :

```
https://n8n.djiguiflow.com/webhook/1b96720c-e3b3-4638-a351-7f3704bd483e/whatsapp/<slug>
```

Et un en-tête :

```
x-webhook-secret: <le secret de l'étape 3>
```

> ⚠ **Le segment en uuid n'est pas décoratif.** n8n sert un webhook à la fois
> sous `/webhook/<chemin>` et sous `/webhook/<id du nœud>/<chemin>`. Seule la
> seconde est enregistrée : l'adresse sans l'uuid répond **404**, et un 404
> ressemble à un refus poli. `telegramBranchement.ts` porte le même
> avertissement pour Telegram.

### 5. Lui envoyer le QR

Il le scanne depuis son téléphone, dans WhatsApp → *Appareils connectés*.

### 6. Lui faire cliquer « Tester ma boutique »

Dans son tableau de bord. Le diagnostic envoie un **vrai** message d'essai à son
propre numéro et vérifie qu'il part **par son jeton à lui**, pas par celui de la
plateforme.

C'est le piège central : un envoi peut réussir avec le jeton de la plateforme et
donner l'illusion que tout marche, alors que le marchand n'est pas branché. Le
diagnostic refuse ce cas explicitement.

L'écran d'onboarding passe alors à **numéro connecté** puis **réception
sécurisée**.

---

## Vérifier, en une requête

```sql
select nom, slug, telephone,
       (wasender_secret_id is not null)          as whatsapp_connecte,
       (webhook_secret_hash is not null)         as webhook_protege,
       (telegram_secret_id is not null)          as telegram_connecte,
       (telegram_webhook_secret_hash is not null) as telegram_protege
from boutiques
order by nom;
```

Les quatre colonnes doivent être vraies. `whatsapp_connecte` seul ne suffit
pas : sans `webhook_protege`, il peut écrire mais ne reçoit rien.

---

## Le jour où les boutiques factices disparaissent

`Chez Zahara` et `Rose Monde` seront supprimées à l'arrivée du premier vrai
marchand. Deux choses à savoir :

**Les contrôles ne les nomment plus.** `verifier-production.mjs` les citait en
dur à quatre endroits ; il demande désormais à l'annuaire quelle boutique
existe et éprouve celle-là. La suppression ne cassera donc rien — c'était le
cas jusqu'au 29 août 2026.

**Ce qui les nomme encore, et qui est sans danger :**

- `scripts/captures-design.mjs` — des captures d'écran, à ajuster le jour où
  vous en referez.
- `scripts/audit-workflow.mjs` — il cherche au contraire des valeurs Zahara
  **écrites en dur dans n8n**, pour les signaler. Il doit rester.
- `tests/unit/csp-rapport.test.ts` — une chaîne d'exemple, pas une dépendance.

**Avant de supprimer**, faites tourner `npm run verifier:production` une fois :
s'il passe, la suppression est sans risque.

---

## Ce qui reste ouvert

**Rien n'empêche deux marchands de déclarer le même numéro.** Zahara et Rose
Monde partagent `2250759486701` aujourd'hui — sans conséquence entre boutiques
factices, mais deux vrais marchands sur un même numéro poseraient un problème
réel, et la base ne l'interdit pas.

**Le branchement WhatsApp reste manuel.** Il tient tant que les marchands
arrivent un par un. À dix inscriptions par semaine, il faudra une route de
branchement comme celle de Telegram — c'est un chantier, pas un réglage.
