import { NextResponse } from 'next/server';
import { clePubliqueVapid } from '@/lib/push';

export const dynamic = 'force-dynamic';

/**
 * Rend la cle publique VAPID au navigateur.
 *
 * Elle n'est pas secrete : c'est elle que chaque navigateur scelle dans son
 * abonnement, et elle partait deja dans le bundle. La servir ici plutot que de
 * la figer a la compilation change une seule chose, mais elle compte — la
 * configuration devient lisible a l'execution. Une cle posee dans Vercel prend
 * effet au redeploiement suivant, sans dependre de ce qu'un cache de build a
 * conserve.
 *
 * `force-dynamic` : sans lui la reponse serait prerendue au build, ce qui
 * reintroduirait exactement le probleme qu'on supprime.
 */
export async function GET() {
  const cle = clePubliqueVapid();

  if (!cle) {
    return NextResponse.json(
      { error: 'Notifications push non configurees sur ce deploiement.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ cle });
}
