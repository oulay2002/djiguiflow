import { NextResponse } from 'next/server';
import { BILLING_PLANS, DUREES_PREPAYEES } from '@/lib/billing/plans';
import { DELAI_MODELE, delai } from '@/lib/reseau';
import {
  adresseAppelante,
  plafondJournalierDepasse,
  rafaleDepassee,
  secondesAvantMinuitAbidjan,
} from '@/lib/limiteur';

/**
 * PLAFONDS. Ce point d'entree appelle Mistral sans authentification : il est
 * ouvert a l'internet et chaque appel coute. Sans plafond, une boucle depuis
 * n'importe ou consomme le budget du projet, et rien ne le signale avant la
 * facture.
 *
 * Les valeurs sont reglables par variable d'environnement pour pouvoir serrer
 * en cas d'abus sans redeployer de code.
 */
const RAFALE_LIMITE = Number(process.env.ASSISTANT_RAFALE_LIMITE ?? 8);
const RAFALE_FENETRE_MS = 60_000;
const PLAFOND_JOURNALIER = Number(process.env.ASSISTANT_PLAFOND_JOURNALIER ?? 500);

/**
 * `sanitizeMessages` borne le NOMBRE de messages, jamais leur TAILLE : un seul
 * message de 500 ko partait tel quel chez Mistral, ou le cout suit le nombre de
 * jetons. Douze messages bornes en nombre mais pas en longueur ne bornent donc
 * rien du tout.
 */
const MAX_CARACTERES_PAR_MESSAGE = 2_000;
const MAX_CARACTERES_TOTAL = 8_000;

/** Message unique : le visiteur n'a pas a savoir lequel des plafonds a parle. */
const TROP_DE_DEMANDES =
  "L'assistant reçoit trop de demandes en ce moment. Réessayez dans un instant, "
  + 'ou écrivez-nous directement.';

type IncomingMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type RequestBody = {
  messages?: IncomingMessage[];
};

type MistralResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const SYSTEM_PROMPT =
  "Tu es l'assistant officiel de DjiguiFlow. Réponds en français clair et professionnel. Aide surtout sur le fonctionnement de la plateforme, les frais, les paiements, la création de boutique, les commandes et les livraisons. Sois concis, utile et orienté action. N'invente jamais de chiffres, tarifs, commissions ou politiques internes. Si une information chiffrée n'est pas fournie explicitement, dis-le clairement et propose de vérifier la grille tarifaire officielle.";

function sanitizeMessages(messages: IncomingMessage[]): IncomingMessage[] {
  const bornes = messages
    .filter((message) => typeof message.content === 'string' && message.content.trim().length > 0)
    .slice(-12)
    .map((message) => ({
      role: message.role,
      // Tronquer plutot que refuser : une question longue reste une question
      // legitime, et la couper garde la conversation utilisable.
      content: message.content.trim().slice(0, MAX_CARACTERES_PAR_MESSAGE),
    }));

  // Puis un plafond sur l'ENSEMBLE, en gardant les messages les plus recents :
  // douze messages de 2 000 caracteres feraient encore une charge de 24 ko.
  const retenus: IncomingMessage[] = [];
  let total = 0;
  for (let i = bornes.length - 1; i >= 0; i -= 1) {
    total += bornes[i].content.length;
    if (total > MAX_CARACTERES_TOTAL && retenus.length > 0) break;
    retenus.unshift(bornes[i]);
  }

  return retenus;
}

/**
 * La grille tarifaire, lue LA OU ELLE FACTURE.
 *
 * CE QU'IL Y AVAIT AVANT. Cette route interrogeait une table Supabase
 * `assistant_tariffs`… QUI N'A JAMAIS EXISTE. La lecture echouait donc a chaque
 * fois, sans bruit, et l'assistante repondait « je ne peux pas confirmer ce
 * tarif » a toute question de prix — alors que la grille etait dans le depot,
 * a deux fichiers de la.
 *
 * Le garde-fou, lui, etait bon : sans source, l'assistante REFUSE au lieu
 * d'inventer. C'est ce qui a evite qu'un visiteur s'entende annoncer un prix
 * imaginaire pendant tous ces mois.
 *
 * POURQUOI `BILLING_PLANS` ET PAS UNE TABLE. C'est la meme constante qui
 * affiche les prix sur la vitrine et qui calcule ce qu'on debite reellement.
 * Une seconde source — table, variable d'environnement, copie dans un prompt —
 * finirait par diverger, et le jour ou elle divergerait, l'assistante
 * annoncerait un prix que la caisse ne pratique pas.
 */
