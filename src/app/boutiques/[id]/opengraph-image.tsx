import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { photoDuStockage } from '@/lib/images/stockage';
import { getMarchand } from '@/lib/marchands';
import { SITE_NOM } from '@/lib/site';

/**
 * L'image qui accompagne le lien d'une vitrine quand on le partage.
 *
 * ── POURQUOI ELLE EXISTE ───────────────────────────────────────────────────
 *
 * Un marchand fait connaitre sa boutique en envoyant son lien — sur WhatsApp,
 * dans un statut, sur Facebook. Jusqu'ici ce lien arrivait NU : la page d'une
 * boutique ne declarait aucune image, et l'apercu n'affichait qu'une adresse.
 * Or c'est l'apercu qui fait toucher le lien. Mesure sur le HTML servi le
 * 23 novembre 2026 : `og:image` absent de toutes les vitrines.
 *
 * ── CE QU'ELLE MONTRE ──────────────────────────────────────────────────────
 *
 * Le nom de la boutique, son metier, son logo s'il existe, et ce qu'on peut y
 * faire : commander. Rien qui puisse etre faux demain — ni prix, ni horaire.
 *
 * ── CE QUI NE DOIT PAS LA FAIRE ECHOUER ────────────────────────────────────
 *
 * Le logo. Il vient du stockage, dans le format que le marchand a choisi, et
 * le moteur de rendu ne les lit pas tous. On le charge donc nous-memes, on le
 * ramene a un PNG, et au moindre doute on s'en passe : une image sans logo
 * reste une bonne image, une image absente n'est rien. Meme regle que le
 * visuel hebdomadaire.
 */

export const runtime = 'nodejs';
export const alt = 'Commander en ligne à Abidjan';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const NUIT = '#131c3d';
const CHAUX = '#f8f7f3';
const MANGUE = '#e9a23b';

async function logoEnPng(url: string | undefined): Promise<string | null> {
  // Rien que notre stockage : on ne va pas chercher une adresse arbitraire
  // depuis le serveur. Voir `@/lib/images/stockage`.
  if (!url || !photoDuStockage(url, process.env.NEXT_PUBLIC_SUPABASE_URL)) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!r.ok) return null;
    const octets = Buffer.from(await r.arrayBuffer());
    if (octets.length > 3_000_000) return null;
    const png = await sharp(octets)
      .resize(280, 280, { fit: 'contain', background: { r: 248, g: 247, b: 243, alpha: 1 } })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Un nom tres long ne doit pas sortir du cadre. */
function tailleDuNom(nom: string): number {
  if (nom.length <= 16) return 104;
  if (nom.length <= 26) return 84;
  return 64;
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getMarchand(id).catch(() => null);

  const nom = (m?.nom ?? SITE_NOM).trim().slice(0, 48);
  const metier = (m?.secteur ?? '').trim().slice(0, 40);
  const logo = await logoEnPng(m?.logo);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background: NUIT,
          color: CHAUX,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '48px' }}>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element -- rendu d'image, pas une page
            <img
              src={logo}
              alt=""
              width={220}
              height={220}
              style={{ borderRadius: '8px', background: CHAUX }}
            />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
            {metier && (
              <div style={{ display: 'flex', fontSize: 30, letterSpacing: '0.12em', color: MANGUE }}>
                {metier.toUpperCase()}
              </div>
            )}
            <div style={{ display: 'flex', fontSize: tailleDuNom(nom), fontWeight: 800, lineHeight: 1.05 }}>
              {nom}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', fontSize: 40, color: CHAUX }}>
            Commander en ligne · Abidjan
          </div>
          <div style={{ display: 'flex', fontSize: 28, color: MANGUE }}>{SITE_NOM}</div>
        </div>
      </div>
    ),
    size,
  );
}
