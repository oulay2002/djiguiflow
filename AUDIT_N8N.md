# Audit n8n — Système Zahara / DjiguiFlow

**Date :** 6 août 2026
**Instance :** `oulai2002.app.n8n.cloud`
**Périmètre :** 26 workflows (17 actifs)
**Méthode :** lecture du JSON déployé + analyse de 131 exécutions en erreur

---

## Verdict

Le système ne marche pas parce qu'il n'est pas *un* système. Ce sont **deux systèmes
parallèles qui ne partagent aucune donnée**, plus **deux bases de données concurrentes**,
reliés par des workflows qui se contredisent.

| | Système A — Bot | Système B — App Next.js |
|---|---|---|
| Entrée | WhatsApp / Telegram | `djiguiflow.vercel.app` |
| Cerveau | Agent IA Mistral | code applicatif |
| Stockage | feuille `Commande_Zahara` | **rien** |
| Envoi | sous-workflow `Envoyer réponse client` | appel direct wasenderapi |

Les deux ignorent l'existence de l'autre. Une commande passée dans l'app n'existe pas
pour le bot, et inversement.

---

## 1. Bugs bloquants (le système est cassé à cause d'eux)

### B1 — L'agent IA n'enregistre AUCUNE donnée de commande
**Workflow :** `Cerveau Zahara` → outil `Mettre_a_jour_commande`

Les colonnes sont mappées avec `{{ $json.customer_name }}`, `{{ $json.phone }}`,
`{{ $json.address }}`, `{{ $json.items }}`, `{{ $json.total_price }}`, `{{ $json.status }}`,
`{{ $json.order_id }}`.

Dans un nœud **outil** (`googleSheetsTool`), `$json` désigne l'item d'entrée de l'agent —
pas les arguments que le LLM fournit. Or l'item d'entrée ne contient que
`sessionId, canal, chat_id, first_name, raw_message, menu_text, timestamp`.

**Conséquence : toutes ces colonnes s'écrivent vides.** Seul `chat_id` fonctionne.

C'est la raison d'être du prompt système géant qui supplie l'agent de « passer TOUS ces
paramètres avec les VRAIES valeurs » : l'agent les fournit correctement, mais le nœud ne
les lit pas. Il faut `$fromAI('customer_name', '...', 'string')`.

### ~~B2 — Deux feuilles Google Sheets concurrentes~~ — INVALIDÉ après vérification
Hypothèse initiale : `Commande_Zahara` et `Commandes_Zahara` seraient deux feuilles
distinctes. **C'est faux.** Les nœuds qui semblent viser `Commande_Zahara` pointent en
réalité sur `gid=0`, qui *est* la feuille `Commandes_Zahara` ; seul le libellé de cache du
document (`cachedResultName`) diffère et induit en erreur.

Preuve : la ligne 22 lue par `Acceptation Livraison` dans `Commandes_Zahara` (exécution
`2597`) porte le `\n` en fin d'`order_id`, signature exclusive du mapping de
`Mettre_a_jour_commande`.

**Il n'y a qu'une seule base de commandes. Aucune migration n'est nécessaire.**

### B3 — `order_id` corrompu par un `\n` — confirmé en base
`Mettre_a_jour_commande` mappe `order_id` sur `"={{ $json.order_id }}\n"` — retour à la
ligne littéral en fin d'expression.

Preuve, exécution `2597`, ligne 22 de la feuille :
```
"order_id": "ZH-22540216907-1722962392\n"
```
Toute recherche ou jointure par `order_id` échoue silencieusement.

### B4 — Le client ne reçoit jamais sa confirmation de commande
**Workflow :** `Cerveau Zahara` → `Switch`

- Sortie 0 (« validée ») → `Get row(s)` → `Livraison Zahara` + journalisation
- Sortie 1 (fallback) → `Call 'Envoyer réponse client'`

`Envoyer réponse client` n'est branché **que sur le fallback**. Quand le client confirme
sa commande, la branche « validée » ne lui répond rien. Silence total au moment le plus
critique du parcours.

### B5 — Routage sur le texte libre du LLM
Même `Switch` : la condition est `$json.output` **contains** `"validée"`, en
`caseSensitive: true` et `typeValidation: strict`. Si Mistral écrit « Validée »,
« validee », « c'est validé » ou reformule, la commande part en fallback et n'est jamais
traitée. Le routage métier doit lire le statut en base, pas la prose du modèle.

