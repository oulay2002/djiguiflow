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

La seule faille exploitable trouvée est **une porte ouverte par défaut que personne n'avait
refermée** : une extension Postgres exécutable par les visiteurs. Ce n'est pas un défaut de
conception, c'est un réglage hérité. Elle est corrigée (§1).

| | Ce que l'audit a trouvé |
|---|---|
| Failles exploitables | **1** — SSRF depuis la base (**corrigée le 17 août**) |
| Risques réels non exploitables aujourd'hui | 6 — dont **R6, une perte de reproductibilité du schéma**, le point le plus lourd du rapport |
| Faux positifs levés après vérification | 12 |
| Mécanismes vérifiés sains | 9 familles |

> **Correction du 17 août, après vérification.** La première version de ce rapport
> annonçait une seconde faille : `boutiques` lisible en entier par `anon`, du fait de la
> politique `public_read_boutiques USING (true)`. **C'était faux, et l'erreur méritait
> d'être comprise** — elle est décrite en §4, parce qu'elle porte une leçon utile sur la
> lecture de RLS. `anon` n'a pas le privilège `SELECT` au niveau table sur `boutiques` : il
> a un `SELECT` **par colonne** sur exactement les neuf champs de la vitrine. La défense
> était déjà là. Ce qui reste vrai, sous une forme bien plus faible, est en R5.

Le point le plus important de ce rapport n'est pas une faille : c'est la **§4**, qui liste ce
qu'il ne faut PAS « corriger ». Plusieurs constats d'un analyseur générique visent du code
délibérément écrit ainsi, pour une raison documentée sur place.

---

## 1. Failles exploitables

### F1 — retirée : c'était une erreur de lecture

Voir la correction en tête de document et la leçon en §4. Le résidu réel, de gravité bien
moindre, est traité en **R5**.

### F2 — Un visiteur peut faire émettre des requêtes HTTP par la base

> **CORRIGÉE le 17 août 2026** — migration `retirer_extension_http_non_utilisee`.
> Vérifié après application : extension absente, les six fonctions `http_*` ont disparu,
> `pg_net` intact, et le trigger `on_new_commande` sur `commandes` toujours en place.

**Gravité : haute.** L'extension `http` était installée dans le schéma `public`, et le rôle
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

> **CORRIGÉ le 17 août 2026.** `secretWebhookValide` devient `verifierSecretWebhook` et rend
> un verdict à trois valeurs : `valide`, `invalide`, `empreinte_absente`. L'absence vaut
> désormais **refus** (401 « Canal non provisionné »), et les deux refus sont journalisés
> distinctement — sans quoi un provisionnement inachevé se lit comme une tentative
> d'intrusion et on cherche au mauvais endroit. Le journal nomme la manœuvre de réparation.
> Vérifié avant d'agir : **0 marchand** concerné, donc aucun canal en service n'est fermé.

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

> **CORRIGÉ le 17 août 2026**, en trois étages plus une fuite fermée au passage.
>
> 1. **Rafale par appelant**, en mémoire du processus (`src/lib/limiteur.ts`) : 8 appels par
>    minute, contrôlée **avant** de lire le corps. Elle ne voit qu'une instance — c'est un
>    plancher, pas un plafond, et le code le dit. La clé vient de `x-real-ip` puis
>    `x-vercel-forwarded-for` ; `x-forwarded-for`, que le client peut forger, n'est qu'un
>    dernier recours.
> 2. **Plafond journalier partagé**, en base (migration `plafond_journalier_assistant`) :
>    500 appels/jour par défaut, réglable sans redéploiement. C'est lui qui protège
>    réellement la dépense, un compteur en mémoire repartant de zéro dans chaque instance.
>    L'incrément et le verdict tiennent dans une seule opération atomique
>    (`insert … on conflict … returning`), sinon deux appels simultanés dépasseraient le
>    plafond — exactement ce qu'un plafond doit empêcher. Le décompte a lieu juste avant
>    l'appel à Mistral, pas plus haut : la question de tarif sans source officielle répond
>    sans rien dépenser, et ne doit donc rien consommer.
> 3. **Borne de taille.** `sanitizeMessages` bornait le *nombre* de messages, jamais leur
>    *longueur* : un seul message de 500 ko partait tel quel, or le coût suit les jetons.
>    Désormais 2 000 caractères par message, 8 000 au total, en tronquant plutôt qu'en
>    refusant.
>
> **Choix assumé : fermé en cas de doute.** Si la base ne répond pas, on ne peut plus
> compter, donc plus protéger la dépense — le point d'entrée refuse (503). C'est la règle que
> `mode.ts` posait déjà pour la facturation : « le repli doit toujours pencher du côté qui
> n'offre rien ».
>
> **Fuite fermée au passage** : la route renvoyait `details: errorText`, le corps d'erreur de
> Mistral, au client public — il peut nommer l'organisation, un quota, un modèle. Il va
> maintenant dans les journaux.

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

