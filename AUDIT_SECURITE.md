# Audit sécurité et robustesse — plateforme DjiguiFlow

**Date :** 17 août 2026
**Périmètre :** base Supabase (10 tables, 42 fonctions), application Next.js (50 routes API),
21 workflows n8n vivants sur `n8n.djiguiflow.com`
**Méthode :** lecture des privilèges et des politiques en base, revue des gardes de chaque
route, analyse statique des workflows puis vérification nœud par nœud de chaque constat

---

## Verdict

La plateforme est en bien meilleur état que ne le suggère une lecture rapide. Les mécanismes
délicats — isolation multi-marchand, vérification des webhooks, notification de paiement —
sont non seulement corrects mais **argumentés dans le code**, et plusieurs d'entre eux
résistent à des attaques auxquelles ils n'étaient pas censés répondre.

Les vraies failles ne sont pas dans ce qui a été pensé. Elles sont dans **deux portes
ouvertes par défaut que personne n'a refermées** : une politique de lecture publique trop
large sur `boutiques`, et une extension Postgres exécutable par les visiteurs. Aucune des
deux n'est un défaut de conception — les deux sont des réglages hérités.

| | Ce que l'audit a trouvé |
|---|---|
| Failles exploitables | **2** (fuite de colonnes sensibles, SSRF depuis la base) |
| Risques réels non exploitables aujourd'hui | 4 |
| Faux positifs levés après vérification | 11 |
| Mécanismes vérifiés sains | 8 familles |

Le point le plus important de ce rapport n'est pas une faille : c'est la **§4**, qui liste ce
qu'il ne faut PAS « corriger ». Plusieurs constats d'un analyseur générique visent du code
délibérément écrit ainsi, pour une raison documentée sur place.

---

## 1. Failles exploitables

### F1 — `boutiques` est lisible en entier par n'importe quel visiteur

**Gravité : haute.** La politique `public_read_boutiques` accorde `SELECT` au rôle `anon`
avec `USING (true)` — donc **toutes les colonnes, toutes les lignes**, à qui détient la clé
`anon`. Cette clé est publique par construction : elle est dans le paquet servi au
navigateur.

La table contient :

| Colonne | Ce qu'elle donne à un tiers |
|---|---|
| `webhook_secret_hash`, `telegram_webhook_secret_hash` | empreintes des secrets d'entrée de chaque canal |
| `wasender_session_hash` | empreinte de la session WhatsApp |
| `wasender_secret_id`, `telegram_secret_id` | pointeurs vers les entrées du coffre |
| `telegram_marchand` | l'identifiant de conversation du gérant |
| `groupe_livreurs` | l'identifiant du groupe Telegram des livreurs |
| `sheet_document_id`, `sheet_commandes`, `sheet_menu`, `sheet_notes` | le classeur des commandes et ses onglets |
| `telephone` | le numéro du marchand |

Ce qui rend le constat net, c'est la comparaison avec `/api/internal/fiche` : cette route
retire **explicitement** `webhook_secret_hash`, `telegram_webhook_secret_hash`,
`wasender_session_hash`, `wasender_secret_id` et `telegram_secret_id` avant de servir la
fiche à n8n, avec ce commentaire — « n8n conserve ses données d'exécution : tout ce qui
touche aux secrets resterait lisible dans ses journaux ». La précaution est juste. Elle est
contournée par une politique RLS qui distribue les mêmes colonnes à tout l'internet.

`sheet_document_id` est le plus concret : si le classeur d'un marchand est partagé « toute
personne disposant du lien », il donne l'historique complet des commandes.

**Correction.** Les RPC `vitrine_boutiques()`, `vitrine_boutique(p_ref)` et
`vitrine_produits(p_ref)` existent déjà et sont faites pour la vitrine publique. La
politique `USING (true)` est donc probablement devenue redondante. Deux voies :

1. supprimer `public_read_boutiques` et vérifier que la vitrine passe bien par les RPC ;
2. si une lecture directe reste nécessaire, la restreindre à une vue ne portant que le
   public (`slug, nom, description, logo_url, zone, categorie, emoji, actif`) et donner la
   politique à la vue, pas à la table.

