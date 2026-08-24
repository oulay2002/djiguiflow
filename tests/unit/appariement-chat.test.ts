import { describe, expect, it } from 'vitest';
import { cleAppariement } from '@/lib/telephone';
import { filtreAppariementChat } from '@/lib/appariementChat';

/**
 * Retrouver un client dont le `chat_id` a ete enregistre sous plusieurs formes.
 *
 * LE DEFAUT, mesure le 24 aout 2026 chez Zahara. Un seul et meme client
 * portait TROIS `chat_id` : `2250102918886` (11 commandes), `22502918886`
 * (10) et `0102918886` (6). Les quatre routes appariaient par egalite
 * stricte. Sa note apres livraison ne retrouvait aucune commande, partait a
 * l'assistante, et lui revenait sous la forme d'un nouveau menu — sans le
 * moindre signal.
 *
 * L'execution n8n 3395 l'a montre sans ambiguite : `note_detectee` valait
 * bien 4, c'est la lecture des commandes qui rendait `{}`.
 *
 * CE QUE CES TESTS TIENNENT, dans l'ordre d'importance :
 *
 *  1. LES TROIS FORMES SE REJOIGNENT. C'est la raison d'etre du changement.
 *  2. TELEGRAM RESTE EXACT. Un identifiant Telegram est un entier arbitraire
 *     et deja stable ; l'elargir n'apporterait rien et ouvrirait des
 *     confusions entre clients d'une meme boutique.
 *  3. L'EGALITE STRICTE RESTE EN TETE. Rien de ce qui marchait ne doit
 *     cesser de marcher : la cle n'ajoute que ce qui etait perdu.
 */

describe('la cle d\'appariement', () => {
  it('1. rejoint les trois formes reellement observees en production', () => {
    expect(cleAppariement('2250102918886')).toBe('02918886');
    expect(cleAppariement('22502918886')).toBe('02918886');
    expect(cleAppariement('0102918886')).toBe('02918886');
  });

  it('2. tolere les separateurs et le plus international', () => {
    expect(cleAppariement('+225 01 02 91 88 86')).toBe('02918886');
    expect(cleAppariement('225-01-02-91-88-86')).toBe('02918886');
  });

  it('3. ne rend RIEN pour un identifiant Telegram', () => {
    // Un identifiant d'utilisateur, et un identifiant de groupe (negatif).
    expect(cleAppariement('1724402569')).toBe('');
    expect(cleAppariement('-1003906513172')).toBe('');
    // Mesure du 24 aout : 8 commandes Telegram sur 8 ont une cle NULLE en base.
  });

  it('4. ne rend rien de trop court pour distinguer qui que ce soit', () => {
    expect(cleAppariement('0291888')).toBe('');
    expect(cleAppariement('')).toBe('');
    expect(cleAppariement(null)).toBe('');
    expect(cleAppariement(undefined)).toBe('');
  });

  it('5. ⚠ confond deux numeros qui ne different que par l\'operateur', () => {
    // Ce test ne decrit pas un souhait, il FIXE le prix de l'option retenue.
    // S'il tombe un jour, c'est que la regle a change et qu'il faut relire ce
    // compromis — pas le "reparer" en silence.
    expect(cleAppariement('0102918886')).toBe(cleAppariement('0702918886'));
  });
});

describe('le filtre passe a Supabase', () => {
  it('6. porte l\'egalite stricte EN TETE, puis la cle', () => {
    const f = filtreAppariementChat('2250102918886');
    expect(f.indexOf('chat_id.eq')).toBe(0);
    expect(f).toContain('chat_cle.eq."02918886"');
  });

  it('7. se reduit a l\'egalite quand il n\'y a pas de cle', () => {
    const f = filtreAppariementChat('1724402569');
    expect(f).toBe('chat_id.eq."1724402569"');
    expect(f).not.toContain('chat_cle');
  });

  it('8. cite la valeur, pour qu\'une virgule ne casse pas le filtre', () => {
    // La virgule et la parenthese separent les termes d'un `or` PostgREST.
    // Une valeur nue les laisserait parler a la place du filtre.
    expect(filtreAppariementChat('2250102918886@s.whatsapp.net'))
      .toContain('chat_id.eq."2250102918886@s.whatsapp.net"');
    expect(filtreAppariementChat('a,b')).toBe('chat_id.eq."a,b"');
    expect(filtreAppariementChat('a"b')).toBe('chat_id.eq."a\\"b"');
  });

  it('9. n\'est jamais vide — un seul chemin de code dans les routes', () => {
    // Deux chemins, c'est un chemin qu'on oublie de corriger.
    for (const v of ['', '   ', '0102918886', '1724402569', '-100390651']) {
      expect(filtreAppariementChat(v).length).toBeGreaterThan(0);
      expect(filtreAppariementChat(v).startsWith('chat_id.eq.')).toBe(true);
    }
  });
});
