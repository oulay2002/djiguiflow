import { NextResponse } from 'next/server';
import { cheminInterneSur } from '@/lib/redirection';
import { supabaseServeur } from '@/lib/supabaseServeur';

export const runtime = 'nodejs';

/**
 * Retour de Google (flux PKCE).
 *
 * Google renvoie un code a usage unique, pas une session. L'echange se fait
 * ici, cote serveur : le verificateur PKCE est un cookie que seul ce domaine
 * peut lire, si bien qu'un code intercepte dans les journaux d'un proxy ou
 * dans l'historique du navigateur ne suffit pas a ouvrir une session.
 */
export async function GET(request: Request) {
	const { searchParams, origin } = new URL(request.url);

	// Google renvoie `error=access_denied` quand le marchand referme la
	// fenetre de consentement. Ce n'est pas une panne, on le ramene au login.
	const erreurFournisseur = searchParams.get('error');
	if (erreurFournisseur) {
		return NextResponse.redirect(`${origin}/login?erreur=oauth_refuse`);
	}

	const code = searchParams.get('code');
	if (!code) {
		return NextResponse.redirect(`${origin}/login?erreur=oauth`);
	}

	// La cible vient de l'URL, donc de l'exterieur : elle repasse par le
	// filtre, sinon le retour Google deviendrait le tremplin que le login
	// n'est plus.
	const suite = cheminInterneSur(searchParams.get('next'));

	try {
		const supabase = await supabaseServeur();
		const { error } = await supabase.auth.exchangeCodeForSession(code);

		if (error) {
			console.error('Echange du code OAuth impossible :', error.message);
			return NextResponse.redirect(`${origin}/login?erreur=oauth`);
		}
	} catch (e) {
		console.error('Retour OAuth :', e);
		return NextResponse.redirect(`${origin}/login?erreur=oauth`);
	}

	return NextResponse.redirect(`${origin}${suite}`);
}