### B6 — `Envoyer réponse client` bascule sur Telegram par défaut
`If canal == 'whatsapp'` → sinon **Telegram**. Un `canal` vide ou inconnu part sur
Telegram avec un `chat_id` WhatsApp.

Preuve, exécution `2267` :
```
payload reçu : {"message":"⭐ Merci  ! Ta note de 2/5 est bien enregistrée..."}
erreur       : 400 - Bad Request: chat_id is empty
```
`canal` et `destinataire` sont absents du payload → branche Telegram → 400.
**C'est la source de la majorité des 131 erreurs.**

### B7 — Le système de notes WhatsApp est mort
**Workflow :** `Routeur WhatsApp` → nœud `Commande admin ?`

```json
"leftValue": "texte",  "operator": "contains",  "rightValue": "/"
```
`leftValue` est la **chaîne littérale** `"texte"`, pas l'expression `{{ $json.texte }}`.
La condition est donc toujours fausse : 100 % du trafic part sur la branche `Cerveau`.
La branche `Lire commandes client → Aiguilleur note → Enregistrer note` n'est **jamais**
atteinte.

Bonus : même corrigée, la logique est inversée — « contient `/` » (commande admin) mène
vers la lecture des commandes client au lieu du cerveau.

### B8 — Prénom vide dans les messages clients
`Call 'Envoyer réponse client'` lit `{{ $json.prenom }}`, mais son entrée vient de
`Enregistrer note` (Google Sheets) qui produit `client_name`, pas `prenom`.

Preuve, exécution `2267` : `"⭐ Merci  ! Ta note de 2/5..."` — double espace, prénom vide.

### B9 — Seules les mauvaises notes reçoivent un remerciement
`If1` teste `Number($json.note) <= 2`. La branche **true** (note ≤ 2) mène au message
« Merci ! Ta note est bien enregistrée ». La branche false n'est **pas câblée**.
Les clients satisfaits (3–5) ne reçoivent rien.

### B10 — `Alerte Retard Livraison` : la correction n'a jamais été publiée
```
versionId       : a6b3ef9a-8a23-4c17-bb36-86c0bc5a94e0   (brouillon, code correct)
activeVersionId : 639c3e8c-e8ba-4599-bd11-ed2a124d96a6   (en production, code buggé)
```
La version en production filtre sur `status !== 'en_livraison'`. **Aucun workflow n'écrit
jamais cette valeur** (statuts réels : `en_cours`, `validee`, et `statut_livraison` =
`parti`/`en_route`/`livre`). L'alerte retard ne s'est donc jamais déclenchée depuis sa
création.

### B11 — Numéro de téléphone client écrasé par `0000000000`
**Workflow :** `Acceptation Livraison Zahara` → `Corriger téléphone`

Preuve, exécution `2597` :
```
Trouver la commande   → phone: 140216907        (0 initial déjà perdu : stocké en nombre)
Préparer données      → phone absent            (le nœud ne le transmet pas)
Corriger téléphone    → phone: "0000000000"     (fallback appliqué)
```
Le livreur reçoit un numéro bidon. Le client est injoignable.

### B12 — Quota Google Sheets saturé
Exécution `2597` :
```
429 RESOURCE_EXHAUSTED — Write requests per minute — quota_limit_value: 8000
```
Google Sheets est utilisé comme base transactionnelle : écriture à **chaque message**
du client (`Mettre_a_jour_commande`), plus journalisation, plus logs d'envoi, plus les
retries (3 × 2 s) qui amplifient la saturation.

---

## 2. Bugs graves (données fausses, comportements silencieux)

### B13 — Les callbacks livreur sont interprétés comme des notes client
`Routeur Telegram` envoie **tous** les `callback_query` vers `Reception Notes Clients`,
qui fait `parseInt(parts[1])` sur `data.split('_')`.

Un callback `parti_22540216907` donne `note = 22540216907`. Des notes aberrantes sont
écrites dans la feuille des avis.

