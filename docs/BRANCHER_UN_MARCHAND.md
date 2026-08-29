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

**WhatsApp est automatisé depuis le 29 août 2026.** L'écran lui montre un
bouton **« Connecter mon WhatsApp »**, puis un QR code. Il le scanne depuis
WhatsApp → *Appareils connectés*. L'écran passe au vert tout seul.

**Vous n'intervenez plus.**

---

## Ce qui se passe sous le bouton

Pour votre information — il n'y a rien à faire, mais il faut savoir où
regarder si un jour ça coince.

1. La plateforme appelle `POST /api/whatsapp-sessions` chez wasender, avec le
   numéro du marchand et **l'adresse du webhook dans la même requête**.
2. wasender rend `api_key` (la clé d'envoi) et `webhook_secret` (le secret
   d'entrée) — les deux valeurs qu'on collait autrefois à la main.
3. Elles partent directement dans le coffre, par `definir_jeton_canal` et
   `definir_secret_webhook`. **Elles ne traversent jamais l'écran.**
4. L'identifiant de session est gardé dans `wasender_session_id`, pour afficher
   le QR, suivre la connexion, et **libérer la place** si le marchand s'en va.

### Ce que le marchand peut lire, et ce que ça veut dire

| Ce qu'il voit | Ce qui s'est passé |
|---|---|
| « Nous vous rappelons très vite » | **Le forfait est plein.** Ce n'est pas une panne : à vous d'ouvrir un second forfait, ou de libérer une place. |
| « Le service WhatsApp ne répond pas » | wasender est injoignable. Réessayer suffit. |
| « La ligne a été ouverte mais nous n'avons pas pu la relier » | **Rare et grave** : la session existe — la place est prise — mais le coffre a refusé. L'identifiant est journalisé ; retrouvez-le pour la libérer. |

### Recliquer ne coûte rien

La route **refuse de créer une seconde session** dès qu'une existe. C'est
délibéré : chaque session occupe une place du forfait et se paie tous les mois.
Un marchand qui clique deux fois remontre simplement son QR.

---

## Libérer une place

Un forfait est plafonné. Une session abandonnée se paie sans rien servir.

Quand un marchand s'en va, récupérez son `wasender_session_id` :

```sql
select nom, slug, wasender_session_id from boutiques where slug = '<slug>';
```

Puis supprimez la session dans le tableau de bord wasender, ou par leur API
(`DELETE /api/whatsapp-sessions/{id}`).

> Ce n'est pas encore automatique : rien n'appelle `supprimerSession()`
> aujourd'hui. La fonction existe et est éprouvée ; il manque le geste qui la
> déclenche — départ d'un marchand, ou bouton dans l'admin.

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

`Rose Monde` sera supprimée à l'arrivée du premier vrai marchand.

**`Chez Zahara` reste, et ce n'est pas un oubli.** Elle sert de vitrine de
démonstration pour convaincre de nouveaux marchands : c'est en la montrant
qu'on explique ce que la plateforme fait. Elle occupe donc une place du forfait
WhatsApp **de façon durable** — et ce n'est pas une place perdue, c'est le coût
du démarchage.

Trois choses à savoir :

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

**La libération d'une place n'est pas automatique.** `supprimerSession()` existe
et est éprouvée, mais rien ne l'appelle : il manque le geste qui la déclenche.
Tant qu'il manque, une session abandonnée se paie tous les mois — et le
onzième marchand coûterait un forfait entier alors que des places dorment.

**Le premier branchement en libre-service n'a jamais été fait.** Le jeton de
compte n'existe que dans Vercel : la création de session a été éprouvée par
quinze tests, mais aucun n'a parlé à wasender. Le premier essai réel devrait se
faire sur une boutique factice, pas devant un marchand.