> **CORRIGÉ le 17 août 2026 — et mon constat était incomplet.** Ce ne sont pas un mais
> **trois** nœuds d'envoi qui portaient `retryOnFail: true, maxTries: 3` dans
> `Envoyer réponse client` : `Send a text message` (Telegram), `HTTP Request` (wasender) et
> `Envoi via DjiguiFlow`. Mon analyseur n'avait retenu que le premier — son heuristique
> reconnaissait le type Telegram, pas un nœud HTTP au nom générique. Les trois sont des
> envois **non idempotents**, donc les trois dupliquaient au même titre.
>
> Ce qui a tranché n'est pas un principe général — la règle usuelle recommande au contraire
> `retryOnFail` sur un nœud réseau — mais **la règle que le projet a déjà écrite**, dans le
> nœud `Verdict` : « un doute ne doit jamais coûter un doublon chez le client ». Et deux
> constats : les sorties erreur des trois nœuds sont **déjà câblées** vers `Log échec` →
> `Verdict` → `Signaler l echec`, qui lève et déclenche `Alerte Erreurs` ; et sur 90
> exécutions (16-17 août) il y a **89 succès et 1 erreur**, celle-ci datant de la fenêtre de
> dépannage de la migration. Retirer le réessai ne crée donc pas une panne silencieuse : il
> transforme un doublon silencieux en échec bruyant.
>
> `Écrire log` garde son réessai : journaliser deux fois est sans conséquence, et ce n'est pas
> un envoi client. **Amélioration durable restant à faire** : une clé d'idempotence sur
> `/api/canaux/envoyer`, qui permettrait de rétablir le réessai sans risque de doublon.

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

> **CORRIGÉ le 17 août 2026, mais pas par le correctif que j'avais annoncé.** J'avais écrit
> « câbler la seconde sortie vers un nœud qui lève ». En regardant le graphe, c'était le
> mauvais geste : dans `Routeur WhatsApp`, `Enregistrer note` alimente **trois** enfants en
> parallèle — `Alerte si mauvaise note`, `Call 'Envoyer réponse client'` (la confirmation au
> client) et `Copier note dans Supabase`. Faire lever ce dernier peut préempter les deux
> autres, et le client ne reçoit plus sa confirmation. C'est le piège déjà rencontré ici :
> rendre un nœud bruyant fait tomber les branches parallèles de son voisin.
>
> Le correctif retenu est plus simple : `onError` repasse de `continueRegularOutput` au défaut
> `stopWorkflow`, sans ajouter de nœud, et `retryOnFail: true, maxTries: 3` absorbe d'abord le
> passager. Un échec **persistant** fait donc échouer l'exécution, ce qui déclenche
> `Alerte Erreurs` — les deux workflows le déclarent déjà comme workflow d'erreur.
>
> **Dépendance à l'ordre, explicite plutôt qu'implicite.** Ce correctif est sûr parce que
> `Copier note dans Supabase` est **le dernier de ses frères** : position 3/3 sous
> `Enregistrer note` dans `Routeur WhatsApp`, et seul enfant de `Référence réelle ?` — lui-même
> second — dans `Reception Notes Clients`. Leurs frères ont donc déjà tourné quand il lève.
> **Réordonner ces connexions réintroduirait le risque en silence.** Je n'ai pas pu l'observer
> sur une exécution réelle : aucune n'est conservée pour ces chemins.