### B14 — Deux workflows écoutent le même bot Telegram
`Routeur Telegram` et `Acceptation Livraison Zahara` ont chacun un `telegramTrigger` sur
le même bot. Telegram n'accepte **qu'une seule URL de webhook par bot** : la dernière
activation écrase la précédente. L'un des deux ne reçoit rien, de façon imprévisible
selon l'ordre d'activation.

### B15 — Mise à jour de statut par `chat_id`, pas par `order_id`
`Update statut - parti` utilise `matchingColumns: ["chat_id"]`. Un client avec deux
commandes voit ses deux lignes écrasées, ou la mauvaise.

### B16 — `Commande App` n'enregistre rien
Le webhook `commande-app` notifie le client et alerte les livreurs, mais **n'écrit la
commande dans aucune feuille**. Pas de suivi possible, dashboard vide, notes impossibles.

### B17 — Deux Code Tools qui plantent à l'appel
`Formater réponse suivi` et `Filtrer commandes récentes` sont des `toolCode`
(`@n8n/n8n-nodes-langchain.toolCode`) et utilisent `$input.first()` / `$input.all()`.

`$input` **n'existe pas** dans le sandbox du Code Tool. De plus `Formater réponse suivi`
retourne `[{json:{...}}]` alors qu'un Code Tool doit retourner une **string** →
« Wrong output type returned ».

### B18 — Perte du `0` initial des numéros ivoiriens
`chat_id: Number($json.phone) || 0` dans `Commande App` : `"0140216907"` → `140216907`.
Confirmé en base (exécution `2597`).

### B19 — `padStart` sur `undefined`
`String($json.phone).padStart(10, '0')` produit `"0undefined"` quand `phone` est absent.
Présent dans `Cerveau Zahara`, `Commande App`, `Mettre_a_jour_commande`.

### B20 — Colonne de log inexistante
`Envoyer réponse client` écrit dans une colonne `" statut"` (**espace initial**). Le
statut ok/ERREUR n'atterrit nulle part.

### B21 — Filtres silencieux
`Callback valide ?` (`Reception Notes Clients`) et `Statut change ?` (`Statut Livraison`)
sont des nœuds **Filter** : ce qui ne passe pas disparaît sans trace ni alerte.

### B22 — `Livraison Zahara` : Switch décoratif
Les deux sorties (`Express` / `Standard`) pointent vers **le même nœud**. Aucune
différence de traitement. Logique morte.

### B23 — Aucune commande écrite avec un statut « en attente livreur »
`Livraison Zahara` envoie le message au groupe mais ne journalise rien. Si le message
Telegram échoue, la commande disparaît sans trace.

---

## 3. Sécurité

> **Mise à jour du 6 août 2026 — phase 1 faite, voir §6ter.** Tous les appelants envoient
> désormais un secret ; il reste à activer la vérification côté n8n.

- **Les 5 webhooks sont non authentifiés.** `commande-app`, `nouvelle-commande`,
  `nouvelle-livraison`, `statut-livraison`, `whatsapp-zahara` acceptent n'importe quel
  POST. Un tiers peut déclencher des envois WhatsApp vers des clients arbitraires.
  `wasenderapi` envoie bien `x-webhook-signature`, mais **rien ne la vérifie**.
- **Aucune validation de charge utile.** `$json.body.id.toString()` dans
  `Nouvelle Commande → WhatsApp` lève une `TypeError` sur un body sans `id`.
- **`responseMode: immediate` partout.** L'app Next.js reçoit toujours
  « Workflow got started. », jamais le résultat réel ni l'erreur.

---

## 4. Hygiène de l'instance

- **9 workflows hors périmètre** (`My workflow` 1–7, `My Sub-Workflow 1`, `Angie`) —
  exclus de l'audit à la demande du propriétaire. Non analysés, non modifiés.
- **Aucun `errorWorkflow`** configuré sur aucun workflow. Les 131 erreurs n'ont alerté
  personne.
- **4 copies de la logique d'envoi WhatsApp** : `Envoyer réponse client`,
  `Assignation Livreur`, `Statut Livraison`, `Nouvelle Commande → WhatsApp`.
- **Doublon fonctionnel** : `Commande App` et `Nouvelle Commande → WhatsApp` traitent le
  même événement métier via deux webhooks distincts.

---

## 5. Non couvert par cet audit

