import { exigerAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

/**
 * Indique si l'appelant est un admin de la plateforme.
 *
 * Sert uniquement à afficher ou masquer « + Ajouter un marchand ». La
 * décision qui compte reste prise côté serveur dans POST /api/marchands :
 * masquer un bouton n'est pas un contrôle d'accès.
 */
export async function GET(req: Request) {
  const admin = await exigerAdmin(req);
  return Response.json({ admin: admin.ok });
}