`Routeur WhatsApp` / `Copier note dans Supabase` et `Reception Notes Clients` /
`Copier note dans Supabase` portent `onError: continueRegularOutput` et sont **en fin de
chaîne**. Si l'écriture échoue, l'exécution est comptée réussie, rien n'est journalisé,
personne n'est prévenu : la note du client est perdue.

La nuance qui compte : pour les nœuds d'**envoi**, avaler l'erreur est un choix sain, parce
que `Envoyer réponse client` lève de son côté et déclenche `Alerte Erreurs`. Il y a donc un
signal. Ici il n'y en a aucun — c'est une écriture, pas un envoi, et rien ne relève l'échec.

**Correction.** Câbler la seconde sortie de ces deux nœuds vers un nœud qui lève, comme
`Signaler l echec` le fait pour les envois.

### R5 — Huit tables sur dix laissent à `anon` le `SELECT` au niveau table

C'est ce qui reste, en défense en profondeur, de ce que la première version appelait à tort
F1. Deux tables ont été **délibérément durcies** par des `GRANT` de colonnes :

| Table | `SELECT` table pour `anon` | Colonnes lisibles par `anon` |
|---|---|---|
| `boutiques` | **non** | les 9 champs de la vitrine, et eux seuls |
| `produits` | **non** | les 9 champs du menu, et eux seuls |
| les 8 autres | **oui** | toutes |

Pour `commandes`, `commande_items`, `livraisons`, `livreurs`, `notification_settings`,
`paiements`, `push_subscriptions` et `subscriptions`, la seule chose qui arrête un anonyme
est donc **RLS seule**. Aujourd'hui elle tient, et j'ai vérifié pourquoi, table par table :
six n'ont de politique que pour `{authenticated}`, donc aucune ligne ne sort pour `anon` ;
les deux dernières — `paiements_select_own` et `push_subscriptions_select_own` — visent le
rôle `public`, qui inclut `anon`, mais leur prédicat est `auth.uid() = user_id` et
`auth.uid()` vaut `NULL` pour un anonyme, ce qui ne rend aucune ligne.

**Rien n'est donc exploitable.** Ce qui est fragile, c'est que la protection tienne à un seul
mécanisme, sur des tables qui portent `push_subscriptions.auth_secret`,
`paiements.jeton_prestataire`, `livreurs.telephone` et `commandes.client_telephone`. Une
future politique écrite un peu vite — le genre de `USING (true)` qu'on ajoute pour une page
de suivi publique — suffirait alors à tout ouvrir. Sur `boutiques`, la même erreur ne
donnerait rien : les `GRANT` de colonnes tiennent le second verrou.

**Correction.** Étendre aux huit autres le standard déjà appliqué à `boutiques` et
`produits` : `revoke select on <table> from anon` là où aucune lecture anonyme n'est prévue,
et un `grant select (colonnes)` explicite là où elle l'est. Aucun effet fonctionnel attendu
— aucune page publique ne lit ces tables directement — mais à tester déconnecté **et**
connecté, la lecture publique ne valant que pour `anon`.

### R6 — Le dépôt n'est plus la source de vérité du schéma

> **CORRIGÉ le 17 août 2026** — les 38 fichiers sont reconstitués depuis
> `supabase_migrations.schema_migrations.statements`, donc fidèles au texte exact appliqué,
> commentaires compris. Vérifié : 38 fichiers ↔ 38 migrations, aucun écart, aucun orphelin.
> Les 8 fichiers à préfixe 8 chiffres, que la CLI lisait comme non appliqués, sont remplacés
> après contrôle d'identité de contenu. **Une limite subsiste, documentée dans
> `supabase/migrations/README.md` : l'historique n'est pas rejouable depuis zéro**, car
> `20260805224907` déclare `public.http_response` alors qu'aucune migration ne crée
> l'extension `http` — supprimée par F2. La suite propre est une migration de référence, pas
> une retouche de l'historique.