Analysés en profondeur (10) : `Routeur WhatsApp`, `Routeur Telegram`, `Cerveau Zahara`,
`Envoyer réponse client`, `Commande App`, `Livraison Zahara`, `Reception Notes Clients`,
`Assignation Livreur`, `Statut Livraison`, `Alerte Retard Livraison`,
`Nouvelle Commande → WhatsApp`.

Partiellement analysé : `Acceptation Livraison Zahara` (via ses exécutions uniquement).

**Complété en seconde passe (§6bis) :** `Acceptation Livraison Zahara`,
`Alerte Stock Zahara`, `Hygiène Zahara`, `Resumé Quotidien Zahara`, `Resumé Hebdo Zahara`,
`Dashboard Gérant Zahara`.

**Hors périmètre :** les 9 workflows sans nom métier et `Angie`.

Les **17 workflows Zahara actifs sont donc tous audités.**

---

## 6bis. Corrections appliquées le 6 août 2026

### La cause racine derrière la cause racine

`update_workflow` enregistre un **brouillon**. Sans appel explicite à `publish_workflow`,
`activeVersionId` continue de pointer sur l'ancienne version et **rien ne change en
production**. C'est ce qui a rendu B10 invisible, et probablement ce qui a fait échouer
tes corrections précédentes : le travail était fait, jamais déployé.

### Corrigé et publié

| Workflow | Bugs traités |
|---|---|
| `Cerveau Zahara` | B1 `$fromAI` sur les 8 colonnes · B3 `\n` retiré · B4 réponse client systématique · B5 routage normalisé · B17 les 2 Code Tools cassés supprimés · maxTokens 300 → 800 |
| `Envoyer réponse client` | B6 `If` → Switch 3 voies (WhatsApp / Telegram / Invalide), destinataire non vide exigé, branche invalide journalisée · `retryOnFail` sur les 2 envois |
| `Routeur WhatsApp` | B7 condition littérale `"texte"` → test regex · B8 prénom lu depuis `Aiguilleur note` · B9 sortie false d'`If1` câblée |
| `Routeur Telegram` | B13 Switch par préfixe : `note_` → notes, message → cerveau, callbacks livreur ignorés |
| `Reception Notes Clients` | B13 garde sur le préfixe `note_` + contrôle 1–5 |
| `Commande App` | B16 nœud `Enregistrer commande` (appendOrUpdate sur `order_id`) · B18 `chat_id` normalisé comme `Normalisateur WA` |
| `Alerte Retard Livraison` | B10 version corrigée **publiée** |
| `Nouvelle Commande → WhatsApp` | garde sur `body.id` (TypeError) · `retryOnFail` |
| **`Alerte Erreurs Zahara`** (nouveau, `NmqgHQNhvqyaBQQp`) | Error Trigger → alerte Telegram gérant, branché comme `errorWorkflow` sur **13 workflows** |

### Drift constaté sur l'outillage

- Le pointeur JSON de `setNodeParameter` **ne descend pas dans les tableaux**
  (`/conditions/conditions/0` échoue). Il faut passer par `updateNodeParameters` avec
  `replace: true`.
- Le validateur signale `Missing discriminator "parameters.resource"` sur **tous** les
  nœuds Telegram, en attendant `chat`/`callback`/`file`. L'enum omet `message`, qui est la
  valeur réellement utilisée par les nœuds fonctionnels en production (exécution `2267`).
  **Faux positif** — ne pas « corriger ».

### Seconde passe — `Acceptation Livraison` et les 6 workflows restants

