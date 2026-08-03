import { NextResponse } from 'next/server';

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
  return messages
    .filter((message) => typeof message.content === 'string' && message.content.trim().length > 0)
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
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

  const payload = {
    model,
    temperature: 0.4,
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      ...sanitizedMessages,
    ],
  };

  try {
    const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    if (!mistralResponse.ok) {
      const errorText = await mistralResponse.text();
      return NextResponse.json(
        { error: "L'API Mistral a renvoyé une erreur.", details: errorText },
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
