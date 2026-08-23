# Remonter n8n après la perte du VPS

> État au 23 août 2026. Ce document ne dit que ce qui a été **mesuré** contre la
> production du jour. Ce qui n'a jamais été éprouvé est signalé comme tel.

n8n n'est pas un composant parmi d'autres : tant qu'il est à terre, **aucune
commande n'est traitée et aucun livreur n'est alerté**. Le 15 août 2026, un
quota épuisé a mis la plateforme entièrement à l'arrêt, et ce qui aurait dû
prévenir vivait dans n8n — donc s'est tu.

Ce manuel existe parce que la reconstruction a déjà été faite une fois, le
16 août, et que **le savoir-faire n'était nulle part dans le dépôt**.

---

## Ce qui survit à la perte du VPS

Vérifié le 23 août :

| Ce qu'on croit perdu | En réalité |
|---|---|
| Les 24 workflows | Dans `n8n/`, exportés chaque nuit à 5 h UTC, en PR relue |
| Le schéma de la base | `supabase/reference/schema.sql`, filigrané de sa dernière migration |
| Les données | Export quotidien, dépôt privé |
| Le sous-domaine | `n8n.djiguiflow.com` vit au DNS, pas sur la machine |
| Savoir que c'est tombé | `veille-n8n.yml` tourne sur GitHub Actions, **hors du VPS** |

Ce dernier point est le plus important, et il a été vérifié : la sonde alerte
« n8n est injoignable depuis la sonde » après plusieurs essais, toutes les
heures. Elle est indépendante de ce qu'elle surveille — c'est la leçon du
15 août, et elle est appliquée.

---

## Ce qui ne survit pas

**L'instance perd son identité, pas ses définitions.** Les workflows reviennent
en quelques minutes depuis `n8n/`. Ce qui ne revient pas :

### 1. Les sept identifiants — 70 nœuds

Aucune API ne les exporte : ils vivent chiffrés dans la base de n8n et nulle
part ailleurs.

| Identifiant | Nœuds | Ce qui tombe sans lui |
|---|---:|---|
| `Header Auth account 2` (`x-sync-secret`) | 47 | 22 workflows sur 24 — presque tout |
| `Google Sheets account` | 13 | Menus, journaux, rapports hebdo |
| `Header Auth account` (`x-djiguiflow-secret`) | 4 | Les webhooks entrants |
| `Telegram Veille DjiguiFlow` | 3 | Les alertes techniques |
| `Telegram account` | 1 | La réponse au client |
| `Bearer Auth account` (wasender) | 1 | Voie de secours WhatsApp |
| `Mistral Cloud account` | 1 | L'assistante |

⚠ **Ne jamais se fier au nom d'un identifiant.** Entre les deux instances les
noms sont croisés : ce que le Cloud appelait `Header Auth account 2` s'appelle
`Header Auth account` sur le VPS, et inversement. S'y fier avait mis 29 nœuds en
401, sans le moindre message. **Lire le champ « Name », qui porte le nom de
l'en-tête HTTP.**

### 2. `N8N_ENCRYPTION_KEY`

Elle ne figure **nulle part dans ce dépôt** — vérifié. Sans elle, même une
sauvegarde de la base de n8n est illisible : les identifiants restent chiffrés.

⚠ **ELLE N'EST PAS DANS `/docker/n8n/.env`.** Ce document l'y plaçait ; c'est
faux, et vérifié sur la machine le 23 août 2026 : `grep N8N_ENCRYPTION_KEY
/docker/n8n/.env` ne rend **rien**. n8n en génère une au premier démarrage et la
range dans son propre dossier, à l'intérieur du conteneur :

```
docker exec n8n-n8n-1 cat /home/node/.n8n/config
```

La valeur est celle du champ `encryptionKey`. Les deux conteneurs de
l'installation Hostinger sont `n8n-n8n-1` et `n8n-traefik-1`.

**C'est le pire endroit possible pour une valeur irremplaçable** : un fichier
dans un conteneur, sur un seul disque, que personne n'a jamais lu. Un manuel qui
envoie au mauvais fichier le jour d'un incident est pire qu'un manuel absent —
d'où cette correction.

### 3. La connexion OAuth Google

Remplir Client ID et Client Secret **ne suffit pas** : le bouton « Sign in with
Google » reste à cliquer, et rien ne le signale avant la première exécution, qui
échoue sur `Unable to sign without access token`. L'URI
`https://n8n.djiguiflow.com/rest/oauth2-credential/callback` doit être déclarée
dans Google Cloud Console, sinon `redirect_uri_mismatch`.

