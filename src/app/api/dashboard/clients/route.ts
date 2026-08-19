import { exigerAccesMarchand } from '@/lib/dashboardAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { normaliserTelephone } from '@/lib/telephone';

export const dynamic = 'force-dynamic';

type LigneCommande = {
  client_nom: string | null;
  client_telephone: string | null;
  chat_id: string | null;
  client_adresse: string | null;
  total: number | null;
  created_at: string | null;
  canal: string | null;
  note_client: number | null;
  statut: string | null;
};

export type Client = {
  id: string;
  nom: string;
  telephone: string;
  adresse: string;
  canal: string;
  commandes: number;
  depense: number;
  derniereCommande: string;
  /** Moyenne des notes laissées, null si le client n'en a jamais laissé. */
  note: number | null;
};

/** Les commandes annulées ne représentent ni un achat ni une habitude. */
const STATUTS_EXCLUS = new Set(['panier', 'annulee', 'abandonnee']);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const acces = await exigerAccesMarchand(req, searchParams.get('boutique_id'));
  if (!acces.ok) return Response.json({ error: acces.message }, { status: acces.statut });
  const m = acces.marchand;

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Base indisponible' }, { status: 503 });

  const { data, error } = await sb
    .from('commandes')
    .select(
      'client_nom, client_telephone, chat_id, client_adresse, total, created_at, canal,' +
        ' note_client, statut',
    )
    .eq('boutique_id', m.boutiqueId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`Clients — lecture Supabase impossible (${m.id}) :`, error);
    return Response.json({ error: 'Clients temporairement indisponibles' }, { status: 503 });
  }

  // Le client n'a pas de table : il est déduit de ses commandes. La clé est
  // le téléphone normalisé — le même numéro écrit « 0102030405 » ici et
  // « +225 01 02 03 04 05 » là désignerait sinon deux clients distincts.
  const parClient = new Map<string, Client & { notes: number[] }>();

  for (const c of (data ?? []) as unknown as LigneCommande[]) {
    if (STATUTS_EXCLUS.has(String(c.statut ?? ''))) continue;

    const brut = (c.client_telephone || c.chat_id || '').trim();
    if (!brut) continue;
    const normalise = normaliserTelephone(brut);
    const cle = normalise.ok ? normalise.international : brut;

    let client = parClient.get(cle);
    if (!client) {
      // Les commandes arrivent de la plus récente à la plus ancienne : la
      // première vue porte donc le nom et l'adresse les plus à jour.
      client = {
        id: cle,
        nom: (c.client_nom ?? '').trim() || 'Client',
        telephone: normalise.ok ? normalise.international : brut,
        adresse: (c.client_adresse ?? '').trim(),
        canal: (c.canal ?? '').trim().toLowerCase(),
        commandes: 0,
        depense: 0,
        derniereCommande: c.created_at ?? '',
        note: null,
        notes: [],
      };
      parClient.set(cle, client);
    }

    client.commandes += 1;
    client.depense += Number(c.total ?? 0);
    if (!client.adresse && c.client_adresse) client.adresse = c.client_adresse.trim();
    if (typeof c.note_client === 'number') client.notes.push(c.note_client);
  }

  const clients: Client[] = Array.from(parClient.values())
    .map(({ notes, ...c }) => ({
      ...c,
      note: notes.length ? Math.round((notes.reduce((s, n) => s + n, 0) / notes.length) * 10) / 10 : null,
    }))
    .sort((a, b) => b.depense - a.depense);

  return Response.json({ boutique_id: m.id, clients });
}
