/**
 * Sauvegarde les fichiers du bucket `images` : logos et photos de produits.
 *
 * POURQUOI IL EXISTE. `supabase db dump --data-only` exporte bien
 * `storage.objects` — mais c'est le REGISTRE des fichiers, pas les fichiers.
 * Une base restauree depuis le seul dump aurait treize lignes decrivant treize
 * images qui n'existent plus : chaque vignette de produit cassee, chaque logo
 * absent. Sur une place de marche, la photo EST la boutique. Le marchand
 * devrait tout reteleverser, produit par produit.
 *
 * IL N'EXIGE AUCUN SECRET NOUVEAU. Le bucket `images` est public — il doit
 * l'etre, la vitrine affiche ces photos a des visiteurs non connectes. La cle
 * anonyme suffit donc a lister, et l'URL publique a telecharger. Cette cle
 * voyage deja dans le bundle de chaque page : la poser en variable de depot
 * n'ajoute aucune surface. On evite ainsi de mettre la cle de service —
 * celle qui contourne RLS — dans un depot public.
 *
 * Usage : node scripts/sauvegarder-images.mjs <dossier-cible>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const CIBLE = process.argv[2];
if (!CIBLE) {
  console.error('Usage : node scripts/sauvegarder-images.mjs <dossier-cible>');
  process.exit(1);
}

const PROJET = process.env.SUPABASE_PROJECT_ID || 'xshksvlnrgxijsznmkkj';
const CLE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!CLE) {
  console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY est requis (cle publique, pas la cle de service).');
  process.exit(1);
}

const RACINE = `https://${PROJET}.supabase.co/storage/v1`;
const BUCKET = 'images';

/**
 * L'API de stockage ne rend qu'un niveau a la fois : un objet sans `id` est un
 * DOSSIER, pas un fichier. Sans cette distinction on sauvegarderait quatre
 * entrees au lieu de treize, et le compte aurait l'air juste.
 */
async function lister(prefixe = '') {
  const r = await fetch(`${RACINE}/object/list/${BUCKET}`, {
    method: 'POST',
    headers: {
      apikey: CLE,
      Authorization: `Bearer ${CLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: prefixe, limit: 1000, offset: 0 }),
  });
  if (!r.ok) throw new Error(`liste ${prefixe || '/'} : ${r.status} ${await r.text()}`);

  const entrees = await r.json();
  const fichiers = [];
  for (const e of entrees) {
    const chemin = prefixe ? `${prefixe}/${e.name}` : e.name;
    if (e.id) fichiers.push({ chemin, taille: e.metadata?.size ?? null });
    else fichiers.push(...(await lister(chemin)));
  }
  return fichiers;
}

const fichiers = await lister();

// ZERO FICHIER EST UNE ERREUR, PAS UN RESULTAT. Un dossier vide pousse sans
// bruit ferait croire que les images sont sauvegardees.
if (fichiers.length === 0) {
  console.error('Aucun fichier trouve dans le bucket. Rien n a ete ecrit.');
  process.exit(1);
}

let ecrits = 0;
let octets = 0;
const manques = [];

for (const { chemin } of fichiers) {
  const r = await fetch(`${RACINE}/object/public/${BUCKET}/${encodeURI(chemin)}`);
  if (!r.ok) {
    manques.push(`${chemin} (${r.status})`);
    continue;
  }
  const corps = Buffer.from(await r.arrayBuffer());
  const destination = join(CIBLE, chemin);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, corps);
  ecrits += 1;
  octets += corps.length;
}

console.log(`${ecrits}/${fichiers.length} fichier(s) sauvegarde(s), ${Math.round(octets / 1024)} Ko`);

// UN FICHIER MANQUANT NE DOIT PAS PASSER INAPERCU. Le registre le decrit, donc
// une page l'affiche : s'il ne se telecharge pas, la restauration produira une
// vignette cassee, et on veut l'apprendre maintenant.
if (manques.length > 0) {
  console.error(`Non telecharges : ${manques.join(', ')}`);
  process.exit(1);
}
