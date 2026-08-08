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

	// Un retour a la ligne ou un NUL glisse dans un en-tete Location permet
	// d'y injecter une seconde directive.
	if (/[\r\n\0]/.test(valeur)) return defaut;

	return valeur;
}