La voie 1 est préférable : elle retire la surface au lieu de la déplacer.

**Attention en corrigeant** — une page publique qui lit la table en direct se vide dès qu'on
est connecté, parce que la politique publique ne vaut que pour `anon`. Tester déconnecté
**et** connecté.

### F2 — Un visiteur peut faire émettre des requêtes HTTP par la base

**Gravité : haute.** L'extension `http` est installée dans le schéma `public`, et le rôle
`anon` détient `EXECUTE` sur `http_post`, `http_get`, `http_put`, `http_delete`,
`http_patch`, `http_head`. Le schéma `public` étant exposé par PostgREST, ces fonctions sont
atteignables en `POST /rest/v1/rpc/http_post` avec la clé publique.

Conséquence : la base devient un relais de requêtes sortantes pour un anonyme. `http_get`
rend le corps de la réponse à l'appelant, ce qui permet d'atteindre et de lire ce que la
base voit et que l'internet ne voit pas, et d'attaquer un tiers depuis l'adresse du projet.

**Ce qui rend la correction facile : l'extension ne sert à rien.** Les trois fonctions de
notification sont passées à `pg_net` (asynchrone) le 6 août ; la seule occurrence restante
de `http_post` dans le code des fonctions est `net.http_post`, qui appartient à `pg_net`.
Aucune fonction n'utilise l'extension synchrone.

```sql
-- Vérifier d'abord qu'aucune dépendance ne subsiste, puis :
drop extension if exists http;
```

Si l'extension doit rester, au minimum :

```sql
revoke all on function public.http_post(varchar, varchar, varchar) from anon, authenticated;
-- ... et de même pour chaque signature de http_get/http_put/http_delete/http_patch/http_head
```

*Note de méthode : je n'ai pas exécuté de requête sortante pour confirmer, ce qui aurait
consisté à exercer la faille. Le constat repose sur les privilèges lus en base et sur
l'exposition du schéma `public` par PostgREST.*

---

## 2. Risques réels, non exploitables aujourd'hui

### R1 — Une empreinte absente vaut acceptation

`src/app/api/internal/fiche/route.ts:26` — `if (!attendu) return true;`. Un marchand dont
`telegram_webhook_secret_hash` est `NULL` voit son webhook accepter **n'importe quel** POST
forgé : commandes fictives, faux `callback_query` faisant défiler une livraison jusqu'à
« livrée », et messages sortants émis par son propre bot vers des destinataires choisis par
l'attaquant.

**Aujourd'hui : 0 marchand exposé.** Une seule boutique existe, et ses deux empreintes sont
posées. Mais le repli est silencieux : si `definir_secret_webhook_telegram` échoue après un
`setWebhook` réussi, le canal fonctionne et n'est plus protégé, sans aucun signal.

**Correction.** Faire du défaut un refus plutôt qu'une acceptation, et ne tolérer l'absence
d'empreinte que pour un marchand explicitement marqué « pas encore migré ». Un compteur des
boutiques à empreinte manquante dans `/api/internal/push/diagnostic` — ou une sonde comme
celle des identifiants Google — rendrait l'état visible au lieu de dormir.

### R2 — Le point d'entrée de l'assistant IA est ouvert et sans plafond

`src/app/api/assistant/route.ts` (225 lignes) appelle Mistral. Aucune authentification,
aucune limitation de débit, aucun contrôle d'origine, aucun quota : ni `429`, ni
`Retry-After`, ni compteur par adresse. Une boucle depuis n'importe où consomme le budget
Mistral du projet.

Le garde-fou en place est une consigne dans le `SYSTEM_PROMPT` (« N'invente jamais de
chiffres… »). Sur ce projet, on sait déjà qu'une consigne au LLM n'est pas un verrou : elle
n'empêche ni l'abus de volume, ni une réponse hors sujet.

**Correction.** Un plafond par adresse et par fenêtre, et un plafond global journalier qui
dégrade proprement (réponse fixe renvoyant vers la page tarifs) au lieu de couper.

### R3 — Un réessai posé directement sur l'envoi Telegram