### 4. La configuration du conteneur

`/docker/n8n/.env` — dont `DOMAIN_NAME`, `GENERIC_TIMEZONE=Africa/Abidjan`,
`SSL_EMAIL`. La seule copie connue est `/docker/n8n/.env.sauvegarde-*`, **sur la
machine même** : elle meurt avec elle.

⚠ Le fuseau n'est pas un détail. Le VPS est arrivé sur `Europe/Berlin`, ce qui
aurait décalé de deux heures le cron 7 h-21 h de l'alerte retard.

---

## À FAIRE MAINTENANT, avant tout incident

Rien de ce qui suit ne se rattrape après coup.

1. **Mettre `N8N_ENCRYPTION_KEY` à l'abri**, hors du VPS et hors de ce dépôt
   — qui est public. Le **gestionnaire de mots de passe** du gérant, de
   préférence au coffre Supabase : mettre la clé de n8n dans Supabase lie deux
   systèmes qui doivent pouvoir tomber séparément.

   La noter avec son ORIGINE et son MODE D'EMPLOI, pas seule : un secret sans
   contexte ne sert à rien dans l'urgence.

2. **CINQ DES SEPT IDENTIFIANTS SONT DÉJÀ RÉCUPÉRABLES**, vérifié le 23 août
   2026 — il n'y a donc presque rien à rassembler :

   | Identifiant n8n | Où sa valeur vit déjà |
   |---|---|
   | `Header Auth account 2` (47 nœuds) | Vercel, `SYNC_SECRET` |
   | `Header Auth account` (les 3 webhooks) | coffre Supabase, `n8n_webhook_secret` |
   | `Telegram account` | coffre, `telegram_zahara` |
   | `Bearer Auth account` (wasender) | coffre, `wasender_zahara` |
   | `Telegram Veille DjiguiFlow` | GitHub, `TELEGRAM_ALERTE_TOKEN` |
   | `Mistral Cloud account` | **nulle part** — ré-émissible en console |
   | `Google Sheets account` | **nulle part** — et l'OAuth est à refaire à la main de toute façon |

   Le partage des rôles a été relu dans l'export du jour, pas d'après des
   notes : `Header Auth account` garde les webhooks ENTRANTS
   (`x-djiguiflow-secret`), `Header Auth account 2` sert à APPELER
   `/api/internal/*` et `/api/canaux/*` (`x-sync-secret`). Les confondre avait
   mis 29 nœuds en 401 lors de la migration.
3. **Copier `/docker/n8n/.env`** au même endroit.
4. **Poser une clé SSH sur le poste du gérant.** Il n'y en a aucune aujourd'hui :
   personne ne peut inspecter le VPS depuis ici, ni le redémarrer.

---

## L'ordre de reconstruction

Il est **contre-intuitif**, et s'en écarter casse en silence.

### 1. Machine et domaine

VPS, `n8n.djiguiflow.com`, HTTPS. Reposer `.env`, **avec l'ancienne
`N8N_ENCRYPTION_KEY`** si on veut restaurer une sauvegarde de base.

### 2. Importer les workflows depuis `n8n/`

⚠ **Élaguer `binaryMode` et `timeSavedMode` avant tout POST ou PUT.** L'API
répond `400 settings must NOT have additional properties` et **ne crée rien** —
workflow entier perdu, sur un réglage sans rapport. Voir
`scripts/migrer-n8n-vers-vps.mjs`, qui le fait déjà.

### 3. Ressaisir les sept identifiants, puis les affecter

`scripts/affecter-credentials-vps.mjs` les pose sur les 70 nœuds par l'API, sans
ouvrir un seul workflow. Il est idempotent.

Ne pas oublier le « Sign in with Google » : une seule connexion débloque les
13 nœuds Sheets.

### 4. Activer — dans l'ordre des dépendances

n8n **refuse de publier un workflow dont un sous-workflow appelé n'est pas déjà
publié**. `scripts/activer-workflows-vps.mjs` calcule cet ordre topologique.

⚠ Si la publication échoue sur
`Cannot read properties of undefined (reading 'execute')`, cela veut dire qu'un
nœud porte une `typeVersion` que la build ne sait pas instancier — **le message
ne nomme ni le nœud, ni le type, ni la version**. Le 16 août c'était
`httpRequest v4.5` contre un n8n plafonnant à 4.4. Trouvé par différence entre
les workflows qui publiaient et ceux qui échouaient.