| Workflow | Bugs traités |
|---|---|
| `Acceptation Livraison Zahara` | **B11** `Préparer données Switch` ne recopiait pas `phone` → `Corriger téléphone` produisait `0000000000` · **NOUVEAU** les branches `accept`/`refuse` n'écrivaient rien en base (ajout de `Update statut - accepte`) · **NOUVEAU** `Demander note client` émettait des callbacks `note_5__` vides · **B15** `order_id` embarqué dans les `callback_data` et utilisé comme clé de matching · `heure_livraison` désormais renseignée |
| `Alerte Stock Zahara` | **Brouillon non publié** (lisait `Journal_Zahara`, la prod lisait `Commandes_Zahara`) · filtre `status='validee'` manquant : les paniers en collecte étaient comptés comme des ventes |
| `Resumé Quotidien Zahara` | Basculé de `Journal_Zahara` vers `Commandes_Zahara` — les commandes du webhook `commande-app` n'atteignaient jamais le journal, le rapport sous-comptait · `Lire Journal` supprimé (une lecture Sheets de moins) |
| `Resumé Hebdo Zahara` | **Ordre d'exécution implicite** : les 3 branches partaient en parallèle du trigger, `Calcul Hebdo` ne fonctionnait que grâce à sa position sur le canvas → chaînage explicite · même bascule de source |
| `Dashboard Gérant Zahara` | `Edit Fields` lisait `$json.message.text` sans garde : un sticker ou une photo rendait `message_text` indéfini et faisait échouer le Switch en `typeValidation: strict` |
| `Hygiène Zahara` | **Aucun bug.** Le mieux construit du lot : deux garde-fous explicites, suppression en ordre décroissant de `row_number`. `errorWorkflow` branché uniquement. |

### Troisième passe — B14, fusion des triggers Telegram

Le propriétaire a confirmé que les **trois `telegramTrigger` visaient le même bot**. Telegram
n'accepte qu'une URL de webhook par bot : la dernière activation écrasait les précédentes,
donc au plus un des trois recevait quoi que ce soit. Cela expliquait pourquoi
`Routeur Telegram` n'avait plus rien reçu depuis le 5 août 09:37 alors qu'`Acceptation
Livraison` recevait encore le 6 août à 16:00.

`Routeur Telegram` devient le **trigger unique**. Son `Aiguilleur Telegram` passe à 5 voies :

| Sortie | Condition | Destination |
|---|---|---|
| 0 | `callback_query.data` commence par `note_` | `Reception Notes Clients` |
| 1 | `callback_query.data` matche `^(accept\|refuse\|parti\|en_route\|livre)_` | `Acceptation Livraison Zahara` |
| 2 | message texte commençant par `/` | `Dashboard Gérant Zahara` |
| 3 | tout autre message texte | `Normalisateur TG` → `Cerveau Zahara` |
| 4 | reste | ignoré, non connecté |

`Acceptation Livraison Zahara` et `Dashboard Gérant Zahara` ont vu leur `telegramTrigger`
remplacé par un `executeWorkflowTrigger` (entrée `callback_query` / `message`, typée objet).

Vérification préalable : **aucun nœud aval de ces deux workflows ne référençait
`$('Telegram Trigger')`**, la conversion est donc transparente pour le reste de la logique.

Note : `Hygiène Zahara` va supprimer les lignes à `order_id` vide produites par B1. Si
elles dépassent 30 % de la feuille, son garde-fou lève une erreur — désormais visible via
`Alerte Erreurs Zahara` au lieu d'échouer en silence.

### Quatrième passe — v10.2, le webhook devient réellement générique

Jusqu'ici l'app envoyait `boutique_id` et `sheetCommandes` dans le webhook `commande-app`,
mais **aucun workflow ne les lisait** : tout ciblait `Commandes_Zahara` et le groupe
Telegram `-1004461402565` en dur.

| Workflow | Ce qui devient dynamique |
|---|---|
| `Commande App` | `Données commande` extrait `boutique_id`, `boutique_nom`, `sheetCommandes`, `groupeLivreurs` du body · `Enregistrer commande` écrit dans `{{ $json.sheetCommandes }}` · `canal` passe de `whatsapp` à `app` (la commande vient de l'app ; WhatsApp n'est que le canal de notification) |
| `Livraison Zahara` | le `chatId` du groupe livreurs vient de l'entrée `groupeLivreurs` · le nom de la boutique apparaît dans l'en-tête du message (avec plusieurs boutiques, un livreur doit savoir de qui vient la course) |
| `Acceptation Livraison Zahara` | les **5 nœuds Sheets** résolvent la feuille via `Config marchand` |

**Comment le tenant est identifié sur un callback livreur.** `callback_data` est limité à
64 octets par Telegram et en consomme déjà ~45 (`accept_<chat_id>_<order_id>`) : y ajouter
le `boutique_id` aurait débordé. Mais chaque boutique a **son** groupe livreurs, donc le
groupe d'où vient le callback identifie le marchand. `Config marchand` fait la
correspondance `callback_query.message.chat.id` → ligne du registre → `sheetCommandes`.

