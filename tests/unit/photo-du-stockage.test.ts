import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { photoDuStockage } from '@/lib/images/stockage';

/**
 * Une photo que l'ecriture accepte est une photo que la vitrine sait afficher.
 *
 * CE QUE CE FICHIER TIENT. Le formulaire d'article proposait « …ou colle un
 * lien image ». La vitrine n'affiche que notre stockage : le marchand voyait
 * son apercu, croyait sa photo posee, et ses clients decouvraient un article
 * sans image. Et la route publique du visuel hebdomadaire allait chercher
 * cette adresse cote serveur, quelle qu'elle soit. Une seule regle ferme les
 * deux, et elle doit rester branchee aux DEUX endroits.
 */

const BASE = 'https://abcdefghijklmnop.supabase.co';
const BONNE = `${BASE}/storage/v1/object/public/images/boutique/photo.webp`;

describe('photoDuStockage', () => {
  it('accepte un objet public de notre stockage', () => {
    expect(photoDuStockage(BONNE, BASE)).toBe(true);
  });

  it('refuse tout ce qui est heberge ailleurs', () => {
    for (const url of [
      'https://exemple.com/photo.jpg',
      'https://abcdefghijklmnop.supabase.co.exemple.com/storage/v1/object/public/x.webp',
      'https://autre-projet.supabase.co/storage/v1/object/public/images/x.webp',
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost:5678/',
    ]) {
      expect(photoDuStockage(url, BASE), url).toBe(false);
    }
  });

  it('refuse le bon hote sous un autre protocole, ou hors du dossier public', () => {
    expect(photoDuStockage(BONNE.replace('https:', 'http:'), BASE)).toBe(false);
    expect(photoDuStockage(`${BASE}/rest/v1/boutiques?select=*`, BASE)).toBe(false);
    expect(photoDuStockage(`${BASE}/storage/v1/object/sign/images/x.webp`, BASE)).toBe(false);
  });

  it('refuse une adresse qui porte des identifiants', () => {
    // `https://nous@ailleurs/…` : l'hote reel est « ailleurs ».
    expect(photoDuStockage(`https://abcdefghijklmnop.supabase.co@exemple.com/storage/v1/object/public/x`, BASE)).toBe(false);
    expect(photoDuStockage(BONNE.replace('https://', 'https://u:p@'), BASE)).toBe(false);
  });

  it('refuse ce qui n est pas une adresse', () => {
    for (const v of ['', '   ', 'photo.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA', null, undefined, 42]) {
      expect(photoDuStockage(v, BASE), String(v)).toBe(false);
    }
  });

  it('refuse tout quand l adresse du stockage est inconnue', () => {
    // Sans reference, on ne sait pas ce qui est « des notres » : dans le doute,
    // rien ne l'est. L'inverse accepterait n'importe quoi le jour ou la
    // variable manque.
    expect(photoDuStockage(BONNE, undefined)).toBe(false);
    expect(photoDuStockage(BONNE, '')).toBe(false);
  });
});

describe('la regle est branchee des deux cotes', () => {
  const lire = (chemin: string) => readFileSync(chemin, 'utf8');

  it('a l ecriture : la route des articles refuse une photo etrangere, a la creation ET a la modification', () => {
    const source = lire('src/app/api/dashboard/produits/route.ts');
    const controles = source.match(/!photoDuStockage\(image, process\.env\.NEXT_PUBLIC_SUPABASE_URL\)/g) ?? [];
    expect(controles.length, 'un controle a la creation, un a la modification').toBe(2);
  });

  it('a la lecture : le visuel ne va chercher que notre stockage', () => {
    const source = lire('src/app/api/contenus/visuel/route.tsx');
    expect(source).toContain('if (!photoDuStockage(url, process.env.NEXT_PUBLIC_SUPABASE_URL)) return null;');
    expect(source).toContain("redirect: 'error'");
  });

  it('le formulaire ne propose plus de coller une adresse', () => {
    const source = lire('src/app/dashboard/products/page.tsx');
    expect(source).not.toMatch(/placeholder="https:\/\/…\/photo\.jpg"/);
    expect(source).not.toContain('setFUrl');
  });
});
