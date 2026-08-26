import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { estAdmin } from '@/lib/adminAuth';

/**
 * « L'admin se designe par son identifiant, pas par son adresse. »
 *
 * POURQUOI CE CHANGEMENT. La regle comparait le courriel rendu par Supabase a
 * `ADMIN_EMAILS`. Ce courriel n'est pas falsifiable par le client — mais il
 * designe l'admin par une chose que N'IMPORTE QUI PEUT DEMANDER a posseder :
 * il suffit de s'inscrire avec.
 *
 * Ce qui l'en empechait n'etait pas un verrou. Verifie le 26 aout 2026 sur la
 * production : la confirmation d'e-mail est ETEINTE. S'inscrire ne prouve donc
 * pas qu'on possede l'adresse, et seule l'occupation de l'unique adresse
 * d'`ADMIN_EMAILS` — Supabase refusant un doublon — fermait la porte.
 *
 * Une adresse se reclame. Un UUID non.
 */

const ORIGINE = { ...process.env };

beforeEach(() => {
  delete process.env.ADMIN_EMAILS;
  delete process.env.ADMIN_USER_IDS;
});

afterEach(() => {
  process.env = { ...ORIGINE };
});

const ID = '11111111-2222-3333-4444-555555555555';
const AUTRE = '99999999-8888-7777-6666-555555555555';

describe("quand ADMIN_USER_IDS est posee, elle fait autorite", () => {
  beforeEach(() => {
    process.env.ADMIN_USER_IDS = ID;
    // Volontairement present ET different : on prouve qu'il n'est plus regarde.
    process.env.ADMIN_EMAILS = 'chef@exemple.test';
  });

  it("l'identifiant listé passe", () => {
    expect(estAdmin('peu.importe@exemple.test', ID)).toBe(true);
  });

  it("UN COURRIEL D'ADMIN NE SUFFIT PLUS — c'est tout l'objet du changement", () => {
    // Quelqu'un qui aurait reclame l'adresse n'obtient rien.
    expect(estAdmin('chef@exemple.test', AUTRE)).toBe(false);
  });

  it('un appelant qui oublie l identifiant est REFUSE, jamais tolere', () => {
    // Le laisser passer sur son courriel rouvrirait la porte, en silence.
    expect(estAdmin('chef@exemple.test')).toBe(false);
    expect(estAdmin('chef@exemple.test', '')).toBe(false);
    expect(estAdmin('chef@exemple.test', null)).toBe(false);
  });

  it('la casse et les espaces ne decident de rien', () => {
    process.env.ADMIN_USER_IDS = `  ${ID.toUpperCase()} , ${AUTRE}  `;
    expect(estAdmin(null, ID)).toBe(true);
    expect(estAdmin(null, AUTRE)).toBe(true);
  });
});

describe('sans ADMIN_USER_IDS, on retombe sur l ancienne regle', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'chef@exemple.test';
  });

  it("le courriel listé passe encore — le repli est deliberé, et temporaire", () => {
    // Sans lui, ce commit couperait l'acces admin a la seconde ou il se
    // deploie, avant que la variable puisse etre posee dans Vercel.
    expect(estAdmin('chef@exemple.test', ID)).toBe(true);
    expect(estAdmin('CHEF@Exemple.test')).toBe(true);
  });

  it('un courriel absent de la liste ne passe pas', () => {
    expect(estAdmin('quelqu.un@exemple.test', ID)).toBe(false);
  });
});

describe('sans aucune des deux, personne n est admin', () => {
  it('fail-closed : un provisioning ouvert a tous serait pire qu indisponible', () => {
    expect(estAdmin('chef@exemple.test', ID)).toBe(false);
    expect(estAdmin(null, null)).toBe(false);
  });
});