`Envoyer réponse client` / `Send a text message` : `retryOnFail = true`, `maxTries = 3`,
`waitBetweenTries = 2000`. Si l'API Telegram délivre le message puis échoue à répondre
(délai réseau dépassé), n8n rejoue l'envoi : le client reçoit deux ou trois fois le même
message.

C'est un cousin de l'incident déjà corrigé — où un nœud levait *après* l'envoi. Le cas
restant est plus étroit (il demande une erreur postérieure à la livraison) mais il est réel,
et c'est le sous-workflow par lequel passent **tous** les messages clients.

**Correction.** Retirer `retryOnFail` du nœud d'envoi ; si un réessai est souhaité, le
placer sur une tentative *idempotente* seulement, ou faire porter la reprise par l'appelant
avec une clé de déduplication.

### R4 — Une note client peut disparaître sans trace

`Routeur WhatsApp` / `Copier note dans Supabase` et `Reception Notes Clients` /
`Copier note dans Supabase` portent `onError: continueRegularOutput` et sont **en fin de
chaîne**. Si l'écriture échoue, l'exécution est comptée réussie, rien n'est journalisé,
personne n'est prévenu : la note du client est perdue.

La nuance qui compte : pour les nœuds d'**envoi**, avaler l'erreur est un choix sain, parce
que `Envoyer réponse client` lève de son côté et déclenche `Alerte Erreurs`. Il y a donc un
signal. Ici il n'y en a aucun — c'est une écriture, pas un envoi, et rien ne relève l'échec.

**Correction.** Câbler la seconde sortie de ces deux nœuds vers un nœud qui lève, comme
`Signaler l echec` le fait pour les envois.

---

## 3. Points d'hygiène

- **Politiques sur le rôle `public`** — `paiements_select_own` et
  `push_subscriptions_select_own` visent `public` (donc `anon` inclus) au lieu de
  `authenticated`. Non exploitable : le prédicat est `auth.uid() = user_id`, et `auth.uid()`
  vaut `NULL` pour un anonyme, donc aucune ligne ne sort. À aligner sur les autres tables
  pour que la lecture de la politique ne demande pas ce raisonnement.
- **Résolution floue du marchand** — `src/app/api/internal/fiche/route.ts:62-69` retombe sur
  `ilike '%' || slug || '%'` avec un `slug` non échappé (`%` et `_` restent des
  jokers). `maybeSingle()` évite la fuite en cas d'ambiguïté — plusieurs correspondances
  donnent une erreur, donc un 404 — mais un `slug` partiel peut charger la fiche d'un
  marchand voisin sur un chemin qui porte une vérification de secret. À réserver aux
  chemins d'administration, pas au trafic de canal.
- **`Alerte Erreurs (plateforme)` est un point unique de défaillance** — c'est le seul
  workflow sans `errorWorkflow`, et c'est nécessaire : se désigner soi-même bouclerait. La
  conséquence est acceptée mais réelle : si l'alerte elle-même tombe, plus rien n'alerte. La
  panne de quota du 15 août l'a montré. Une sonde extérieure au n8n — même minimale — est le
  seul moyen de couvrir ce cas.
- **Deux systèmes de facturation coexistent** — `billing/webhook` (Stripe, signature
  vérifiée par `constructEvent`, table `subscriptions`) et `billing/cinetpay/notification`
  (table `paiements`). Deux sources de vérité pour un même droit d'accès. À trancher : si
  Stripe n'est plus utilisé, retirer la route et ses variables, sinon dire lequel arbitre.
- **Extensions dans `public`** — `http` (voir F2) et `pg_net`. `pg_net` est utilisé ; le
  déplacer dans son propre schéma reste souhaitable.
- **Protection contre les mots de passe compromis désactivée** dans Supabase Auth. Un
  interrupteur, aucun code à écrire.

---

## 4. Vérifié sain — ne pas « corriger »

Cette section vaut autant que les précédentes. Un analyseur générique signale ces points ;
les regarder de près montre qu'ils sont justes, et souvent plus solides que l'évidence.