**C'était le constat le plus lourd de cet audit**, et il n'était ni une faille ni un bug :
une perte de reproductibilité.

```
fichiers dans supabase/migrations : 8
migrations appliquées en base     : 38
appliquées SANS fichier local     : 30
```

Un environnement reconstruit depuis le dépôt n'aurait donc **aucun** des durcissements dont
ce rapport constate qu'ils tiennent : `restrict_anon_column_access`,
`restreindre_colonnes_internes_boutiques_anon`, `restreindre_definir_secret_webhook`,
`durcir_rls_et_integrite_reference`, `durcir_fonctions_utilitaires`,
`fermer_canaux_par_aux_roles_publics`, `secret_webhook_n8n_source_unique`… Les politiques
RLS, les `GRANT` de colonnes et les `REVOKE` sur les fonctions `SECURITY DEFINER` n'existent
que dans la base de production.

Trois conséquences concrètes :

1. **Aucune relecture possible** du DDL le plus sensible du projet : il n'est pas passé par
   un commit, donc il n'a jamais été relu ni comparé.
2. **Un environnement de recette serait silencieusement plus ouvert que la production** —
   des tests y passeraient qui devraient échouer.
3. **Une restauration reconstruirait une base sans ses verrous.** C'est le scénario qui
   transforme un incident en fuite.

**Correction — le SQL est intégralement récupérable, verbatim.** Supabase conserve les
instructions de chaque migration :

```sql
select version, name, statements
from supabase_migrations.schema_migrations
order by version;
```

Il suffit d'écrire un fichier `supabase/migrations/<version>_<name>.sql` par ligne
manquante, puis de comparer. `supabase db pull` fait un travail voisin mais rend un schéma
aplati, qui perd le découpage et les commentaires d'intention — or sur ce projet les
commentaires portent le raisonnement, et c'est ce qui a le plus de valeur ici.

À faire **avant** les corrections R1 à R5 : sans ça, chaque correctif suivant creuse l'écart.

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
- **Facturation — tranché le 17 août : GeniusPay est le prestataire maintenu.** Il n'y avait
  pas trois sources de vérité comme je l'avais écrit : `prestataireActif()` choisit GeniusPay
  dès qu'il est configuré et retombe sur CinetPay sinon, et **un seul** point ouvre des
  droits, `prolongerAcces()`. CinetPay reste volontairement en place — il est *injoignable*,
  pas mauvais (`api-checkout.cinetpay.com` répond NXDOMAIN), et on y revient en retirant deux
  variables, sans redéploiement. C'est une porte de sortie assumée, pas une hésitation.
  Stripe (`billing/webhook`, signature vérifiée par `constructEvent`, table `subscriptions`)
  est le seul reliquat à trancher un jour.

  Trois défauts trouvés en vérifiant ce choix, tous corrigés le 17 août :

  1. **`mode.ts` ne reconnaissait pas `geniuspay` comme un mode réel.** `MODES_REELS` était
     écrit à la main et listait `cinetpay` et `stripe`. Un `BILLING_MODE=geniuspay` hors
     production basculait donc en **simulé** — le tunnel ouvre l'accès sans qu'un franc
     circule, en silence. Le commentaire du fichier documentait déjà cette panne exacte
     pour `cinetpay` : elle s'était répétée à l'ajout du prestataire suivant. Corrigé à la
     cause : la liste vient maintenant de `PRESTATAIRES`, source unique dans
     `prestataire.ts`, si bien qu'ajouter un prestataire suffit à le faire reconnaître.
  2. **Le diagnostic mentait.** `pretAEncaisser` valait `cinetpayConfigure() && !simulé` :
     avec GeniusPay en service et CinetPay non configuré, il annonçait `false` alors que la
     plateforme encaissait parfaitement. Le filtre des variables ignorait `GENIUSPAY_*`,
     donc une faute de frappe sur `GENIUSPAY_API_SECRET` y était invisible. C'est l'outil
     qu'on ouvre pendant un incident de paiement : il envoyait chercher au mauvais endroit.
  3. **Un double défaut pouvait enterrer un paiement encaissé.** La notification cherchait
     le paiement par `jeton_prestataire`, colonne écrite à l'initialisation — mais dont
     l'échec est seulement journalisé, la vente continuant. Si en plus la charge de
     GeniusPay ne portait pas notre `metadata.reference`, la route répondait **200**
     `référence inconnue` : GeniusPay considère alors la notification délivrée et **arrête
     de réessayer**. Argent encaissé, accès jamais ouvert, une ligne de log pour seule
     trace. Le secours existait déjà sans être branché — `verifierPaiement()` rend
     `referenceInterne`, notre propre référence lue dans le `metadata` côté API. On la
     demande désormais avant de conclure, et le verdict obtenu est réutilisé pour ne pas
     faire deux appels.
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

