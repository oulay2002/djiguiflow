import { ImageResponse } from 'next/og';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { contenusHebdo, SEUIL_QUANTITE_PUBLIABLE } from '@/lib/contenus/hebdo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Le visuel de la publication hebdomadaire, en PNG.
 *
 * PUBLIQUE, et il faut qu'elle le soit : WhatsApp et Telegram vont chercher
 * l'image eux-memes, ils ne presentent aucun secret. Rien de confidentiel ne
 * doit donc figurer ici — ni chiffre d'affaires, ni panier moyen, ni volume de
 * commandes. Seulement ce que le marchand publierait de toute facon : ce qu'il
 * vend, a quel prix, et sa note si elle est bonne.
 *
 * Rendu deterministe plutot que genere par un modele d'image : ces derniers
 * ecrivent mal le francais accentue, coutent a chaque envoi, et peuvent
 * inventer un produit. Ici, ce qui s'affiche vient de la base.
 */

const NUIT = '#131c3d';
const CHAUX = '#f8f7f3';
const BISSAP = '#c4123f';
const MANGUE = '#e9a23b';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get('boutique') ?? '').trim();

  if (!slug) {
    return new Response('boutique requise', { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return new Response('Service indisponible', { status: 503 });

  const tous = await contenusHebdo(url.origin);
  const contenu = tous.find((c) => c.slug === slug);

  // Pas de vente cette semaine : pas d'image. Une carte vide publiee sur la
  // page d'un commerce lui ferait plus de tort que de bien.
  if (!contenu) {
    return new Response('Aucun contenu pour cette boutique cette semaine', { status: 404 });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '1080px',
          height: '1080px',
          display: 'flex',
          flexDirection: 'column',
          background: NUIT,
          padding: '72px',
          fontFamily: 'sans-serif',
          color: CHAUX,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '30px', letterSpacing: '6px', color: MANGUE, textTransform: 'uppercase' }}>
            Cette semaine
          </div>
          <div style={{ fontSize: '68px', fontWeight: 800, lineHeight: 1.1 }}>{contenu.nom}</div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '28px',
            marginTop: '72px',
            flex: 1,
          }}
        >
          {contenu.vedettes.map((v, i) => (
            <div
              key={v.nom}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '28px',
                background: i === 0 ? BISSAP : 'rgba(248,247,243,0.08)',
                borderRadius: '28px',
                padding: '32px 36px',
              }}
            >
              <div style={{ display: 'flex', fontSize: '44px', fontWeight: 800, opacity: 0.55, width: '60px' }}>
                {i + 1}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{ fontSize: '46px', fontWeight: 700 }}>{v.nom}</div>
                {/* Le compteur ne parait que s'il plaide : annoncer « 3 fois
                    commandé » sur la page d'un commerce le dessert.
                    Chaine construite d'un bloc, aussi, parce que Satori compte
                    « {expr} texte » comme DEUX enfants et exige alors un
                    display explicite. */}
                {v.quantite >= SEUIL_QUANTITE_PUBLIABLE && (
                  <div style={{ fontSize: '28px', opacity: 0.75, marginTop: '6px' }}>
                    {`${v.quantite} fois commandé cette semaine`}
                  </div>
                )}
              </div>
              {v.prix !== null && (
                <div style={{ display: 'flex', fontSize: '46px', fontWeight: 800 }}>
                  {`${Number(v.prix).toLocaleString('fr-FR')} F`}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '48px' }}>
          <div style={{ display: 'flex', fontSize: '34px', color: MANGUE }}>
            {contenu.note !== null && contenu.avis >= 3
              ? `★ ${String(contenu.note).replace('.', ',')}/5 · ${contenu.avis} avis`
              : 'Commandez sur WhatsApp'}
          </div>
          <div style={{ display: 'flex', fontSize: '30px', opacity: 0.6 }}>djiguiflow.com</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}
