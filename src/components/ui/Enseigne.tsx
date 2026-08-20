/**
 * La marque d'une boutique, posee comme un tampon sur le bon.
 *
 * Trois cas, dans cet ordre : le logo si le marchand en a depose un, l'emoji
 * s'il en a choisi un, et sinon l'initiale de l'enseigne dans la police de
 * titre. Ce dernier cas n'est pas une exception : l'emoji propose a
 * l'inscription est le meme pour tout le monde, et l'afficher tel quel revient
 * a coller la meme vignette sur chaque boutique — elle ne distingue rien.
 *
 * Le cadre vaut autant que ce qu'il contient : sans lui, l'emoji se lit comme
 * un caractere au fil du texte, pas comme une enseigne.
 */

/** Emoji propose par defaut a l'inscription : le garder signifie « pas choisi ». */
export const EMOJI_DEFAUT = '🏪';

export const initiale = (nom: string) => nom.trim().charAt(0).toUpperCase() || '·';

type Props = {
  nom: string;
  emoji?: string | null;
  logo?: string | null;
  /** `nuit` sur les fonds indigo, `jour` sur le papier. */
  variante?: 'jour' | 'nuit';
  /** Taille et arrondi, imposes par l'ecran appelant. */
  className?: string;
};

export function Enseigne({
  nom,
  emoji,
  logo,
  variante = 'jour',
  className = 'h-14 w-14 text-2xl',
}: Props) {
  const cadre =
    variante === 'nuit'
      ? 'border-[1.5px] border-white/30 bg-white/[0.08]'
      : 'border border-[var(--hairline)] bg-chaux-100';

  if (logo) {
    return (
      <span className={`shrink-0 overflow-hidden ${cadre} ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }

  const choisi = Boolean(emoji) && emoji !== EMOJI_DEFAUT;

  return (
    <span aria-hidden className={`grid shrink-0 place-items-center ${cadre} ${className}`}>
      {choisi ? (
        emoji
      ) : (
        <span
          className={`font-display font-black ${
            variante === 'nuit' ? 'text-mangue-300' : 'text-nuit-800'
          }`}
        >
          {initiale(nom)}
        </span>
      )}
    </span>
  );
}