**`boutiques` et `produits` sont déjà protégées par des `GRANT` de colonnes — et c'est là
que je me suis trompé.** J'ai lu `pg_policies`, vu `public_read_boutiques ... USING (true)`
pour le rôle `anon`, et conclu que toutes les colonnes sortaient. C'est faux, et l'erreur
vaut d'être retenue : **une politique RLS ne donne jamais accès à ce que les privilèges
refusent.** Les deux conditions se cumulent. Ici `anon` n'a pas `SELECT` au niveau table :

```sql
select has_table_privilege('anon','public.boutiques','SELECT');           -- false
-- et, par colonne :  categorie, description, emoji, id, logo_url, nom, slug, telephone, zone
select has_column_privilege('anon','public.boutiques','webhook_secret_hash','SELECT'); -- false
select has_column_privilege('anon','public.boutiques','sheet_document_id','SELECT');   -- false
```

Les neuf colonnes accordées correspondent exactement à ce que rendent les RPC `vitrine_*`.
La précaution de `/api/internal/fiche` n'est donc pas contournée du tout : elle est doublée.
`pg_policies` seul ne suffit pas à juger une lecture — il faut lire `has_column_privilege`
avec.

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

| # | Action | Effort | Ce que ça ferme | État |
|---|---|---|---|---|
| 1 | `drop extension http` (F2) | minutes | SSRF anonyme depuis la base | **fait le 17 août** |
| 2 | Reconstituer les 30 migrations manquantes (R6) | fait | schéma non reproductible, DDL sensible jamais relu | **fait le 17 août** |
| 2bis | Migration de référence pour rejouer depuis zéro (R6) | ~1 h | un environnement neuf ne se reconstruit pas | à faire |
| 3 | Refus par défaut si empreinte absente (R1) | fait | forge de webhook sur un marchand mal provisionné | **fait le 17 août** |
| 4 | Plafond sur `/api/assistant` (R2) | fait | budget Mistral ouvert, fuite du corps d'erreur | **fait le 17 août** |
| 5 | Retirer `retryOnFail` des **trois** envois (R3) | fait | messages clients en double | **fait le 17 août** |
| 6 | Retirer l'avalement des deux `Copier note dans Supabase` (R4) | fait | notes clients perdues en silence | **fait le 17 août** |
| 6bis | Clé d'idempotence sur `/api/canaux/envoyer` (suite de R3) | ~1 h | permettrait de rétablir le réessai sans risque de doublon | à faire |
| 7 | Étendre les `GRANT` de colonnes aux 8 autres tables (R5) | ~1 h avec test connecté/déconnecté | second verrou si une policy est écrite trop large | à faire |
| 8 | Facturation : GeniusPay maintenu, 3 défauts corrigés | fait | mode simulé silencieux, diagnostic faux, paiement enterré | **fait le 17 août** |
| 9 | Retirer le reliquat Stripe, aligner les politiques `public` | à décider | dernière source de vérité concurrente | à décider |

La seule ligne qui changeait la posture de sécurité immédiate est faite. La ligne 2 est
maintenant la plus importante : sans elle, chaque correctif suivant creuse l'écart entre le
dépôt et la production. **Tout le reste supprime des pannes silencieuses** — le mode de
défaillance dominant de cette plateforme : rien ne casse visiblement, et un client ne reçoit
rien. Les lignes 5 et 6 sont les moins chères et touchent le chemin par lequel passent tous
les messages clients.
