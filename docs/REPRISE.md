# Reprise après incident

> État au 22 août 2026. Ce document ne dit que ce qui a été **mesuré**. Ce qui
> n'a jamais été éprouvé est signalé comme tel — c'est la partie la plus utile.

---

## Ce qui est reconstructible, et depuis quoi

| Ce qui peut se perdre | On le retrouve où | Vérifié ? |
|---|---|---|
| Le code | GitHub, `main` | oui, en continu |
| Le schéma de la base | `supabase/reference/schema.sql`, écrit chaque jour | **le workflow n'a jamais tourné** |
| L'histoire du schéma | `supabase/migrations/` — 58 fichiers = 58 migrations | oui, par la CI à chaque push |
| Les workflows n8n | `n8n/` — 24 fichiers, export quotidien à 5 h | oui, PR à chaque écart |
| La liste des variables d'environnement | `.env.example` | oui, tirée du code |
| Les données (commandes, produits, marchands) | **rien** | **il n'existe aucune sauvegarde** |

---

## ⚠ IL N'EXISTE AUCUNE SAUVEGARDE DES DONNÉES

Vérifié le 22 août 2026 dans le tableau de bord Supabase, onglet
« Scheduled backups » : **aucune sauvegarde listée**. Le projet est sur l'offre
gratuite, qui n'en fait aucune — la page propose de passer au plan Pro pour les
activer.

Ce document affirmait auparavant que les données étaient récupérables « depuis
les sauvegardes Supabase », en signalant seulement que le chemin n'avait jamais
été éprouvé. **C'était faux, et dans le sens le plus dangereux : il n'y a rien
à éprouver.** Un document de reprise qui désigne un secours inexistant est pire
que pas de document — on ne cherche pas d'alternative tant qu'on croit en avoir
une.

Concrètement, aujourd'hui :

- une migration qui efface une colonne est **définitive** ;
- un `delete` sans `where` est **définitif** ;
- une suppression de projet est **définitive** ;
- le dépôt ne rattrape rien : `supabase/reference/schema.sql` reconstruit les
  **tables vides**, pas ce qu'elles contiennent.

Le schéma, les workflows n8n et la liste des variables sont sauvegardés. **Les
données ne le sont pas.** C'est le seul élément de cette liste qui ne se
retrouve nulle part ailleurs : le code se réécrit, une commande perdue est
perdue.

**Ce qui ne doit jamais être fait :** déposer un export de données dans ce
dépôt. Il est **public**, et un dump contient les noms, téléphones et adresses
de vrais clients. Même chiffré, même en pièce jointe d'un job : les artefacts
d'un dépôt public sont téléchargeables par n'importe qui.

---

## Ce qui n'est reconstructible depuis AUCUN dépôt

C'est la partie qu'on découvre trop tard.

**Les secrets du coffre Supabase.** Un secret de webhook partagé avec n8n, plus
un jeton par canal et par boutique — `telegram_<boutique>`,
`wasender_<boutique>`. Ils sont chiffrés
par une clé propre au projet Supabase : **restaurer dans un nouveau projet les
rend illisibles**, même si les lignes sont là. Il faut alors les ressaisir :

- les jetons Telegram viennent de `@BotFather`, **chez le marchand** ;
- le jeton wasender vient de votre compte wasender ;
- `n8n_webhook_secret` se régénère et se repose des deux côtés.

**Les valeurs des variables d'environnement.** `.env.example` dit lesquelles il
faut, jamais ce qu'elles valent. Les valeurs vivent dans Vercel. Perdre le
projet Vercel *et* votre `.env.local` veut dire tout redemander à chaque
fournisseur.

**Les identifiants n8n.** Ils vivent dans n8n, pas dans l'export. Et une
credential OAuth Google migrée **n'a pas de jeton** : elle se lit correctement,
elle échoue à l'exécution avec « Unable to sign without access token ». Elle
doit être ressaisie dans l'interface après toute migration.

