import { listerMarchands } from '@/lib/marchands';
import { SITE_DESCRIPTION, SITE_NOM, SITE_URL } from '@/lib/site';

/**
 * `/llms.txt` — la plateforme, dite en clair a un assistant.
 *
 * ── A QUOI IL SERT ─────────────────────────────────────────────────────────
 *
 * Un assistant qui repond a « comment prendre des commandes sur WhatsApp a
 * Abidjan » ou « ou commander a manger a Cocody » ne parcourt pas le site comme
 * un visiteur : il lit quelques pages, souvent sans executer de JavaScript, et
 * resume. Ce fichier lui donne en une lecture ce que le site est, pour qui, et
 * ou se trouve chaque chose — au format que la convention `llms.txt` propose :
 * du Markdown, un titre, un resume, des liens commentes.
 *
 * ── CE QU'IL NE CONTIENT PAS ───────────────────────────────────────────────
 *
 * Rien qui ne soit deja public : seulement les boutiques EN LIGNE, avec le nom
 * et la description que leur vitrine affiche. Ni telephone, ni adresse de
 * livraison, ni aucune donnee de client. Une boutique retiree de l'annuaire
 * disparait d'ici au meme moment.
 *
 * Regenere au plus une fois par heure, comme le plan du site.
 */
export const revalidate = 3600;

const ligne = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

export async function GET() {
  let boutiques: { id: string; nom: string; secteur: string; description: string }[] = [];
  try {
    boutiques = (await listerMarchands())
      .filter((m) => m.actif && m.indexable !== false)
      .map((m) => ({
        id: m.id,
        nom: ligne(m.nom),
        secteur: ligne(m.secteur),
        description: ligne(m.description),
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  } catch (e) {
    // Un registre illisible rend un fichier sans annuaire, pas une erreur : le
    // reste de ce qu'il dit reste vrai.
    console.error('llms.txt : registre des marchands illisible :', e);
  }

  const corps = [
    `# ${SITE_NOM}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `${SITE_NOM} est un service en ligne destiné aux commerçants de Côte d’Ivoire`
      + ' — restaurants, maquis, boutiques, épiceries. Il reçoit les commandes des clients'
      + ' sur WhatsApp, sur Telegram et sur une vitrine en ligne, prévient le commerçant,'
      + ' propose la course aux livreurs et suit la livraison jusqu’à la réception.'
      + ' Les clients n’installent aucune application.',
    '',
    '## Pour les commerçants',
    '',
    `- [Présentation et tarifs](${SITE_URL}/) : ce que le service fait, ses forfaits et les questions fréquentes.`,
    `- [Brancher sa boutique](${SITE_URL}/aide/brancher) : le guide pas à pas, du numéro WhatsApp au groupe des livreurs.`,
    `- [Ouvrir une boutique](${SITE_URL}/register) : l’inscription, avec 30 jours offerts.`,
    '',
    '## Pour les clients',
    '',
    `- [Annuaire des boutiques](${SITE_URL}/boutiques) : les commerces qui prennent des commandes en ligne à Abidjan.`,
    ...boutiques.map((b) => {
      const precision = [b.secteur, b.description].filter(Boolean).join(' — ');
      return `- [${b.nom}](${SITE_URL}/boutiques/${b.id})${precision ? ` : ${precision}` : ''}`;
    }),
    '',
    '## Informations',
    '',
    `- [Documents légaux](${SITE_URL}/legal) : conditions d’utilisation, conditions de vente, confidentialité.`,
    `- Langue : français. Pays : Côte d’Ivoire. Monnaie : franc CFA (XOF).`,
    '',
  ].join('\n');

  return new Response(corps, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
