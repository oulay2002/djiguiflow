import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Garde serveur de /dashboard.
 *
 * Jusqu'ici l'acces n'etait verifie que par le layout client : la page etait
 * servie, puis le JavaScript redirigeait. Le HTML partait donc avant toute
 * verification, et un visiteur sans session voyait la coquille du dashboard.
 * Ici le contrat est inverse — sans session valide, la page n'est jamais
 * rendue.
 *
 * Le proxy rafraichit aussi la session au passage : c'est ce qui evite qu'un
 * marchand reste bloque sur un token expire entre deux visites.
 *
 * Attention : le cloisonnement des donnees ne repose PAS sur ce fichier. Il
 * tient a RLS et a `exigerAccesMarchand()` cote API. Le proxy ne fait que
 * refuser la porte d'entree.
 */
export async function proxy(request: NextRequest) {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
	const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

	// Configuration absente : rien n'est joignable en base de toute facon
	// (aucun client, RLS active). Laisser passer plutot que de rendre le
	// projet impossible a demarrer en local.
	if (!url || !cle) return NextResponse.next({ request });

	let reponse = NextResponse.next({ request });

	const supabase = createServerClient(url, cle, {
		cookies: {
			getAll: () => request.cookies.getAll(),
			setAll: (aPoser) => {
				for (const { name, value } of aPoser) {
					request.cookies.set(name, value);
				}
				reponse = NextResponse.next({ request });
				for (const { name, value, options } of aPoser) {
					reponse.cookies.set(name, value, options);
				}
			},
		},
	});

	// getUser() et pas getSession() : getSession() se contente de relire le
	// cookie, que n'importe qui peut fabriquer. getUser() fait valider le
	// token par Supabase.
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		const versLogin = request.nextUrl.clone();
		versLogin.pathname = '/login';
		versLogin.search = '';
		versLogin.searchParams.set('next', request.nextUrl.pathname);
		return NextResponse.redirect(versLogin);
	}

	// Renvoyer `reponse` et non un NextResponse.next() neuf : les cookies
	// rafraichis par setAll y sont attaches, les perdre deconnecterait le
	// marchand a l'expiration du token.
	return reponse;
}

export const config = {
	matcher: ['/dashboard/:path*'],
};