### 5. Les pointeurs extérieurs — EN DERNIER

Tant que les workflows sont inactifs, **leurs webhooks n'existent pas** :
basculer un pointeur avant ferait tomber les commandes dans le vide, sans aucune
erreur visible.

- la fonction Postgres `notify_n8n_new_commande` (URL **en dur** dans Supabase) ;
- `N8N_COMMANDE_APP_URL` sur Vercel — **redéploiement obligatoire** ;
- le webhook Telegram de chaque bot marchand — **pas de `setWebhook` à la
  main** : passer par `POST /api/internal/telegram/brancher` ;
- le webhook wasender ;
- la configuration du serveur MCP.

⚠ Un `telegramTrigger` **gère son propre webhook**. Le poser à la main entre en
conflit.

### 6. Prouver, ne pas supposer

Une vraie commande de bout en bout. **D'abord neutraliser `Alerter livreurs`
dans `Commande App`**, sinon une vraie course part dans le groupe.

Le réflexe de diagnostic quand une commande n'arrive pas :

```sql
select id, status_code, content, created
from net._http_response order by created desc limit 5;
```

Cette table garde le code HTTP de chaque appel du déclencheur Postgres. Sans
elle, une commande disparaît **sans trace**. C'est elle qui a révélé le
`403 Authorization data is wrong!` du 16 août.

Deux faux amis à ne pas confondre avec une panne :

- `0000000000` fait échouer wasender en `422 The provided JID does not exist` —
  c'est la donnée de test, pas le canal.
- Dans `Envoyer réponse client`, le nœud Sheets `Écrire log` porte
  `onError: continueRegularOutput` : **il affiche « success » même quand il
  échoue**. Le témoin fiable est `Lire Menu` du Cerveau.

---

## Pendant la panne — ce que deviennent les commandes

Mesuré le 23 août, et c'est plus favorable qu'attendu :

- Une commande de la vitrine **est enregistrée quand même** (`statut='en_attente'`,
  `confirmation_statut` à NULL) ; le webhook n8n échoue, l'échec est journalisé,
  la commande n'est pas perdue.
- Dès que n8n revient, `rapport_retards` la rattrape : il prend tout ce qui
  n'est ni livré, ni annulé, ni panier, entre **45 minutes et 24 heures**. Le
  marchand l'apprend à l'heure suivante.
- **Au-delà de 24 heures d'interruption, la commande sort de cette fenêtre et
  plus personne n'en entend parler.** C'est la borne réelle du système.
- Le client, lui, n'est prévenu de rien dans tous les cas : ni confirmation, ni
  suivi.

Les commandes arrivées par WhatsApp ou Telegram, elles, ne laissent **aucune
trace** : sans n8n, le message n'est jamais lu et aucune ligne n'est créée.

---

## Ce qui reste NON prouvé

**~~La purge de l'historique d'exécutions.~~ TRANCHÉ le 23 août au soir.**

Relevé sur la machine, `docker exec n8n-n8n-1 env | grep EXECUTIONS` :

```
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=336
```

336 heures = **14 jours**. L'instance est née le 16 août : rien n'avait encore
l'âge d'être purgé, d'où le compte qui ne faisait que croître. La première
purge tombe donc vers le **30 août**, exactement la date annoncée. Le disque ne
se remplira pas indéfiniment.

⚠ **IL MANQUE UN PLAFOND EN NOMBRE**, et c'est ce qui compte à l'échelle.
~425 exécutions/jour pour trois boutiques donnent ~6 000 conservées en régime
stable — sans risque. Vingt marchands en feraient ~2 800/jour, soit **~39 000
conservées en permanence**, chacune portant les données de tous ses nœuds.
L'âge seul ne borne pas ça.

À poser dans `/docker/n8n/.env` **avant** de monter en charge, pas pendant :

```
EXECUTIONS_DATA_MAX_COUNT=10000
```

Le premier des deux plafonds qui se déclenche gagne. Ce réglage se pose en trois
minutes quand tout va bien, et jamais quand le disque est plein.

**Le trou de nuit.** La sonde ne vérifie rien hors de la fenêtre 7 h-21 h, au
motif — juste — que le témoin ne tourne pas la nuit et que son silence ne
prouverait rien. Conséquence assumée mais jamais énoncée : **une panne qui
commence à 21 h 05 n'est découverte qu'à 7 h.**

**La reprise elle-même.** Elle n'a jamais été répétée à blanc. Ce document
décrit une reconstruction réussie, pas une reconstruction éprouvée depuis ce
document.