**Les webhooks des routeurs ne sont pas ouverts.** `Routeur Telegram` et `Routeur WhatsApp`
n'ont pas d'authentification au niveau du nœud, et leur filtre s'appelle « Signature
présente ? » — il ne teste effectivement que la présence de l'en-tête. Mais l'en-tête reçu
est transmis à `/api/internal/fiche`, qui le compare en `sha256` + `timingSafeEqual` à
l'empreinte du marchand concerné, et refuse en 401 sinon. Le nœud `Charger fiche` lève par
défaut : un refus arrête la chaîne. Le déplacement est **délibéré et documenté** — comparer
dans n8n aurait imposé un secret en dur, donc un seul secret pour tous, donc un marchand
capable de se faire passer pour un autre.

**L'isolation multi-marchand est correcte partout.** Les 10 tables portent RLS. Chaque table
liée à une boutique filtre par `boutique_id IN (select id from boutiques where user_id =
auth.uid())` — jamais par une colonne dénormalisée, et jamais avec l'hypothèse d'une seule
boutique par compte. `commande_items` et `livraisons` passent par la commande, ce qui reste
juste à deux niveaux.

**Les fonctions porteuses de secrets sont fermées.** `jeton_canal`, `definir_jeton_canal`,
`secret_webhook_n8n`, `definir_secret_webhook*`, `canaux_*`, `rapport_*` : `EXECUTE` refusé
à `anon` **et** à `authenticated`, `search_path` fixé. Seules les trois `vitrine_*` sont
ouvertes, ce qui est leur rôle.

**Les 14 routes internes sont toutes gardées** par `SYNC_SECRET`, sans exception.

**La notification de paiement CinetPay ne fait confiance à rien.** Elle ne retient du corps
que la référence, puis interroge le prestataire par un appel sortant authentifié ; elle est
idempotente sur `statut = 'paye'`, contrôle que le montant encaissé est celui demandé, et
distingue « indéterminé » de « refusé » en laissant la référence en attente. L'absence de
vérification de signature est assumée et raisonnée sur place : on ne croit pas le message,
donc prouver son origine n'ajoute rien d'essentiel.

**Les garde-fous anti-doublon en mémoire statique sont bien placés.** `Alerte Stock` et
`Alerte Retard Livraison` écrivent leur registre dans le **dernier** nœud de la chaîne, et
les envois en amont tolèrent leur propre échec pour que ce nœud s'exécute quand même. Le
code dit pourquoi : n8n n'enregistre la mémoire statique qu'au terme d'une exécution
réussie, donc lever après l'écriture jetterait le registre.

**Aucun secret en dur dans les 21 workflows.** Recherche de jetons de bot Telegram,
en-têtes `Bearer`, JWT et paires clé/mot de passe : rien. Le secret wasender qui figurait en
clair dans un filtre a bien disparu.

**Aucune sortie d'erreur déclarée puis laissée dans le vide**, et **aucun appariement de
commande par téléphone** — les deux pièges qui ont déjà coûté cher ici.

---

## 5. Ordre de traitement conseillé

| # | Action | Effort | Ce que ça ferme |
|---|---|---|---|
| 1 | `drop extension http` (F2) | minutes | SSRF anonyme depuis la base |
| 2 | Restreindre `public_read_boutiques` (F1) | ~1 h avec test connecté/déconnecté | fuite des empreintes, du classeur et des identifiants Telegram |
| 3 | Refus par défaut si empreinte absente (R1) | ~30 min | forge de webhook sur un marchand mal provisionné |
| 4 | Plafond sur `/api/assistant` (R2) | ~1 h | budget Mistral ouvert |
| 5 | Retirer `retryOnFail` de l'envoi Telegram (R3) | minutes | messages clients en double |
| 6 | Câbler l'échec des deux `Copier note dans Supabase` (R4) | ~30 min | notes clients perdues en silence |
| 7 | Trancher Stripe vs CinetPay, aligner les politiques `public` | à décider | deux sources de vérité |

Les deux premières lignes sont celles qui changent la posture de sécurité. Les suivantes
suppriment des pannes silencieuses, qui sont le mode de défaillance dominant de cette
plateforme : rien ne casse visiblement, et un client ne reçoit rien.
