import { NextResponse } from 'next/server';
import { clePubliqueVapid, diagnosticPush } from '@/lib/push';

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
  // On passe par le diagnostic et non par la seule presence de la cle : il
  // verifie aussi qu'elle est bien formee et que la cle privee repond. Une cle
  // collee avec ses guillemets passerait le test de presence, et l'ecran
  // afficherait un bouton « Activer » que le serveur ne pourrait pas honorer.
  const etat = diagnosticPush();

  if (!etat.clesValides) {
    return NextResponse.json(
      {
        error: 'Notifications push non configurees sur ce deploiement.',
        // Presence et verdict seulement — jamais les valeurs. De quoi
        // distinguer « variable absente » de « valeur mal formee » sans
        // ouvrir les journaux ni redeployer a l'aveugle.
        diagnostic: etat,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ cle: clePubliqueVapid() });
}