Le nœud `Registre marchands` est en `continueRegularOutput` + `alwaysOutputData` : un
onglet `Marchands` absent ne casse pas la livraison, `Config marchand` retombe sur
`Commandes_Zahara`.

**Repli partout.** Chaque valeur a un défaut Zahara (`sheetCommandes || 'Commandes_Zahara'`,
`groupeLivreurs || '-1004461402565'`). Conséquence : tant que l'onglet `Marchands` n'existe
pas, **le comportement actuel est strictement inchangé**. `Cerveau Zahara`, qui appelle
`Livraison Zahara` sans passer ces champs, continue de fonctionner par le repli.

Coût : une lecture Sheets supplémentaire par callback livreur (quelques-unes par commande),
à mettre en regard du quota déjà tendu — cf. B12.

## 6ter. Sécurisation des webhooks — phase 1

Les 5 webhooks acceptaient n'importe quel POST. Qui connaissait l'URL pouvait déclencher
des envois WhatsApp vers des clients arbitraires, ou injecter de fausses commandes.

**Qui appelle quoi** (établi, pas supposé) :

| Webhook | Appelant | Secret envoyé |
|---|---|---|
| `whatsapp-zahara` | wasenderapi (externe) | **déjà** : `x-webhook-secret`, valeur stable vérifiée sur 2 exécutions à 2 jours d'écart |
| `commande-app` | app Next.js (`N8N_COMMANDE_APP_URL`) | ajouté : `x-djiguiflow-secret` |
| (notif client) | app Next.js (`N8N_NOTIF_CLIENT_URL`) | ajouté : `x-djiguiflow-secret` |
| `nouvelle-commande` | trigger Postgres `notify_n8n_new_commande` | ajouté |
| `nouvelle-livraison` | trigger Postgres `notify_n8n_new_livraison` | ajouté |
| `statut-livraison` | trigger Postgres `notify_n8n_statut_livraison` | ajouté |

Le secret est stocké dans **Supabase Vault** (`n8n_webhook_secret`), jamais en dur dans le
code SQL ni applicatif.

**Correction de robustesse au passage.** `notify_n8n_new_livraison` et
`notify_n8n_statut_livraison` utilisaient l'extension `http` en **synchrone, sans aucune
gestion d'erreur** : un n8n injoignable faisait échouer la transaction, donc bloquait
l'assignation d'un livreur ou le changement de statut. Les trois fonctions utilisent
maintenant `pg_net` (asynchrone) avec `exception when others`.

Vérifié en conditions réelles : lecture du Vault depuis une fonction `SECURITY DEFINER` à
`search_path` vide (43 caractères lus), puis `net.http_post` sortant avec l'en-tête et
réponse HTTP reçue. Les 3 triggers sont actifs et pointent sur les nouvelles fonctions.

**L'ordre compte.** Ajouter l'en-tête ne casse rien : n8n ignore les en-têtes inconnus.
Activer la vérification avant que l'appelant n'envoie le secret coupe la production. D'où
la séparation en deux phases.

### Phase 2 — à faire (ne peut pas être automatisée depuis le MCP)

Le serveur MCP n8n officiel n'expose que `list_credentials` : **impossible de créer une
credential**, or l'auth par en-tête d'un nœud Webhook en exige une.

1. Dans n8n, créer deux credentials **Header Auth** :
   - `DjiguiFlow — appelants internes` : nom `x-djiguiflow-secret`, valeur = le secret du Vault
   - `WasenderAPI` : nom `x-webhook-secret`, valeur = celle envoyée par wasenderapi
2. Sur Vercel, définir `N8N_WEBHOOK_SECRET` (même valeur que le Vault) — **avant** l'étape 3,
   sinon les commandes app partiront sans secret.
3. Sur chaque nœud Webhook, passer `Authentication` sur *Header Auth* et sélectionner la
   credential correspondante, puis **publier** (cf. la règle du brouillon, §6bis).

## 6quater. Zéro initial des numéros ivoiriens

Diagnostic par inspection du type effectif de chaque cellule :

| Écrivain | `order_id` | Stockage | Résultat |
|---|---|---|---|
| n8n | `ZH-…` | **NOMBRE** | `0102918886` → `102918886` |
| App Next.js | `APP-…` | texte | correct |

