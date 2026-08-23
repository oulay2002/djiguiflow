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
 *
 * MAIS UN VRAI LOGO N'EN A PAS BESOIN — il porte deja sa propre limite, et le
 * cadre lui ajoute une seconde bordure qui l'enferme. Les ecrans qui donnent
 * de l'air a la marque passent donc `cadre={false}`.
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
  /**
   * Le cadre autour de la marque. Vrai par defaut : il porte l'emoji et
   * l'initiale, qui sans lui se liraient comme du texte. A mettre a faux quand
   * le marchand a depose un vrai logo et qu'on veut le laisser respirer.
   */
  cadre?: boolean;
};

export function Enseigne({
  nom,
  emoji,
  logo,
  variante = 'jour',
  className = 'h-14 w-14 text-2xl',
  cadre = true,
}: Props) {
  const habillage = !cadre
    ? ''
    : variante === 'nuit'
      ? 'border-[1.5px] border-white/30 bg-white/[0.08]'
      : 'border border-[var(--hairline)] bg-chaux-100';

  if (logo) {
    return (
      <span className={`shrink-0 overflow-hidden ${habillage} ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt=""
          // `contain` ET NON `cover` : un logo se lit en entier ou ne se lit
          // pas. `cover` le recadrait — une enseigne carree perdait ses bords,
          // une enseigne large perdait son nom. On ne rogne pas la marque d'un
          // commercant pour remplir un carre.
          className="h-full w-full object-contain"
        />
      </span>
    );
  }

  const choisi = Boolean(emoji) && emoji !== EMOJI_DEFAUT;

  return (
    <span aria-hidden className={`grid shrink-0 place-items-center ${habillage} ${className}`}>
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
