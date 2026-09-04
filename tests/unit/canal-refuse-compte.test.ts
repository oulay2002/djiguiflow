import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canalADerive, cleCanalAccepte, cleCanalRefuse, cleCanalSlugInconnu, REFUS_AVANT_DE_CRIER }
  from '@/lib/compteurCanal';

/**
 * UN REFUS DE CANAL SE COMPTE, PARCE QU'IL NE CRIE PLUS.
 *
 * ── CE QUI A ÉTÉ TROUVÉ LE 3 SEPTEMBRE 2026 ────────────────────────────────
 *
 * Le banc de l'assistante laissait une exécution rouge à chaque passage. La
 * cause, lue sur l'exécution 6078 : il envoie délibérément un « STOP » avec un
 * faux secret, `/api/internal/fiche` répond 401 — la bonne réponse — et le
 * nœud `Charger fiche` traitait ce refus comme une panne. Le workflow porte un
 * `errorWorkflow` : chaque refus faisait donc sonner le salon de veille.
 *
 * Ce n'était pas qu'une saleté de banc. N'IMPORTE QUI connaissant l'URL
 * publique du webhook d'un marchand pouvait, avec un en-tête bidon, déclencher
 * une alerte chez l'exploitant et brûler une exécution n8n — trois, même, le
 * nœud réessayant un refus d'authentification qui ne réussira jamais.
 *
 * ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
 *
 * Le 401 a été rendu silencieux dans les deux routeurs. Ce silence crée un
 * angle mort : si le secret enregistré d'un vrai marchand dérive de celui que
 * son fournisseur envoie, TOUS les messages de ses clients tombent en 401, et
 * plus rien ne le dit. Les deux gardes ci-dessous tiennent les deux moitiés du
 * filet qui remplace le bruit :
 *
 *   1. la règle qui décide qu'on réveille quelqu'un ;
 *   2. le fait que CHAQUE refus de la fiche soit effectivement compté — sans
 *      quoi la règle du dessus lirait des zéros et se tairait pour toujours.
 */

describe('la regle qui decide de reveiller quelqu un', () => {
  /** Un marchand dont la porte s'ouvrait bien cette semaine. */
  const habituel = { acceptes: 0, acceptesSeptJours: 40 };

  it('se tait quand rien n est refuse', () => {
    expect(canalADerive({ ...habituel, refuses: 0 })).toBe(false);
  });

  it('se tait sous une requete complete — un seul appel en laisse trois', () => {
    expect(canalADerive({ ...habituel, refuses: REFUS_AVANT_DE_CRIER - 1 })).toBe(false);
  });

  /**
   * LE CAS QU'ON NE PEUT PAS SE PERMETTRE DE MANQUER.
   *
   * Un petit marchand, trois clients dans la journée, canal mort : neuf refus
   * en tout. N'importe quel seuil calibré sur un gros marchand le laisserait
   * passer en silence. C'est pour lui que la règle compare le marchand à son
   * propre passé plutôt qu'à une constante.
   */
  it('crie des UNE requete refusee, si sa porte s ouvrait cette semaine', () => {
    expect(canalADerive({ ...habituel, refuses: REFUS_AVANT_DE_CRIER })).toBe(true);
  });

  /**
   * LE CONTRÔLE QUI PORTE TOUT LE RAISONNEMENT.
   *
   * Une seule acceptation du jour prouve que la porte du marchand s'ouvre : son
   * canal n'a pas dérivé, et les refus qui l'entourent viennent d'ailleurs. Si
   * ce contrôle tombait, un inconnu retrouverait le pouvoir qu'on vient de lui
   * retirer — faire sonner nos alertes à volonté, depuis l'extérieur.
   */
  it('se tait des qu UN SEUL message a ete accepte aujourd hui', () => {
    expect(canalADerive({ refuses: 1000, acceptes: 1, acceptesSeptJours: 1 })).toBe(false);
  });

  /**
   * SANS PASSÉ, PAS DE VERDICT — et c'est assumé.
   *
   * Une boutique dont la porte ne s'est jamais ouverte de la semaine n'est pas
   * en train de perdre des clients : il n'en vient pas. Crier ici ferait sonner
   * l'alerte pour toute boutique branchée mais inactive que quelqu'un sonde,
   * et ce bruit-là est exactement ce qu'on est en train de retirer.
   */
  it('se tait quand la semaine ne contient aucune acceptation', () => {
    expect(canalADerive({ refuses: 500, acceptes: 0, acceptesSeptJours: 0 })).toBe(false);
  });
});

describe('les cles de comptage', () => {
  it('separent l accepte du refuse pour une meme boutique', () => {
    expect(cleCanalAccepte('zahara')).not.toBe(cleCanalRefuse('zahara'));
  });

  it('separent deux boutiques', () => {
    expect(cleCanalRefuse('zahara')).not.toBe(cleCanalRefuse('zahara-bis'));
  });
});

/**
 * CHAQUE REFUS DE LA FICHE EST COMPTÉ.
 *
 * Ce garde ne relit pas une intention, il relit le fichier : tout `return` qui
 * rend un 401 sur le chemin du secret de canal doit être précédé d'un
 * comptage. Ajouter demain un quatrième refus sans le compter rouvrirait
 * l'angle mort en silence — et le silence est précisément ce qu'on ne peut
 * plus se permettre depuis que n8n ne crie plus.
 */