**La session WhatsApp d'un marchand.** Si wasender bannit ou perd la session, il
faut rescanner un QR code — avec le marchand, sur son téléphone.

---

## Ce qui a été corrigé aujourd'hui, et pourquoi ça comptait

`AUDIT_SECURITE.md` écrivait en R6 : « une restauration reconstruirait une base
sans ses verrous. C'est le scénario qui transforme un incident en fuite. »

Le 22 août, le dépôt avait 40 fichiers de migration pour 56 en base. **Seize
migrations appliquées n'avaient aucun fichier** — dont les politiques RLS, les
`REVOKE` sur `decrementer_stock` et la liste STOP des relances. Une base
restaurée depuis le dépôt aurait été **plus ouverte que la production**.

C'est recalé (58 = 58), et le job `schema` de la CI le vérifie à chaque push.

**Une limite subsiste, et elle est le cœur de ce document :** l'historique
**n'est pas rejouable depuis zéro**. `20260805224907` déclare
`public.http_response`, un type apporté par l'extension `http` — qu'aucune
migration ne crée et que `20260817125218` supprime. Rejouer les 58 migrations
sur une base neuve **échoue à la troisième**. Vérifié statiquement et en base.

D'où `supabase/reference/schema.sql` : l'historique porte le raisonnement, la
référence porte l'état. **On ne restaure pas depuis un récit.**

---

## Cinq incidents, et le premier geste

### 1. Le VPS n8n tombe
La prise de commande continue : la vitrine écrit dans Supabase. Ce qui s'arrête,
c'est le dispatch livreurs et les notifications client.
**Le geste :** la veille (`veille-n8n.yml`, toutes les heures de 7 h à 21 h)
alerte sur `@DjiguiFlowVeille_Bot`. Redémarrer le VPS, puis vérifier qu'un
workflow s'exécute. Les 24 workflows sont dans `n8n/` si l'instance est perdue.

### 2. Un mauvais déploiement passe en production
**Le geste :** `vercel rollback`, ou repromouvoir le déploiement précédent
depuis l'interface. Puis `node scripts/essai-multi-marchand.mjs` — 26 contrôles
contre la production, qui dit si la chaîne tient.

### 3. Une migration casse le schéma
**Le geste :** écrire une migration qui répare, jamais retoucher l'historique.
Le job `schema` refusera tout écart entre le dépôt et la base, ce qui rend la
dérive visible au push suivant.

### 4. Des données sont perdues ou corrompues
**Il n'y a pas de geste.** Voir l'encart en haut de ce document : aucune
sauvegarde n'existe. C'est le seul incident de cette liste auquel on ne sait pas
répondre, et le seul dont les conséquences sont irréversibles.

### 5. La session WhatsApp d'un marchand est bannie
Ses clients ne peuvent plus lui écrire. Le tableau de bord et Telegram
continuent.
**Le geste :** rescanner un QR code avec le marchand. Et relire
`relances_stop` / `reserver_relance` : WhatsApp bannit au **premier contact non
sollicité**, pas au volume.

---

## L'exercice qui manque

Rien de ce document n'a été éprouvé sur une vraie restauration. Tant que ce
n'est pas fait, la ligne « les données sont récupérables » est une **espérance**,
pas un fait.

L'exercice tient en quatre gestes, et il devrait être fait **avant** l'ouverture
à de nouveaux marchands :

1. Vérifier dans le tableau de bord Supabase quelle sauvegarde existe, à quelle
   fréquence, et sur quelle profondeur. Le noter ici.
2. Créer une branche Supabase (ou un projet jetable) à partir de
   `supabase/reference/schema.sql`.
3. Y pointer une copie de l'application et lancer
   `BASE=<url> node scripts/essai-multi-marchand.mjs`.
4. Écrire ici ce qui a manqué. **Il manquera quelque chose** — c'est le but.

Le troisième geste est le seul qui dit la vérité : les 26 contrôles du banc
passent, ou ils ne passent pas.
