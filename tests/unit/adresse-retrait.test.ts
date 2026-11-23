import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * L'adresse de retrait, d'un bout a l'autre.
 *
 * Quatre maillons, et le champ ne sert a rien si l'un manque : la colonne, le
 * DROIT de l'ecrire, le formulaire qui l'envoie, la vitrine qui la montre.
 * Aucun compilateur ne relie les quatre — ce test le fait.
 */

const lire = (chemin: string) => readFileSync(chemin, 'utf8');

describe('l’adresse de retrait tient de la base a la vitrine', () => {
  const migration = lire('supabase/migrations/20261123220000_boutiques_adresse_retrait.sql');
  const maBoutique = lire('src/app/dashboard/ma-boutique/page.tsx');
  const donnees = lire('src/lib/vitrine/donnees.ts');
  const vitrine = lire('src/app/boutiques/[id]/Vitrine.tsx');

  it('la colonne est accompagnee de ses droits, a la creation ET a la modification', () => {
    // Depuis la migration du 22 novembre, `authenticated` n'ecrit que les
    // colonnes nommees. Sans ces deux lignes, c'est TOUT l'enregistrement de
    // « Ma boutique » qui est refuse — pas seulement ce champ.
    expect(migration).toMatch(/grant insert \(adresse_retrait\) on public\.boutiques to authenticated/);
    expect(migration).toMatch(/grant update \(adresse_retrait\) on public\.boutiques to authenticated/);
  });

  it('le formulaire du marchand l’envoie, et un champ vide part en null', () => {
    expect(maBoutique).toContain('adresse_retrait: formData.adresse_retrait.trim().slice(0, 200) || null');
  });

  it('la borne du formulaire est celle de la base', () => {
    expect(migration).toContain('char_length(adresse_retrait) <= 200');
    expect(maBoutique).toContain('maxLength={200}');
  });

  it('la vitrine la lit sur le serveur', () => {
    expect(donnees).toMatch(/\.select\('[^']*\badresse_retrait\b[^']*'\)/);
  });

  it('elle ne s’affiche qu’en retrait, et seulement si elle existe', () => {
    expect(vitrine).toContain("modeChoisi === 'retrait' && recuperation.adresse && (");
  });

  it('elle est rappelee dans la confirmation d’une commande a retirer', () => {
    expect(vitrine).toContain('{recuperation.adresse ? ` : ${recuperation.adresse}` : \'\'}');
  });
});
