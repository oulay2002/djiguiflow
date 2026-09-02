import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AUCUN ÉCRAN NE PRÉSENTE UN RÉGLAGE QUE PERSONNE NE LIT.
 *
 * ── CE QUI A ÉTÉ TROUVÉ LE 2 SEPTEMBRE 2026 ────────────────────────────────
 *
 * L'écran Notifications portait deux interrupteurs — « Recevez les
 * notifications sur WhatsApp / sur Telegram » — et, sous chacun, un champ de
 * saisie : un numéro WhatsApp, un identifiant Telegram.
 *
 * Les quatre colonnes correspondantes étaient écrites par cet écran et lues
 * NULLE PART dans l'application. Le marchand saisissait son identifiant
 * Telegram, enregistrait, et la valeur dormait en base.
 *
 * Pire : l'étape 3 de « Branchement » demande le MÊME identifiant, et c'est
 * celle-là qui porte les alertes du gérant. Deux écrans posaient la même
 * question, un seul s'en servait. Un marchand qui remplissait le mauvais ne
 * recevait aucune alerte, sans aucun moyen de comprendre pourquoi.
 *
 * ── CE QUE CE GARDE SAIT, ET CE QU'IL NE SAIT PAS ──────────────────────────
 *
 * Il ne sait pas décider en général si une colonne est lue — personne ne sait
 * le faire statiquement. Il tient une liste NOMMÉE de colonnes dont on a
 * vérifié, à la main, qu'aucun code applicatif ne les lit, et il refuse qu'un
 * écran les rende à nouveau modifiables.
 *
 * Les valeurs continuent d'exister en base et de faire un aller-retour à
 * l'enregistrement : on retire l'INTERFACE qui ment, pas la donnée. Le jour où
 * l'une de ces colonnes deviendra vraiment lue, retirer sa ligne d'ici sera le
 * geste qui l'accompagne — et il coûtera une relecture, ce qui est le but.
 */

/** Colonnes écrites et jamais lues, vérifié le 2 septembre 2026. */
const REGLAGES_MORTS = [
  'whatsapp_actif',
  'telegram_actif',
  'whatsapp_numero',
  'telegram_chat_id',
];

function pages(racine: string): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(racine)) {
    const chemin = join(racine, nom);
    if (statSync(chemin).isDirectory()) sortie.push(...pages(chemin));
    else if (nom.endsWith('.tsx')) sortie.push(chemin.replace(/\\/g, '/'));
  }
  return sortie;
}

const fichiers = pages('src/app');

describe('un reglage affiche est un reglage qui agit', () => {
  it('il y a bien des ecrans a verifier', () => {
    // Un chemin renomme rendrait la liste vide, et un test sur zero fichier
    // passe au vert en ne verifiant rien.
    expect(fichiers.length).toBeGreaterThan(10);
  });

  it.each(REGLAGES_MORTS)('aucun ecran ne rend « %s » modifiable', (colonne) => {
    // On cherche la LECTURE POUR AFFICHAGE (`settings.<colonne>`), pas la
    // declaration de type ni la valeur par defaut : celles-la sont inertes, et
    // les interdire obligerait a restructurer l'enregistrement pour rien.
    const coupables = fichiers.filter((f) =>
      readFileSync(f, 'utf8').includes(`settings.${colonne}`),
    );

    expect(
      coupables,
      [
        `${coupables.join(', ')} presente « ${colonne} » comme un reglage.`,
        'Cette colonne est ECRITE et lue nulle part : le marchand croirait regler',
        'quelque chose, et son geste dormirait en base.',
        'Le canal des alertes se regle dans « Branchement », qui est la source de verite.',
      ].join('\n'),
    ).toEqual([]);
  });
});
