import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { phraseRetrait } from '@/lib/retrait';

/**
 * Trois limites laissees ouvertes par le recu, et fermees ici.
 *
 *  1. La page ou le client CONFIRME ne disait pas ou venir chercher.
 *  2. Une connexion tombee portait le tampon « REFUSÉE ».
 *  3. Le recu n'avait ete regarde qu'avec une reponse simulee : rien ne liait
 *     ce que le serveur rend a ce que la page lit.
 */

const lire = (chemin: string) => readFileSync(chemin, 'utf8');

describe('ou et quand venir chercher', () => {
  // 12:30 a Abidjan = 12:30 UTC : la Cote d'Ivoire est a UTC+0 toute l'annee.
  const MIDI_TRENTE = '2026-11-24T12:30:00Z';

  it('une livraison ne rend rien : l’appelant n’a rien a afficher', () => {
    expect(phraseRetrait('livraison', MIDI_TRENTE, 'Riviera 2')).toBe('');
    expect(phraseRetrait(null, null, null)).toBe('');
  });

  it('avec l’heure et le lieu', () => {
    expect(phraseRetrait('retrait', MIDI_TRENTE, 'Riviera 2, face à la station'))
      .toBe('À retirer vers 12:30 : Riviera 2, face à la station.');
  });

  it('sans heure : « des que pret », jamais une heure inventee', () => {
    expect(phraseRetrait('retrait', null, 'Riviera 2'))
      .toBe('À retirer dès que c’est prêt : Riviera 2.');
  });

  it('sans lieu : « sur place », jamais une adresse inventee', () => {
    expect(phraseRetrait('retrait', MIDI_TRENTE, null)).toBe('À retirer sur place vers 12:30.');
    expect(phraseRetrait('retrait', null, '   ')).toBe('À retirer sur place, dès que c’est prêt.');
  });

  it('une heure illisible se lit « des que pret »', () => {
    expect(phraseRetrait('retrait', 'midi', 'Riviera 2')).toBe('À retirer dès que c’est prêt : Riviera 2.');
  });
});

describe('la page de confirmation dit ou aller', () => {
  const route = lire('src/app/api/confirmation/route.ts');

  it('elle lit l’adresse de retrait de la boutique', () => {
    expect(route).toContain("' boutiques(adresse_retrait)'");
  });

  it('la question suit le mode', () => {
    expect(route).toContain("'Viendrez-vous la chercher ?'");
    expect(route).toContain("'Serez-vous disponible pour la réception ?'");
  });

  it('L’ADRESSE EST ECHAPPEE PARTOUT OU ELLE ENTRE DANS LA PAGE', () => {
    // Elle est saisie par un marchand et s'affiche chez son client. `detail`
    // et `corps` sont inseres tels quels dans le HTML : une adresse non
    // echappee s'y executerait.
    const appels = route.match(/phraseRetrait\(/g) ?? [];
    const proteges = route.match(/echapper\(phraseRetrait\(/g) ?? [];
    const viaRecap = route.match(/const retrait = phraseRetrait\(/g) ?? [];
    expect(appels.length).toBeGreaterThanOrEqual(3);
    // Chaque appel est soit echappe sur place, soit celui du recapitulatif —
    // qui echappe sa variable a l'insertion.
    expect(proteges.length + viaRecap.length).toBe(appels.length);
    expect(route).toContain('${echapper(retrait)}');
  });
});

describe('une absence de reponse n’est pas un refus', () => {
  const vitrine = lire('src/app/boutiques/[id]/Vitrine.tsx');

  it('la connexion tombee a son propre tampon', () => {
    expect(vitrine).toContain("{sansReponse ? 'SANS RÉPONSE' : 'REFUSÉE'}");
  });

  it('elle ne dit pas « non envoyee » : on ne sait pas si la commande est partie', () => {
    expect(vitrine).not.toContain('Commande non envoyée, vérifiez votre connexion et réessayez.');
    expect(vitrine).toContain('votre commande est peut-être partie');
    expect(vitrine).toContain('Regardez si un message WhatsApp de la boutique est arrivé');
  });

  it('chaque nouvel envoi repart d’un etat net', () => {
    // Sans cette remise a zero, un vrai refus du serveur garderait le tampon
    // « SANS RÉPONSE » de la tentative precedente.
    expect(vitrine).toMatch(/const commander = async \(\) => \{\s*setSansReponse\(false\);/);
  });
});

describe('le recu lit ce que le serveur rend', () => {
  const route = lire('src/app/api/boutiques/[id]/commander/route.ts');
  const vitrine = lire('src/app/boutiques/[id]/Vitrine.tsx');

  it('les trois champs de la reponse sont ceux que la page attend', () => {
    // Le recu n'a ete regarde qu'avec une reponse simulee. Ce test tient
    // l'accord entre les deux bouts : un champ renomme d'un cote seul
    // donnerait un recu sans reference, sous un tampon « REÇUE ».
    expect(route).toContain('return Response.json({ ok: true, order_id, jeton_suivi: jetonSuivi });');
    expect(vitrine).toContain('if (d.ok) {');
    expect(vitrine).toContain('reference: String(d.order_id),');
    expect(vitrine).toContain("jeton: String(d.jeton_suivi ?? ''),");
  });
});
