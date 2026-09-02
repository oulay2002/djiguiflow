/**
 * Ce qui fait qu'un diff n8n VEUT DIRE quelque chose.
 *
 * L'export existe pour qu'un changement d'automatisation soit relisible a cote
 * du code applicatif dont il depend. Sa valeur tient a une seule propriete :
 * un diff non vide doit signifier « quelqu'un a change quelque chose », jamais
 * « le serveur a compte un cran de plus ». Un diff qui ment a chaque fois n'est
 * plus lu, et l'export perd sa raison d'etre.
 *
 * Cette normalisation est donc le coeur du sujet, pas un detail de mise en
 * forme. Elle vit dans son propre fichier pour une raison precise : le script
 * d'export interroge n8n des son chargement, donc rien ne pouvait l'eprouver.
 * Une regle de silence qu'aucun test ne regarde derive sans bruit — c'est
 * exactement ce qui s'est passe ici.
 */

/**
 * Ce qui change tout seul et ne doit donc jamais atteindre un diff.
 *
 * `staticData` en particulier : c'est la memoire d'execution des workflows —
 * les garde-fous anti-doublon y rangent leur etat, qui bouge a chaque passage.
 *
 * ── LES DEUX QUE LA MIGRATION VERS LE VPS A APPORTES ────────────────────────
 *
 * `versionCounter` et `workflowPublishHistory` n'existaient pas dans la version
 * de n8n pour laquelle cette liste a ete ecrite. Le n8n du VPS a introduit un
 * modele brouillon/publication — celui qui fait qu'une modification n'atteint
 * la production qu'apres `publish_workflow` — et, avec lui, deux compteurs
 * tenus par le serveur :
 *
 *   versionCounter          incremente a chaque enregistrement
 *   workflowPublishHistory  journal append-only des (des)activations,
 *                           deux entrees ajoutees a chaque publication
 *
 * Aucun des deux ne dit ce que fait le workflow. Republier a l'identique
 * produisait donc une PR intitulee « des workflows ont change » dont le diff ne
 * changeait rien — et `workflowPublishHistory` grossit sans borne, dans un
 * fichier suivi par git.
 *
 * C'est le motif du 22 aout, reapparu par une autre porte : une liste de
 * volatils est une liste FERMEE face a un serveur qui, lui, ajoute des champs.
 */
export const VOLATILE = new Set([
  'createdAt',
  'updatedAt',
  'versionId',
  'activeVersionId',
  'triggerCount',
  'staticData',
  'pinData',
  'shared',
  'meta',
  'homeProject',
  'sharedWithProjects',
  'versionCounter',
  'workflowPublishHistory',
]);

/** Trie les cles a tous les niveaux : un objet reordonne n'est pas un changement. */
export function stable(valeur) {
  if (Array.isArray(valeur)) return valeur.map(stable);
  if (valeur && typeof valeur === 'object') {
    const sortie = {};
    for (const cle of Object.keys(valeur).sort()) {
      if (VOLATILE.has(cle)) continue;
      sortie[cle] = stable(valeur[cle]);
    }
    return sortie;
  }
  return valeur;
}

/** La definition seule : ce que le workflow FAIT, sans rien de ce qui l'entoure. */
const definition = (o) =>
  JSON.stringify(stable({ nodes: o?.nodes ?? null, connections: o?.connections ?? null }));

/**
 * PUBLIE, OU BROUILLON QUI ATTEND ?
 *
 * n8n rend deux exemplaires du meme workflow : la racine porte le BROUILLON —
 * ce qu'on voit en ouvrant l'editeur — et `activeVersion` porte ce qui TOURNE.
 * Les deux coincident presque toujours, et c'est pour cela que la difference
 * est dangereuse : on ne la cherche pas.
 *
 * Or c'est le piege le plus cher de cette instance. `update_workflow` n'ecrit
 * qu'un brouillon ; sans `publish_workflow`, la production ne bouge pas d'un
 * pouce alors que tout, dans l'interface comme dans l'export, a l'air fait.
 *
 * L'export les enregistrait tous les DEUX, l'un a la suite de l'autre. Chaque
 * changement reel apparaissait donc deux fois dans le diff, et la seule chose
 * que cette duplication aurait pu apprendre — qu'ils divergent — restait noyee
 * dedans. Verifie le 2 septembre 2026 sur les 23 workflows actifs : 23 paires
 * rigoureusement identiques, 1 049 Ko dont la moitie ne disait rien.
 *
 * On garde donc UNE definition et on repond a la question en une ligne.
 */
export function etatPublication(w) {
  if (!w?.activeVersion) return 'jamais publie';
  return definition(w) === definition(w.activeVersion) ? 'publie' : 'brouillon non publie';
}

/**
 * Le workflow tel qu'il entre dans le depot.
 *
 * ── ON ENREGISTRE CE QUI TOURNE, PAS CE QUI EST OUVERT DANS L'EDITEUR ───────
 *
 * Le COMPORTEMENT — `nodes`, `connections`, `nodeGroups` — est pris sur la
 * version publiee. L'IDENTITE — nom, description, tags, actif — est prise sur
 * l'enregistrement du workflow, seul endroit ou elle existe : `activeVersion`
 * rend `name: null` sur les 23 workflows actifs.
 *
 * Quand les deux divergent, la racine decrit un brouillon que PERSONNE
 * n'execute. Ecrire celle-la ferait dire au depot que la production fait X
 * alors qu'elle fait Y — et ce depot est ce depuis quoi on repartirait apres
 * la perte du VPS. `etat_publication` dit alors, en une ligne, qu'un brouillon
 * attend alors qu'on ne l'aurait jamais devine.
 *
 * `authors` part avec le reste, et c'est voulu : n8n y ecrit « X » ou
 * « X (via MCP) » pour la meme personne selon l'outil employe. Republier a
 * l'identique depuis un autre outil suffisait a produire un diff. Qui a change
 * quoi se lit dans l'historique git de la PR de tracage, qui est justement
 * l'endroit ou on l'a relu.
 */
export function normaliserWorkflow(w) {
  const publie = w?.activeVersion ?? {};
  const racine = { ...(w ?? {}) };
  delete racine.activeVersion;

  return stable({
    ...racine,
    etat_publication: etatPublication(w),
    nodes: publie.nodes ?? racine.nodes ?? null,
    connections: publie.connections ?? racine.connections ?? null,
    nodeGroups: publie.nodeGroups ?? racine.nodeGroups ?? null,
  });
}
