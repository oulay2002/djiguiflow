/**
 * Cherche dans un workflow n8n les defauts qui font tomber l'automatisation
 * en silence. Les classes viennent de pannes reellement constatees, pas d'une
 * liste theorique.
 *
 * Usage : node scripts/audit-workflow.mjs <fichier-json-du-workflow>
 */
import { readFileSync } from 'node:fs';

const ZAHARA = [
  '1724402569',            // chat Telegram du gerant de Zahara
  '-1004461402565',        // groupe livreurs de Zahara
  'Commandes_Zahara',
  'Menu_Zahara',
  '2250759486701',         // numero WhatsApp de Zahara
  '11111111-1111-1111-1111-111111111111',
];

const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const w = doc.workflow ?? doc;
const noeuds = w.nodes ?? [];
const constats = [];

function signaler(gravite, noeud, quoi) {
  constats.push({ gravite, noeud, quoi });
}

// 1. Aucun workflow d'erreur : la panne ne remonte a personne.
if (!w.settings?.errorWorkflow) {
  signaler('GRAVE', '(workflow)', "aucun workflow d'erreur rattache : un echec ne remonte a personne");
}

for (const n of noeuds) {
  const p = n.parameters ?? {};
  const brut = JSON.stringify(p);

  // 2. Texte libre insere dans un message balise, sans echappement.
  //    C'est ce qui a casse Alerte Erreurs et le Dispatch livreurs.
  const champsLibres = /customer_name|client_nom|\.address|client_adresse|\.items|nom_produit|\.message\b|prenom|\.nom\b/;
  const messages = [p.text, p.message, p.jsonBody, p.workflowInputs?.value?.message]
    .filter((v) => typeof v === 'string');
  for (const m of messages) {
    const balise = /<b>|<code>|<i>|<a href|\*\*|__/.test(m);
    if (!balise) continue;
    const interpolations = m.match(/\{\{[^}]*\}\}/g) ?? [];
    for (const i of interpolations) {
      if (!champsLibres.test(i)) continue;
      if (/replace\(\/&\/g|escapeHtml|echapper/.test(i)) continue;
      signaler('GRAVE', n.name, `texte client insere dans un message balise sans echappement : ${i.slice(0, 70)}`);
    }
  }

  // 3. Valeur propre a Zahara dans un workflow qui sert tous les marchands.
  for (const v of ZAHARA) {
    if (brut.includes(v)) signaler('GRAVE', n.name, `valeur Zahara en dur : ${v}`);
  }

  // 4. Noeud Telegram de n8n : il poste avec le bot de la plateforme, donc
  //    les clics de boutons ne reviennent pas au marchand.
  if (n.type === 'n8n-nodes-base.telegram') {
    signaler('GRAVE', n.name, 'noeud Telegram de n8n : poste avec le bot commun, les boutons seront sans effet');
  }

  // 5. Appel sortant sans reprise : une coupure reseau perd la commande.
  const sortant = n.type === 'n8n-nodes-base.httpRequest' || n.type === 'n8n-nodes-base.executeWorkflow';
  if (sortant && !n.retryOnFail) {
    signaler('MOYEN', n.name, 'appel sortant sans reprise (retryOnFail)');
  }

  // 6. Ecriture Google Sheets sur un onglet dont le nom peut etre vide.
  if (n.type?.includes('googleSheets')) {
    const onglet = JSON.stringify(p.sheetName ?? '');
    if (onglet.includes('{{') && !/\|\||\?\?/.test(onglet)) {
      signaler('MOYEN', n.name, "nom d'onglet sans valeur de repli : une fiche incomplete rend une chaine vide");
    }
  }
}

console.log(`\n=== ${w.name} === (${noeuds.length} noeuds)`);
if (!constats.length) {
  console.log('  aucun constat');
} else {
  for (const g of ['GRAVE', 'MOYEN']) {
    for (const c of constats.filter((x) => x.gravite === g)) {
      console.log(`  ${g.padEnd(5)} ${String(c.noeud).padEnd(32)} ${c.quoi}`);
    }
  }
}