describe('la fiche compte ce qu elle refuse', () => {
  const source = readFileSync('src/app/api/internal/fiche/route.ts', 'utf8');

  const refus401 = source
    .split('\n')
    .map((ligne, i) => ({ ligne: ligne.trim(), n: i }))
    .filter(({ ligne }) => ligne.includes('status: 401'));

  it('il y a bien des refus a verifier', () => {
    // Un fichier renomme, une route reecrite : sur zero refus, tout ce qui
    // suit passerait au vert en ne verifiant rien.
    expect(refus401.length).toBeGreaterThanOrEqual(4);
  });

  it('chaque refus de canal est precede d un comptage', () => {
    const lignes = source.split('\n');

    const nonComptes = refus401.filter(({ n, ligne }) => {
      // Le refus de SYNC_SECRET n'est pas un refus de canal : il arrete un
      // appelant qui n'est pas la plateforme, avant meme qu'on sache de quel
      // marchand on parle. Le compter melangerait deux choses differentes.
      if (ligne.includes('Non autorisé')) return false;
      return !lignes.slice(Math.max(0, n - 3), n).some((l) => l.includes('cleCanalRefuse'));
    });

    expect(nonComptes.map((r) => r.ligne)).toEqual([]);
  });

  it('l acceptation est comptee, sinon le refus ne veut rien dire', () => {
    expect(source).toContain('cleCanalAccepte(slug)');
  });
});

/**
 * UN SLUG INCONNU SE COMPTE AUSSI — MAIS DANS UN SEUL SEAU.
 *
 * ── CE QUI A ÉTÉ TROUVÉ LE 4 SEPTEMBRE 2026 ────────────────────────────────
 *
 * Le correctif du 3 avait fermé le 401 : quelqu'un qui connaît l'URL du
 * webhook d'un vrai marchand ne fait plus sonner le salon de veille. Mais avec
 * un slug **inventé**, `/api/internal/fiche` rend 404, le nœud `Refus ou
 * panne ?` laissait tout ce qui n'est pas 401 lever, et l'alerte partait quand
 * même. Constaté sur l'exécution 8503, déclenchée depuis un poste avec un
 * simple `curl`.
 *
 * L'adresse n'est pas un secret : elle est écrite en clair dans
 * `routeurWhatsApp.ts`, et **le dépôt est public**. La porte était donc
 * rétrécie, pas fermée.
 *
 * ── POURQUOI UN SEUL SEAU, ET C'EST TOUT L'ENJEU ───────────────────────────
 *
 * `cleCanalRefuse` prend un slug parce que ses valeurs sont bornées par le
 * nombre de boutiques. Ici le slug vient de l'appelant et n'existe pas : une
 * clé par slug laisserait CELUI QUI FRAPPE choisir le nombre de lignes de la
 * table. On échangerait un bruit d'alerte — qui se voit — contre une
 * croissance de table — qui ne se voit pas. Le pire des deux.
 */
describe('un slug inconnu ne fait plus sonner, il se compte', () => {
  const source = readFileSync('src/app/api/internal/fiche/route.ts', 'utf8');

  it('LA CLE EST GLOBALE : celui qui frappe ne peut pas la faire varier', () => {
    /**
     * ON EPROUVE LE COMPORTEMENT, PAS LA SIGNATURE.
     *
     * La première version de ce test lisait `cleCanalSlugInconnu.length` et
     * exigeait zéro. Mise à l'épreuve, elle est restée VERTE alors que la
     * fonction avait été changée en `(slug = '')` : `Function.length` ne compte
     * pas les paramètres à valeur par défaut. Le garde regardait à côté de ce
     * qu'il prétendait garder.
     *
     * La propriété qui compte n'est pas « combien d'arguments » mais « l'appelant
     * peut-il choisir la clé ». On la vérifie donc en passant des valeurs et en
     * exigeant le même résultat — le cast rend explicite qu'on force une porte
     * que TypeScript ferme déjà.
     */
    const appeler = cleCanalSlugInconnu as unknown as (s?: string) => string;

    expect(appeler('zahara')).toBe(cleCanalSlugInconnu());
    expect(appeler('n-importe-quoi')).toBe(cleCanalSlugInconnu());
    expect(appeler('')).toBe(cleCanalSlugInconnu());
  });

  it('elle ne se confond avec aucune cle de boutique', () => {
    expect(cleCanalSlugInconnu()).not.toBe(cleCanalRefuse(''));
    expect(cleCanalSlugInconnu()).not.toBe(cleCanalAccepte(''));
  });

  it('le 404 « Boutique introuvable » est precede d un comptage', () => {
    const lignes = source.split('\n');
    const n = lignes.findIndex((l) => l.includes("error: 'Boutique introuvable'"));

    // Sur -1, le `slice` ci-dessous rendrait un tableau vide et le test
    // passerait en ne verifiant rien.
    expect(n).toBeGreaterThan(0);
    expect(
      lignes.slice(Math.max(0, n - 4), n).some((l) => l.includes('cleCanalSlugInconnu')),
    ).toBe(true);
  });

  it('LE 503 N EST PAS COMPTE : un registre muet n est pas un slug inconnu', () => {
    // La route distingue deja les deux, et c'est ce qui rend ce compteur
    // lisible. Les confondre ferait grimper le compteur a chaque secousse de
    // Supabase, et on le prendrait pour une attaque.
    const lignes = source.split('\n');
    const n = lignes.findIndex((l) => l.includes("error: 'Registre indisponible'"));
    expect(n).toBeGreaterThan(0);
    expect(
      lignes.slice(Math.max(0, n - 4), n).some((l) => l.includes('cleCanalSlugInconnu')),
    ).toBe(false);
  });
});