Le nœud Google Sheets de n8n écrit en `USER_ENTERED` par défaut : Sheets
interprète la chaîne comme un nombre et supprime le zéro de tête. L'app utilise
déjà `valueInputOption=RAW`, d'où l'asymétrie.

**Deux barrières posées :**

1. `cellFormat: RAW` sur les trois nœuds n8n qui écrivent `phone` —
   `Enregistrer commande`, `Mettre_a_jour_commande`, `recommander_commande`.
2. Colonne `phone` (C) passée au format **TEXTE** dans la feuille : couvre aussi
   la saisie manuelle et tout futur nœud mal configuré.

**Données réparées :** 6 cellules à 9 chiffres restaurées (`101010418` →
`0101010418`), uniquement celles dont la version corrigée commence par un
préfixe ivoirien connu (01/05/07/21/25/27).

**Deux valeurs laissées intactes**, non récupérables par inférence :
`1373738` (7 chiffres, saisie invalide) et `22890123383` (indicatif 228, Togo).

Vérifié en écrivant `0102030405` via n8n après correctif : la cellule reste du
texte et conserve son zéro.

### Reste à faire

- **B12 quota Sheets 429** — structurel. `Dashboard Gérant` lit 4 feuilles à chaque commande.
- **Sécurité §3** — les 5 webhooks restent non authentifiés.
- **`Journal_Zahara` est orphelin** — plus aucun rapport ne le lit. `Journaliser commande`
  continue d'y écrire via un nœud amont défectueux (`Extraire commande complète` prend la
  ligne au timestamp global maximum, pas celle du client). À supprimer ou à réparer.
- **Prompt système du `Cerveau`** — ses instructions de passage manuel de paramètres sont
  devenues obsolètes avec `$fromAI`. Non réécrit : une section n'a pas pu être lue en
  entier, la réécrire à l'aveugle risquerait de perdre des règles métier.

### Périmètre

Les 9 workflows sans nom métier (`My workflow` 1–7, `My Sub-Workflow 1`) et `Angie` sont
**hors périmètre** par décision du propriétaire : ni analysés, ni modifiés.

Seule conséquence sur les conclusions ci-dessus : `My workflow 5` est actif avec un
trigger et n'est pas lisible par l'API (`availableInMCP: false`). S'il portait un
`telegramTrigger`, il entrerait dans la collision B14. Les 17 workflows Zahara actifs
suffisent déjà à l'expliquer.

---

## 7. Ordre de correction recommandé

**Étape 0 — arrêter l'hémorragie (aucun risque)**
1. Publier la version corrigée d'`Alerte Retard Livraison` (B10).
2. Désactiver les workflows de test actifs (B14 / hygiène).
3. Créer un workflow `Error Trigger` global et le câbler comme `errorWorkflow` partout.

**Étape 1 — unifier les données (prérequis à tout le reste)**
4. Choisir **une** feuille de commandes et migrer (B2).
5. Retirer le `\n` de `order_id`, passer toutes les clés en texte (B3, B18).
6. Faire écrire `Commande App` dans cette feuille (B16).

**Étape 2 — réparer l'agent**
7. Passer `Mettre_a_jour_commande` en `$fromAI(...)` (B1).
8. Router sur le statut en base, pas sur `output` (B5), et brancher la réponse client sur
   la branche « validée » (B4).
9. Réécrire ou supprimer les deux Code Tools (B17).
10. Réduire drastiquement le prompt système, devenu inutile une fois B1 corrigé.

**Étape 3 — réparer les canaux**
11. `Envoyer réponse client` : Switch 3 voies avec branche erreur explicite (B6).
12. `Routeur WhatsApp` : corriger `Commande admin ?` et l'inversion des branches (B7).
13. Corriger prénom (B8) et brancher la sortie false d'`If1` (B9).
14. Aiguiller les callbacks Telegram par préfixe (B13) et résoudre la collision de bot (B14).

**Étape 4 — fiabiliser**
15. Matching par `order_id` partout (B15).
16. Réduire les écritures Sheets, ou migrer vers Supabase (B12) — le projet a déjà Supabase.
17. Vérifier `x-webhook-signature` sur les webhooks publics (§3).
