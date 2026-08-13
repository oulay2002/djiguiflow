import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

const PRICING_KEYWORDS = [
  'frais',
  'tarif',
  'tarifs',
  'prix',
  'abonnement',
  'commission',
  'cout',
  'plan',
  'premium',
  'essai',
  'tarif',
  'pro',
];

type TariffRow = {
  plan?: string | null;
  name?: string | null;
  title?: string | null;
  price?: number | string | null;
  amount?: number | string | null;
  currency?: string | null;
  billing_period?: string | null;
  period?: string | null;
  description?: string | null;
  is_active?: boolean | null;
  sort_order?: number | null;
};

function sanitizeMessages(messages: IncomingMessage[]): IncomingMessage[] {
  return messages
    .filter((message) => typeof message.content === 'string' && message.content.trim().length > 0)
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function isPricingQuestion(messages: IncomingMessage[]): boolean {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const normalized = normalizeText(lastUserMessage);
  return PRICING_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function buildTariffSummary(rows: TariffRow[], tableName: string): string | null {
  if (rows.length === 0) {
    return null;
  }

  const activeRows = rows
    .filter((row) => row && (row.is_active ?? true))
    .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));

  const sourceRows = activeRows.length > 0 ? activeRows : rows;

  const lines = sourceRows.slice(0, 15).map((row) => {
    const plan = row.plan ?? row.name ?? row.title ?? 'Plan';
    const amount = row.price ?? row.amount ?? null;
    const currency = row.currency ?? 'XOF';
    const period = row.billing_period ?? row.period ?? '';
    const description = row.description?.trim();

    const priceText = amount === null || amount === undefined || amount === ''
      ? 'prix non renseigné'
      : `${amount} ${currency}${period ? ` / ${period}` : ''}`;

    return description
      ? `- ${plan}: ${priceText}. ${description}`
      : `- ${plan}: ${priceText}.`;
  });

  if (lines.length === 0) {
    return null;
  }

  return `Source officielle Supabase (${tableName}):\n${lines.join('\n')}`;
}

async function fetchOfficialTariffs(): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const tableName = process.env.SUPABASE_ASSISTANT_TARIFFS_TABLE ?? 'assistant_tariffs';

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from(tableName)
    .select('plan,name,title,price,amount,currency,billing_period,period,description,is_active,sort_order')
    .limit(20);

  if (error || !Array.isArray(data)) {
    return null;
  }

  return buildTariffSummary(data as TariffRow[], tableName);
}

function buildSystemPrompt(tariffSummary: string | null): string {
  if (!tariffSummary) {
    return `${SYSTEM_PROMPT} Si on te demande un tarif précis sans source officielle disponible, réponds exactement: "Je ne peux pas confirmer ce tarif pour le moment. Je vous recommande de contacter un conseiller DjiguiFlow pour la grille officielle."`;
  }

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

  const pricingQuestion = isPricingQuestion(sanitizedMessages);
  const officialTariffs = await fetchOfficialTariffs();

  if (pricingQuestion && !officialTariffs) {
    return NextResponse.json({
      reply:
        'Je ne peux pas confirmer ce tarif pour le moment. Je vous recommande de contacter un conseiller DjiguiFlow pour la grille officielle.',
    });
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
