# Le point de livraison voyage jusqu'au livreur — plan de mise en œuvre

> **Pour un exécutant agentique :** COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour appliquer ce plan tâche par tâche. Les
> étapes utilisent des cases à cocher (`- [ ]`).

**But :** faire que la position enregistrée par le client atteigne réellement
le livreur, au lieu de mourir en base.

**Architecture :** deux changements seulement, sans dépendance nouvelle.
`/api/internal/commandes/fiche` rend `latitude` et `longitude` ; le nœud n8n
« Notifier groupe - Course acceptée » ajoute une ligne « 🚩 Point exact » sur
les coordonnées quand elles existent. Le lien sur l'adresse texte **reste**.

**Pile :** Next.js (route handler), vitest, n8n (MCP `n8n-vps`), Supabase.

**Spec :** `docs/superpowers/specs/2026-08-24-carte-position-client-design.md`

## Contraintes globales

- **URL Maps sans paramètre de requête** : `google.com/maps/search/<x>` et
  jamais `?api=1&query=`. Un `&` devrait s'écrire `&amp;` dans un `href` en
  mode HTML Telegram et casserait le lien **en silence**.
- **`update_workflow` n'écrit qu'un brouillon.** Rien ne bouge en production
  sans `publish_workflow`, et la vérification se fait sur
  `versionId == activeVersionId` **et** sur le contenu de `activeVersion`.
- **`$('Un nœud')` lève si le nœud n'a pas été exécuté.** Tracer le chemin
  avant d'écrire une expression qui référence un autre nœud.
- **Aucune dépendance nouvelle**, aucun fournisseur externe. La carte et
  l'épingle sont **hors périmètre**.
- Commentaires et messages en français, sans accents dans les messages de
  commit (convention du dépôt).

## Structure des fichiers

| Fichier | Responsabilité | Action |
|---|---|---|
| `src/app/api/internal/commandes/fiche/route.ts` | rendre la commande aux workflows de livraison, sous les noms de la feuille | **modifier** — ajouter deux champs |
| `tests/unit/fiche-jeton-suivi.test.ts` | verrouiller le contrat de sortie de cette route | **modifier** — étendre au point |
| n8n · `Acceptation Livraison` (`LqBgRvLeeKUwZhB5`), nœud `Notifier groupe - Course acceptée` | le message que lit le livreur qui prend la course | **modifier** — une expression |

Aucun fichier créé. Le test existant couvre déjà cette route ; l'étendre plutôt
qu'en ajouter un second évite deux fichiers qui divergent sur le même contrat.

---

### Tâche 1 : `fiche` rend le point

