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

/**
 * Recupere la photo du plat et la rend en data URI.
 *
 * POURQUOI NE PAS LAISSER FAIRE ImageResponse. Il va chercher les images
 * lui-meme, et une URL qui ne repond pas fait echouer TOUT le rendu : on
 * perdrait le visuel entier — le nom, les plats, les prix — pour une photo
 * manquante. On la charge donc nous-memes, avec un delai court et un plafond
 * de taille, et on s'en passe au moindre doute. Une image sans photo reste une
 * bonne image ; une image absente n'est rien.
 */
async function chargerPhoto(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const type = r.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return null;
    const octets = Buffer.from(await r.arrayBuffer());
    // Au-dela, le rendu devient lent et la memoire de la fonction serree.
    if (octets.length > 3_000_000) return null;
    return `data:${type};base64,${octets.toString('base64')}`;
  } catch {
    return null;
  }
}

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

  const photo = await chargerPhoto(contenu.photoVedette?.url);

  /**
   * Avec une photo, on ne montre que DEUX plats. Le carre fait 1080 pixels et
   * ne s'etire pas : trois cartouches, leurs sous-titres et une photo digne de
   * ce nom n'y tiennent pas. Le troisieme plat passait sous l'image, purement
   * et simplement recouvert.
   *
   * Entre montrer trois plats dont un cache et deux plats plus une photo de
   * nourriture, le choix est vite fait : c'est la photo qui arrete le
   * defilement. Et la legende, elle, cite toujours les trois.
   */
  const platsAffiches = photo ? contenu.vedettes.slice(0, 2) : contenu.vedettes;

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
            marginTop: '56px',
            // La liste absorbe l'espace restant, la photo garde une hauteur
            // FIXE. Laisser la photo prendre ce qui reste la reduisait a une
            // bande de cent pixels des que deux plats affichaient leur nombre
            // de ventes : le poisson devenait illisible, ce qui est pire que
            // pas de photo du tout.
            flex: 1,
          }}
        >
          {platsAffiches.map((v, i) => (
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

        {photo && contenu.photoVedette && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              // Hauteur FIXE, et jamais compressible : une photo de nourriture
              // n'a d'interet que si on distingue le plat.
              height: '260px',
              flexShrink: 0,
              marginTop: '36px',
              borderRadius: '28px',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* L'image est posee en fond, en position absolue et aux dimensions
                explicites : Satori ne deduit pas les tailles comme un
                navigateur, et un `height: 100%` y donnait un cadrage flottant.
                936 = 1080 moins les deux marges de 72. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt=""
              width={936}
              height={260}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                objectFit: 'cover',
                // `overflow: hidden` du parent ne rogne pas un enfant absolu
                // dans Satori : les coins restaient carres.
                borderRadius: '28px',
              }}
            />

            {/* Le nom du plat est ECRIT SUR la photo : ce n'est pas forcement
                la meilleure vente, et une image de nourriture sans legende
                laisse le lecteur deviner ce qu'on lui montre. Pose en dernier
                enfant d'une colonne alignee en bas — plus sur qu'un
                positionnement absolu, que Satori ancre mal. */}
            <div
              style={{
                display: 'flex',
                width: '936px',
                padding: '22px 32px',
                fontSize: '38px',
                fontWeight: 700,
                background: 'rgba(19, 28, 61, 0.82)',
                borderBottomLeftRadius: '28px',
                borderBottomRightRadius: '28px',
              }}
            >
              {contenu.photoVedette.nom}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '36px' }}>
          {/* La note vient DEJA DECIDEE et mise en forme par `contenusHebdo`.
              Ce test etait refait ici, avec l'ancienne regle : le texte taisait
              « 3,7/5 sur 3 avis » et l'image l'affichait quand meme, en gros,
              sur la publication du marchand. Une regle recopiee diverge.

              Plus d'etoile non plus : la police de rendu ne la possede pas et
              l'affichait en carre vide — un defaut que tout lecteur voit. */}
          <div style={{ display: 'flex', fontSize: '34px', color: MANGUE }}>
            {contenu.mentionNote ? `Noté ${contenu.mentionNote}` : 'Commandez sur WhatsApp'}
          </div>

          {/* L'adresse de la BOUTIQUE, pas seulement notre marque. L'image
              circule souvent seule, detachee de sa legende : si elle ne porte
              qu'un nom de plateforme, elle fait notre publicite et pas celle du
              marchand, et personne ne sait ou commander. */}
          <div style={{ display: 'flex', fontSize: '28px', opacity: 0.65 }}>
            {contenu.lien.replace(/^https?:\/\/(www\.)?/, '')}
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}