function grilleTarifaire(): string {
  const lignes = BILLING_PLANS.map((plan) => {
    const prix = plan.amountFcfa === 0
      ? 'gratuit'
      : `${plan.amountFcfa.toLocaleString('fr-FR')} FCFA`;

    const periode = plan.periodeJours === 30 ? 'par mois' : `par ${plan.periodeJours} jours`;
    const duree = plan.achetable ? periode : `pendant ${plan.periodeJours} jours, non renouvelable`;

    return `- ${plan.name} : ${prix} ${duree}.`
      + ` ${plan.commandesIncluses.toLocaleString('fr-FR')} commandes incluses.`
      + ` ${plan.description}`;
  });

  // Les remises de longue duree existent et se calculent ; ne pas les mentionner
  // ferait passer l'offre pour plus chere qu'elle n'est.
  const remises = DUREES_PREPAYEES
    .filter((d) => d.remise > 0)
    .map((d) => `${d.mois} mois payes d'avance : -${Math.round(d.remise * 100)} %`)
    .join(', ');

  return `Grille officielle DjiguiFlow :\n${lignes.join('\n')}`
    + (remises ? `\n\nRemises sur paiement anticipé : ${remises}.` : '');
}

/**
 * La branche « aucune source disponible » a disparu avec la table fantome : la
 * grille etant desormais du code, elle est toujours la. Garder un chemin
 * inatteignable aurait laisse croire qu'il protege encore quelque chose.
 */
function buildSystemPrompt(tariffSummary: string): string {
  return `${SYSTEM_PROMPT}\n\nTu disposes des informations de tarification officielles ci-dessous.\n${tariffSummary}\n\nRègles importantes:\n- N'utilise des chiffres que s'ils apparaissent dans cette source officielle.\n- Si une question demande un tarif absent de la source, réponds exactement: "Je ne peux pas confirmer ce tarif pour le moment. Je vous recommande de contacter un conseiller DjiguiFlow pour la grille officielle."`;
}

export async function POST(request: Request) {
  const apiKey = process.env.MISTRAL_API_KEY;
  const model = process.env.MISTRAL_MODEL ?? 'mistral-small-latest';

  if (!apiKey) {
    return NextResponse.json(
      { error: "Configuration manquante: ajoutez MISTRAL_API_KEY dans .env.local." },
      { status: 500 },
    );
  }

  // La rafale d'abord, et AVANT de lire le corps : c'est le controle le moins
  // cher, et le refuser tot evite de payer l'analyse d'une charge envoyee en
  // boucle.
  const appelant = adresseAppelante(request);
  const rafale = rafaleDepassee(`assistant:${appelant}`, RAFALE_LIMITE, RAFALE_FENETRE_MS);
  if (rafale.depassee) {
    return NextResponse.json(
      { error: TROP_DE_DEMANDES },
      { status: 429, headers: { 'Retry-After': String(rafale.attendreSecondes) } },
    );
  }

  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const sanitizedMessages = sanitizeMessages(body.messages ?? []);

  if (sanitizedMessages.length === 0) {
    return NextResponse.json({ error: 'Aucun message à traiter.' }, { status: 400 });
  }

  // La grille vient du code, elle est donc TOUJOURS disponible. Le repli
  // « je ne peux pas confirmer ce tarif », qui repondait sans appeler Mistral
  // quand la source manquait, n'a plus lieu d'etre : il ne se declenchait de
  // toute facon qu'a cause d'une table absente.
  //
  // La consigne de prudence, elle, RESTE dans le prompt : si le visiteur
  // demande un tarif qui ne figure pas dans la grille, l'assistante renvoie
  // vers un conseiller plutot que d'improviser.
  const officialTariffs = grilleTarifaire();

  // Le plafond partage se decompte ICI, et pas plus haut : ne compter que ce
  // qui coute reellement garde le compteur honnete.
  const plafond = await plafondJournalierDepasse('assistant', PLAFOND_JOURNALIER);
  if (plafond.depasse) {
    return NextResponse.json(
      { error: TROP_DE_DEMANDES },
      {
        status: plafond.indisponible ? 503 : 429,
        headers: { 'Retry-After': String(secondesAvantMinuitAbidjan()) },
      },
    );
  }

  const payload = {
    model,
    temperature: 0.4,
    messages: [
      {
        role: 'system',
        content: buildSystemPrompt(officialTariffs),
      },
      ...sanitizedMessages,
    ],
  };

  try {
    const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      // Le modele ne diffuse pas en flux : borner la requete entiere est sans
      // risque, et un client qui attend une reponse ne doit pas attendre cinq
      // minutes qu'un fournisseur muet rende la main.
      signal: delai(DELAI_MODELE),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    if (!mistralResponse.ok) {
      // Le corps d'erreur du fournisseur partait tel quel au visiteur : il peut
      // nommer l'organisation, un quota, un modele indisponible. Il va
      // desormais dans les journaux, ou il sert au diagnostic, et pas dans une
      // reponse publique.
      const detail = await mistralResponse.text().catch(() => '(corps illisible)');
      console.error(
        `Assistant — Mistral a répondu ${mistralResponse.status} : ${detail.slice(0, 500)}`,
      );
      return NextResponse.json(
        { error: "L'assistant est momentanément indisponible." },
        { status: 502 },
      );
    }

    const data = (await mistralResponse.json()) as MistralResponse;
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return NextResponse.json({ error: 'Réponse IA vide.' }, { status: 502 });
    }

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json(
      { error: "Impossible de contacter l'API Mistral pour le moment." },
      { status: 502 },
    );
  }
}