**Fichiers :**
- Modifier : `src/app/api/internal/commandes/fiche/route.ts` (le `select`, et
  l'objet rendu)
- Test : `tests/unit/fiche-jeton-suivi.test.ts`

**Interfaces :**
- Consomme : rien.
- Produit : la route rend deux champs supplémentaires,
  `latitude: number | null` et `longitude: number | null`. La tâche 2 les lit
  sous ces noms exacts.

- [ ] **Étape 0 : réparer une fuite entre tests, AVANT d'en ajouter**

Le cas 4 existant fait `etats.commande = null` et **ne le restaure jamais**.
`beforeEach` ne remet que `colonnes`. Tout test ajouté après le cas 4
recevrait donc une commande absente et échouerait pour une raison étrangère à
ce qu'il vérifie — le pire genre d'échec, celui qu'on met une heure à
comprendre.

Dans `tests/unit/fiche-jeton-suivi.test.ts`, remplacer le bloc
`vi.hoisted(...)` et les deux lignes qui le suivent par :

```ts
const hoiste = vi.hoisted(() => ({
  JETON: '265df28afab84cfe8e688919419d11f6',
  colonnes: '' as string,
  temoin: {
    id: 'cmd-1',
    reference: 'ZAH-1787573151243-934',
    jeton_suivi: '265df28afab84cfe8e688919419d11f6',
    client_nom: 'Kouassi jean claude',
    client_telephone: '0102918886',
    client_adresse: 'Cocody',
    latitude: 5.3523,
    longitude: -3.9407,
    instructions: '',
    total: 3000,
    canal: 'whatsapp',
    chat_id: '2250102918886',
    statut: 'livree',
    statut_livraison: 'livre',
    nom_livreur: 'Jean Paul',
    frais_livraison: 1500,
    created_at: '2026-08-24T12:05:51Z',
  } as Record<string, unknown>,
  commande: null as Record<string, unknown> | null,
}));

const etats = hoiste;
const JETON = hoiste.JETON;
```

Puis, dans `beforeEach`, ajouter la remise à neuf après `etats.colonnes = ''` :

```ts
  etats.colonnes = '';
  // Le temoin est RECOPIE, jamais partage : le cas 4 met `commande` a null et
  // le cas 7 ecrit dedans. Sans cette ligne, l ordre des tests deviendrait
  // significatif — et un test dont le resultat depend de son voisin ne
  // prouve rien.
  etats.commande = { ...etats.temoin };
```

- [ ] **Étape 1 : vérifier que les tests existants passent toujours**

Lancer : `npx vitest run tests/unit/fiche-jeton-suivi.test.ts`
Attendu : **4 tests passent**. Si le cas 4 échoue, c'est que la remise à neuf
n'a pas été posée au bon endroit.

- [ ] **Étape 2 : écrire les tests qui échouent**

Ajouter ce bloc à la fin du fichier, après le `describe` existant :

```ts
describe('le point de livraison rendu par /api/internal/commandes/fiche', () => {
  it('5. rend latitude et longitude — sans quoi le point meurt en base', async () => {
    // Mesure du 24 aout 2026 : la position enregistree par le client
    // n'atteignait JAMAIS le livreur. Cette route etait le maillon coupe.
    const { corps } = await appeler({ order_id: 'ZAH-1787573151243-934' });
    expect(corps[0].latitude).toBe(5.3523);
    expect(corps[0].longitude).toBe(-3.9407);
  });

  it('6. les demande explicitement a la base', async () => {
    await appeler({ order_id: 'ZAH-1787573151243-934' });
    expect(etats.colonnes).toContain('latitude');
    expect(etats.colonnes).toContain('longitude');
  });

  it('7. rend null quand aucune position n a ete donnee', async () => {
    // NULL veut dire « on ne sait pas ou est la porte », jamais « (0, 0) ».
    // Rendre 0 enverrait le livreur au large du golfe de Guinee.
    etats.commande = { ...etats.temoin, latitude: null, longitude: null };
    const { corps } = await appeler({ order_id: 'ZAH-1787573151243-934' });
    expect(corps[0].latitude).toBeNull();
    expect(corps[0].longitude).toBeNull();
  });
});
```

- [ ] **Étape 3 : lancer les tests et vérifier qu'ils échouent**

Lancer : `npx vitest run tests/unit/fiche-jeton-suivi.test.ts`
Attendu : les cas 5, 6 et 7 **échouent** — 5 et 7 parce que `latitude` est
`undefined`, 6 parce que le `select` ne demande pas la colonne.

- [ ] **Étape 4 : demander les colonnes à la base**

Dans `src/app/api/internal/commandes/fiche/route.ts`, remplacer le `.select(...)`
(vers la ligne 42) par :

```ts
    .select('id, reference, jeton_suivi, client_nom, client_telephone, client_adresse, latitude, longitude, instructions, total, canal, chat_id, statut, statut_livraison, nom_livreur, frais_livraison, created_at')
```

- [ ] **Étape 5 : rendre le point à l'appelant**

Dans le même fichier, dans l'objet rendu, juste après la ligne `address:` :

```ts
      address: data.client_adresse ?? '',
      // LE POINT, ET POURQUOI IL EST ICI.
      //
      // Le client peut donner sa position depuis la page de confirmation
      // depuis le 17 aout. Mesure du 24 aout : zero position capturee, et
      // surtout — meme capturee, elle n'allait NULLE PART. Cette route est
      // celle que lit « Acceptation Livraison » pour composer le message du
      // livreur, et elle ne rendait pas le point. Il mourait en base.
      //
      // NULL est rendu tel quel, jamais 0 : « on ne sait pas ou est la
      // porte » ne doit pas se confondre avec un point au large du golfe de
      // Guinee. C'est l'appelant qui decide quoi faire de l'absence.
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
```

- [ ] **Étape 6 : lancer les tests et vérifier qu'ils passent**

Lancer : `npx vitest run tests/unit/fiche-jeton-suivi.test.ts`
Attendu : **7 tests passent**.

- [ ] **Étape 7 : éprouver par mutation**

Retirer temporairement `latitude: data.latitude ?? null,` de l'objet rendu,
relancer les tests. Attendu : le cas 5 tombe, **et lui seul**. Remettre la
ligne. Un test qui ne tombe jamais ne prouve rien.

- [ ] **Étape 8 : la suite complète et les types**

Lancer : `npm run typecheck && npm test`
Attendu : typecheck silencieux, **tous les tests passent**.

- [ ] **Étape 9 : commit**

```bash
git add src/app/api/internal/commandes/fiche/route.ts tests/unit/fiche-jeton-suivi.test.ts
git commit -m "fiche : rendre le point de livraison, qui mourait en base"
```

---

### Tâche 2 : le livreur reçoit le point

**Fichiers :**
- Modifier : n8n · workflow `LqBgRvLeeKUwZhB5` (« Acceptation Livraison »),
  nœud `Notifier groupe - Course acceptée`, paramètre
  `/workflowInputs/value/message`

**Interfaces :**
- Consomme : `latitude` et `longitude` rendus par la tâche 1, lus via
  `$('Trouver la commande').first().json`.
- Produit : rien que d'autres tâches consomment.

⚠ **La tâche 1 doit être DÉPLOYÉE en production avant celle-ci.** Publier ce
nœud plus tôt n'écrirait pas de ligne « Point exact » — la route ne rendrait
pas encore le champ, et l'on croirait à tort que l'expression est fausse.

- [ ] **Étape 1 : vérifier que le chemin ne peut pas lever**

`$('Trouver la commande')` ne lève que si ce nœud n'a pas été exécuté. Vérifier
la chaîne, qui doit être strictement linéaire :

```
Verifier doublon [1] → Trouver la commande → Code in JavaScript1
  → Préparer données Switch → Corriger téléphone → Switch [0]
  → Notifier groupe - Course acceptée
```

Attendu : `Trouver la commande` est **toujours** en amont. Si la chaîne a
changé, s'arrêter et le signaler.

- [ ] **Étape 2 : écrire le nouveau message dans le brouillon**

Appeler `mcp__n8n-vps__update_workflow` sur `LqBgRvLeeKUwZhB5` avec une
opération `setNodeParameter` :

- `nodeName` : `Notifier groupe - Course acceptée`
- `path` : `/workflowInputs/value/message`
- `value` : le message ci-dessous, **inchangé sauf la ligne ajoutée**

```
=✅ Course acceptée par {{ $('Code in JavaScript').first().json.livreur_name }} !

📦 Commande : {{ $('Trouver la commande').first().json.order_id }}
👤 Client : {{ $('Trouver la commande').first().json.customer_name }}
📞 Téléphone : {{ $('Trouver la commande').first().json.phone }}
📍 Adresse : {{ $('Trouver la commande').first().json.address }}{{ String($('Trouver la commande').first().json.address || '').trim() ? '\n🗺️ Itinéraire : https://www.google.com/maps/search/' + encodeURIComponent(String($('Trouver la commande').first().json.address).trim()) : '' }}{{ (() => { const c = $('Trouver la commande').first().json; const la = Number(c.latitude); const lo = Number(c.longitude); return Number.isFinite(la) && Number.isFinite(lo) && (la !== 0 || lo !== 0) ? '\n🚩 Point exact : https://www.google.com/maps/search/' + la + ',' + lo : ''; })() }}

Bonne livraison ! 🛵
```

Trois choses à ne pas défaire dans cette expression :

1. **Le garde `(la !== 0 || lo !== 0)` est indispensable.** `Number(null)` vaut
   `0`, et `Number.isFinite(0)` est vrai : sans lui, une commande sans position
   afficherait un « Point exact » au large du golfe de Guinée.
2. **L'URL n'a aucun paramètre de requête.** `maps/search/<lat>,<lon>` — un `&`
   casserait le lien en mode HTML Telegram, en silence.
3. **Le lien sur l'adresse texte reste.** Il ouvre le quartier quand il n'y a
   pas mieux ; les deux lignes se lisent sans ambiguïté.

- [ ] **Étape 3 : simuler le rendu, dans les deux cas, AVANT de publier**

Écrire ce script dans le répertoire de travail temporaire (**pas** dans le
dépôt) et le lancer depuis la racine du projet. Il relit le **brouillon** par
l'API et rend le message pour deux jeux de données.

⚠ L'écrire avec l'outil d'édition, **jamais par un heredoc** : un heredoc mange
les antislashs, y compris entre quotes, et les `\n` de l'expression seraient
détruits en silence.

```js
import { readFileSync } from 'node:fs';

function env(nom) {
  const f = readFileSync('.env.local', 'utf8');
  const l = f.split('\n').find((x) => x.startsWith(`${nom}=`));
  return l ? l.slice(nom.length + 1).trim().replace(/^["']|["']$/g, '') : null;
}

const rep = await fetch(
  'https://n8n.djiguiflow.com/api/v1/workflows/LqBgRvLeeKUwZhB5',
  { headers: { 'X-N8N-API-KEY': env('N8N_VPS_KEY') } },
);
const w = await rep.json();
const n = w.nodes.find((x) => x.name === 'Notifier groupe - Course acceptée');
const tpl = n.parameters.workflowInputs.value.message;

function rendre(cmd) {
  const ctx = {
    'Trouver la commande': cmd,
    'Code in JavaScript': { livreur_name: 'Jean Paul' },
  };
  const $ = (nom) => ({ first: () => ({ json: ctx[nom] }) });
  return tpl.slice(1).replace(/\{\{([\s\S]*?)\}\}/g, (_, e) => String(eval(e)));
}

const base = { order_id: 'ZAH-1', customer_name: 'X', phone: '01', address: 'Akouedo' };
console.log('=== AVEC POINT ===');
console.log(rendre({ ...base, latitude: 5.3523, longitude: -3.9407 }));
console.log('=== SANS POINT ===');
console.log(rendre({ ...base, latitude: null, longitude: null }));
```

Attendu :
- **avec point** : la ligne `🗺️ Itinéraire` **et** la ligne `🚩 Point exact :
  https://www.google.com/maps/search/5.3523,-3.9407` ;
- **sans point** : la ligne `🗺️ Itinéraire` seule, **aucune** ligne
  « Point exact », et aucune ligne vide en trop.

Si l'un des deux rendus est faux, corriger le brouillon et recommencer. **Ne
pas publier un message qu'on n'a pas vu rendu.**

- [ ] **Étape 4 : publier**

Appeler `mcp__n8n-vps__publish_workflow` sur `LqBgRvLeeKUwZhB5`.

- [ ] **Étape 5 : vérifier la version ACTIVE, pas le brouillon**

Relire par l'API et contrôler :
- `versionId === activeVersionId` ;
- le message de `Notifier groupe - Course acceptée` **dans `activeVersion`**
  contient `Point exact`.

Attendu : les deux. Un brouillon publié à moitié se lit comme un succès.

- [ ] **Étape 6 : commit du seul changement suivi par git**

Le workflow vit dans n8n ; l'export du dépôt est régénéré chaque matin à 5 h
par `exporter-workflows-n8n`. Il n'y a donc **rien à committer ici** — la PR
automatique du lendemain portera le diff, et c'est elle la revue.

Noter dans le compte rendu : « export n8n périmé jusqu'à la PR de 5 h ».

---

### Tâche 3 : la preuve en conditions réelles

**Fichiers :** aucun. C'est le critère d'acceptation de la spec.

**Interfaces :**
- Consomme : les tâches 1 et 2, déployées et publiées.
- Produit : la preuve, ou la découverte du défaut suivant.

- [ ] **Étape 1 : une vraie commande, avec position**

Passer une commande par l'assistante, la confirmer, **et appuyer sur
« Indiquer ma position »** sur la page de confirmation.

- [ ] **Étape 2 : vérifier que le point est en base**

```sql
select reference, latitude, longitude, position_recue_le
  from commandes
 where reference = '<REF>';
```

Attendu : `latitude` et `longitude` renseignées. **Si elles sont NULL, le
défaut est en amont** — dans le bouton GPS de la page de confirmation, pas dans
ce plan. S'arrêter et le signaler : c'est un chantier distinct.

- [ ] **Étape 3 : accepter la course depuis Telegram**

- [ ] **Étape 4 : lire le message reçu dans le groupe**

Attendu : la ligne `🚩 Point exact` est présente, et son lien ouvre Maps **sur
la porte**, pas sur le quartier.

- [ ] **Étape 5 : consigner le résultat**

Si les quatre étapes passent, le critère d'acceptation de la spec est atteint :
*une commande réelle porte le point, et le livreur le reçoit.*

---

## Ce que ce plan ne fait pas

- **Pas de carte, pas d'épingle glissante, pas de Geoapify.** L'autre moitié de
  la spec attend les réponses de Geoapify sur les conditions du palier gratuit
  et sur le droit de mise en cache.
- **Pas de notification quand la position arrive APRÈS l'acceptation.** La
  limite est nommée dans la spec ; on mesure d'abord si le cas se produit.
- **Pas de changement sur `Notifier groupe - Course refusée`**, qui porte le
  même bloc d'adresse : une course refusée n'a pas besoin d'un point précis.
