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
| Les données (commandes, produits, marchands) | dépôt privé `djiguiflow-sauvegardes`, chaque nuit à 4 h 30 | oui, exécuté et relu le 22 août |
| Les comptes de connexion (`auth`) | le même dump | oui, présence vérifiée à chaque exécution |
| Les photos et logos | `images/` du même dépôt | oui, 13 fichiers, 1 Mo |

---

## Restaurer les données — et le piège à connaître AVANT

Jusqu'au 22 août 2026, **il n'existait aucune sauvegarde des données.** Le
tableau de bord Supabase, onglet « Scheduled backups » : rien. Ce document
affirmait pourtant qu'elles se restauraient « depuis les sauvegardes Supabase ».
C'était faux — et dans le sens le plus dangereux, puisqu'on ne cherche pas
d'alternative tant qu'on croit en avoir une.

Depuis, `sauvegarde-donnees.yml` exporte chaque nuit à 4 h 30 vers le dépôt
**privé** `djiguiflow-sauvegardes` : les données métier, les comptes `auth`, le
registre `storage` et **les fichiers eux-mêmes**. L'historique de ce dépôt *est*
la profondeur de rétention.

> **Ce dépôt ne doit jamais devenir public.** Il contient les noms, téléphones et
> adresses de vrais clients.

### ⚠ Désactiver le déclencheur avant de restaurer

`commandes` porte le déclencheur `on_new_commande`, qui appelle
`notify_n8n_new_commande` → `net.http_post` vers le webhook **de production**.

Le dump ne contient **aucun** `DISABLE TRIGGER` — vérifié le 22 août. Rejouer
les données réveillerait donc ce déclencheur **pour chacune des commandes
restaurées** : n8n dispatcherait de vrais livreurs et écrirait à de vrais
clients à propos de commandes vieilles de plusieurs semaines. Une restauration
faite pour réparer un incident en créerait un plus grave.

Le déclencheur épargne deux cas seulement : `statut = 'panier'`, et les
boutiques marquées `essai`. Aucun ne couvre une vraie boutique.

```sql
-- AVANT de rejouer quoi que ce soit
alter table public.commandes disable trigger on_new_commande;
```

### Les six gestes — exécutés pour de vrai le 22 août

1. `alter table public.commandes disable trigger on_new_commande;`
2. Sur une base neuve : rejouer `supabase/reference/schema.sql`.
   **Jamais** l'historique complet de `supabase/migrations/` — il n'est pas
   rejouable, voir plus bas.
3. **Rattraper le retard de la référence.** Elle porte en tête
   `-- DERNIERE MIGRATION APPLIQUEE : <horodatage>`. Rejouer tous les fichiers
   de `supabase/migrations/` **postérieurs** à cet horodatage.
   ⚠ **Ce geste n'est pas facultatif.** Le 22 août, la référence datait de
   16 h 29 et la migration des paliers de 16 h 33 : la base restaurée portait
   encore la `vitrine_boutiques()` qui publie le **compte exact** des
   livraisons. Restaurer sans rattraper aurait **rouvert une fuite fermée le
   jour même**, et l'application aurait affiché « Nouvelle boutique » partout.
4. Rejouer `donnees/donnees.sql` du dépôt privé.
5. Reverser `images/` dans le bucket `images` (il est public, arborescence
   identique).
6. `alter table public.commandes enable trigger on_new_commande;`

`set_boutique_user_id`, l'autre déclencheur, **ne gêne pas** : il ne s'active que
si `user_id` est nul, et le dump le porte. Vérifié plutôt que supposé.

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
**Le geste :** les cinq gestes de « Restaurer les données », plus haut. Le
premier — désactiver `on_new_commande` — n'est pas optionnel : l'oublier
transforme la réparation en incident.

### 5. La session WhatsApp d'un marchand est bannie
Ses clients ne peuvent plus lui écrire. Le tableau de bord et Telegram
continuent.
**Le geste :** rescanner un QR code avec le marchand. Et relire
`relances_stop` / `reserver_relance` : WhatsApp bannit au **premier contact non
sollicité**, pas au volume.

---

## L'exercice de restauration — où il en est

Commencé le 22 août 2026. **Il a payé dès son premier geste**, ce qui est
exactement pourquoi on le fait avant d'ouvrir à de nouveaux marchands.

| Geste | État | Ce qu'il a appris |
|---|---|---|
| 1. Voir ce qui est sauvegardé | **fait** | **Rien ne l'était.** Ce document décrivait un secours inexistant |
| 2. Rejouer le schéma sur une base neuve | **fait** | La référence rebâtit une structure **identique**, du premier coup |
| 3. Rejouer les données, sans réveiller personne | **fait** | Identique ligne pour ligne, **zéro webhook envoyé** |
| 4. Écrire ce qui a manqué | **fait** | quatre manques, dont un qui aurait rouvert une fuite |

### Ce qu'une vraie restauration a donné, le 22 août

Base jetable créée, référence rejouée, données rechargées, migration de
rattrapage appliquée. Comparé à la production :

| | restaurée | production |
|---|---|---|
| tables / RLS actif | 16 / 16 | 16 / 16 |
| politiques | 28 | 28 |
| fonctions / `SECURITY DEFINER` | 27 / 24 | 27 / 24 |
| déclencheurs | 2 | 2 |
| boutiques / produits / commandes | 3 / 13 / 57 | 3 / 13 / 57 |
| comptes `auth` / objets `storage` | 3 / 13 | 3 / 13 |
| `vitrine_boutiques()` | palier 10 et 1 | palier 10 et 1 |

**Aucun webhook n'est parti** : `net.http_request_queue` est resté à zéro
pendant le rechargement des 57 commandes. Le geste 1 fonctionne.

### Ce que le geste 1 a trouvé, en plus de l'absence de sauvegarde

- **Le déclencheur `on_new_commande` se réveille pendant une restauration.**
  Le dump ne porte aucun `DISABLE TRIGGER`. Documenté plus haut, en tête de la
  procédure.
- **Le registre n'est pas le fichier.** `storage.objects` décrit treize images ;
  les images elles-mêmes n'étaient nulle part. Corrigé — elles sont sauvegardées.
- **Le second export du schéma `auth` était inutile** : le dump principal le
  contenait déjà. La sauvegarde vérifie désormais sa propre portée à chaque
  exécution, au lieu de faire confiance au comportement par défaut de la CLI.

### Ce qui n'est toujours PAS éprouvé

**Les 26 contrôles du banc n'ont pas été lancés contre la base restaurée.** La
structure et les données correspondent, et l'annuaire public rend exactement ce
que rend la production — mais le parcours applicatif complet reste à éprouver.
C'est le seul point qui manque désormais, et il est bien plus petit que ce qui a
été fermé.

**Le reste des limites tient toujours** : les secrets du coffre restent
illisibles après restauration dans un autre projet, les identifiants n8n et la
session WhatsApp d'un marchand se ressaisissent à la main. Voir plus haut.
