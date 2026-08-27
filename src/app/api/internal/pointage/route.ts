import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Une tâche déclare qu'elle vient de s'exécuter POUR DE BON.
 *
 * POURQUOI CETTE ROUTE EXISTE. Le 27 août 2026 au matin, la sauvegarde des
 * données n'avait pas tourné : GitHub sacrifie les tâches planifiées quand sa
 * plateforme est chargée. Personne n'aurait été prévenu — le workflow alerte
 * quand la sauvegarde ÉCHOUE, il ne peut rien dire quand elle NE DÉMARRE PAS.
 *
 * Une tâche qui échoue crie toute seule. Une tâche qui ne tourne jamais est
 * muette, et ce qu'elle protège ici est la seule copie des commandes, des
 * produits, des comptes et des images.
 *
 * ELLE NE JUGE RIEN. Elle enregistre un passage ; c'est `/api/internal/sante`
 * qui décide si le silence a trop duré, et n8n qui porte le message. Séparer
 * les trois est ce qui permet d'éprouver la règle sans déclencher d'alerte.
 *
 * APPELÉE DEPUIS UNE TÂCHE, DONC APRÈS COUP. Le pointage se pose à la FIN d'un
 * passage réussi. Posé au démarrage, il mentirait exactement quand il ne faut
 * pas : la tâche aurait commencé, échoué, et la sonde la croirait à jour.
 */

/** Les tâches qu'on accepte de pointer. Une clef inconnue est refusée. */
const CLES_CONNUES = new Set(['sauvegarde_donnees', 'sauvegarde_schema', 'export_n8n']);

export async function POST(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  let corps: { cle?: unknown; detail?: unknown };
  try {
    corps = (await req.json()) as { cle?: unknown; detail?: unknown };
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const cle = String(corps.cle ?? '').trim();

  /**
   * UNE CLEF INCONNUE EST REFUSÉE, ET C'EST LE POINT.
   *
   * Accepter n'importe quoi laisserait une faute de frappe créer une ligne que
   * personne ne surveille : la tâche pointerait `sauvegarde_donnee`, la sonde
   * lirait `sauvegarde_donnees` et la croirait muette depuis toujours — ou,
   * pire, on ajouterait la clef à la sonde et l'alerte cesserait pour la
   * mauvaise raison.
   */
  if (!CLES_CONNUES.has(cle)) {
    return NextResponse.json(
      { error: `Tâche inconnue : « ${cle || '(vide)'} ».` },
      { status: 400 },
    );
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'Base indisponible.' }, { status: 503 });

  const { error } = await sb.from('pointages').upsert(
    {
      cle,
      dernier_le: new Date().toISOString(),
      detail: String(corps.detail ?? '').trim().slice(0, 200) || null,
    },
    { onConflict: 'cle' },
  );

  if (error) {
    /**
     * ON REND UNE ERREUR, ET LA TÂCHE APPELANTE DOIT LEVER.
     *
     * Un pointage avalé rendrait la sonde aveugle sans que rien ne le dise :
     * elle croirait la sauvegarde absente alors qu'elle a eu lieu, et
     * l'exploitant apprendrait à ignorer une alerte qui se trompe. Mieux vaut
     * une tâche rouge qu'une sonde qui ment.
     */
    console.error(`Pointage — écriture impossible pour « ${cle } » :`, error.message);
    return NextResponse.json({ error: 'Pointage impossible.' }, { status: 503 });
  }

  return NextResponse.json({ ok: true, cle });
}
