/**
 * Ramene une cible de redirection a un chemin interne sur.
 *
 * Le parametre `?next=` traverse le login et le retour OAuth avant d'etre
 * pousse dans `window.location` ou dans une Response 302. Tel quel, il
 * transformait la page de connexion en tremplin : `/login?next=https://…`
 * emmenait le marchand sur un site tiers APRES une authentification reussie,
 * ce qui est la forme la plus credible du hameconnage.
 *
 * Seule forme acceptee : un chemin absolu d'un seul slash. Tout le reste
 * retombe sur `defaut`.
 */
export function cheminInterneSur(
	cible: string | null | undefined,
	defaut = '/dashboard',
): string {
	if (!cible) return defaut;

	const valeur = cible.trim();
	if (!valeur.startsWith('/')) return defaut;

	// `//evil.com` est une URL absolue protocol-relative, et plusieurs
	// navigateurs normalisent `/\` en `//`. Les deux sortent du site.
	if (valeur.startsWith('//') || valeur.startsWith('/\\')) return defaut;

	// AUCUN CARACTERE DE CONTROLE, AUCUN ANTISLASH, NULLE PART.
	//
	// La liste ne nommait que `\r`, `\n` et `\0` — ceux qui injectent dans un
	// en-tete. Elle oubliait la TABULATION, et l'analyseur d'URL des navigateurs
	// la RETIRE avant de lire : `/\t/evil.example` devient `//evil.example`, donc
	// un autre site. `/login?next=/%09/evil.example` emmenait le marchand chez un
	// tiers juste apres une authentification reussie. Trouve a l'audit du
	// 22 novembre 2026. Enumerer les caracteres dangereux ne tient pas : on
	// refuse toute la plage de controle.
	if (/[\u0000-\u001f\u007f\\]/.test(valeur)) return defaut;

	// LA PREUVE, PLUTOT QUE LA LISTE. On laisse l'analyseur d'URL — celui-la
	// meme que le navigateur appliquera — dire ou mene la cible. Si elle sort de
	// l'origine de reference, elle est refusee, quelle que soit l'astuce.
	try {
		const base = 'https://interne.invalid';
		if (new URL(valeur, base).origin !== base) return defaut;
	} catch {
		return defaut;
	}

	return valeur;
}
