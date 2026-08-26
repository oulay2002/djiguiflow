import { NextResponse } from 'next/server';
import { diagnosticPush } from '@/lib/push';

export const dynamic = 'force-dynamic';

/**
 * Ce que le deploiement en cours voit reellement de sa configuration push.
 *
 * Ecrit apres cinq redeploiements passes a deviner pourquoi les cles VAPID
 * n'arrivaient pas. Le diagnostic public de /api/push/cle dit qu'une cle
 * manque ; il ne dit pas laquelle des variables existe, sous quel nom, ni quel
 * deploiement repond. Cette route repond a ces trois questions d'un coup.
 *
 * Aucune valeur n'est rendue, jamais — seulement des NOMS et des LONGUEURS.
 * La longueur suffit a reconnaitre les deux fautes de saisie courantes : une
 * valeur collee avec ses guillemets fait deux caracteres de trop, une valeur
 * tronquee en fait beaucoup trop peu. Et la route reste derriere le meme
 * secret partage que le reste de /api/internal.
 */
export async function GET(req: Request) {
  const secret = req.headers.get('x-sync-secret');
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  // Les noms seuls : de quoi reperer un `VAPID_PUBLIC` tronque ou un
  // `VAPID_PUBLIC_KEY ` avec une espace finale, invisibles dans l'interface.
  const nomsVapid = Object.keys(process.env)
    .filter((n) => n.toUpperCase().includes('VAPID'))
    .sort();

  const longueur = (v: string | undefined) => (v === undefined ? null : v.length);

  return NextResponse.json({
    // Quel deploiement repond, et sous quel environnement. Une variable posee
    // sur Production reste invisible a une fonction qui tourne en preview.
    deploiement: {
      environnement: process.env.VERCEL_ENV ?? '(hors Vercel)',
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      branche: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      // `VERCEL_URL` est propre a CHAQUE deploiement. Le commit, lui, ne bouge
      // pas quand on redeploie sans nouveau code : il ne dit donc pas si un
      // redeploiement a vraiment atteint ce domaine. Cette valeur, si.
      urlUnique: process.env.VERCEL_URL ?? null,
      depot: process.env.VERCEL_GIT_REPO_SLUG ?? null,
      proprietaire: process.env.VERCEL_GIT_REPO_OWNER ?? null,
    },

    // De quelle « generation » de configuration ce deploiement dispose.
    // Presence seulement, jamais les valeurs. Si les anciennes variables sont
    // la et les nouvelles absentes, les cles ont ete saisies ailleurs que dans
    // le projet qui sert ce domaine.
    autresVariables: {
      SYNC_SECRET: Boolean(process.env.SYNC_SECRET),
      NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      // `N8N_WEBHOOK_SECRET` ne figure plus ici : elle a ete supprimee de Vercel
      // le 23 aout, le secret vivant desormais au SEUL coffre Supabase. La
      // laisser aurait fait rapporter « absente » a chaque passage -- une
      // fausse alerte permanente, et une invitation a la reposer avec une
      // valeur perimee. Se verifie en SQL, jamais par une variable.
      ADMIN_EMAILS: Boolean(process.env.ADMIN_EMAILS),
      /**
       * CELLE-CI DECIDE DE QUI EST ADMIN, et son absence ne se voit pas.
       *
       * Quand elle est posee, `estAdmin` ignore l'adresse et ne regarde que
       * l'identifiant ; quand elle manque, il retombe sur `ADMIN_EMAILS` — une
       * adresse, donc une chose qui se reclame. Le repli journalise a chaque
       * appel, mais il a fallu fouiller les journaux d'execution de Vercel pour
       * repondre a « la variable est-elle bien lue ? », le 26 aout au soir.
       *
       * Une question qui demande de l'archeologie ne se pose pas deux fois : on
       * la rend lisible en un appel. Presence seulement, jamais la valeur.
       */
      ADMIN_USER_IDS: Boolean(process.env.ADMIN_USER_IDS),
      STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
    },
    variablesVapidVues: nomsVapid,
    longueurs: {
      VAPID_PUBLIC_KEY: longueur(process.env.VAPID_PUBLIC_KEY),
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: longueur(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      VAPID_PRIVATE_KEY: longueur(process.env.VAPID_PRIVATE_KEY),
    },
    // Attendu pour des cles saines : 87 et 43 caracteres.
    longueursAttendues: { publique: 87, privee: 43 },
    push: diagnosticPush(),
  });
}
