/**
 * L'adresse du routeur WhatsApp n8n — en un seul endroit.
 *
 * ── LE PIÈGE QU'ELLE PORTE ─────────────────────────────────────────────────
 *
 * n8n sert un webhook à la fois sous `/webhook/<chemin>` et sous
 * `/webhook/<id du nœud>/<chemin>`. **Seule la seconde est enregistrée.**
 * Sonder la première rend 404 — et un 404 ressemble à un refus poli.
 *
 * Le 29 août 2026, le banc de l'assistante a rendu six faux verts pour cette
 * raison : ses contrôles de refus passaient parce que rien n'arrivait.
 * `telegramBranchement.ts` portait déjà l'avertissement pour son routeur ; il
 * valait pour celui-ci, et personne ne l'avait écrit.
 *
 * ── POURQUOI UN FICHIER POUR SI PEU ────────────────────────────────────────
 *
 * Parce que trois endroits en ont besoin — le branchement en libre-service, le
 * banc, et la procédure écrite — et qu'une adresse recopiée trois fois finit
 * par diverger le jour où l'on renomme le nœud. Le segment en uuid est
 * précisément le genre de détail qu'on recopie mal.
 */

/**
 * Racine du routeur WhatsApp ; le slug du marchand y est ajouté.
 *
 * La valeur par défaut doit TOUJOURS désigner l'instance vivante. Une variable
 * d'environnement permet de viser une autre instance sans toucher au code —
 * un banc contre un n8n de recette, par exemple.
 */
export const URL_ROUTEUR_WHATSAPP =
  process.env.N8N_WHATSAPP_WEBHOOK_URL?.trim()
  || 'https://n8n.djiguiflow.com/webhook/1b96720c-e3b3-4638-a351-7f3704bd483e/whatsapp';

export function urlWebhookWhatsApp(slug: string): string {
  return `${URL_ROUTEUR_WHATSAPP.replace(/\/+$/, '')}/${encodeURIComponent(slug)}`;
}
