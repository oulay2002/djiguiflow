import type { MetadataRoute } from 'next';

import { SITE_DESCRIPTION, SITE_NOM } from '@/lib/site';

/**
 * Manifeste d'installation.
 *
 * Il existe pour un seul usage reel : le marchand ajoute DjiguiFlow a
 * l'ecran d'accueil de son telephone et le retrouve comme une application,
 * sans barre d'adresse. C'est la seule interface qu'il possede en dehors de
 * WhatsApp.
 *
 * Le nom et la description viennent de `site.ts` : une identite ecrite a
 * deux endroits finit toujours par diverger.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NOM,
    short_name: SITE_NOM,
    description: SITE_DESCRIPTION,
    lang: 'fr',
    dir: 'ltr',

    // Le marchand installe l'app pour son tableau de bord, pas pour la page
    // d'accueil commerciale. S'il n'a pas de session, le proxy le renvoie
    // vers /login — c'est le comportement voulu.
    start_url: '/dashboard',
    scope: '/',

    display: 'standalone',
    orientation: 'portrait',

    // Fond de l'ecran de lancement, puis teinte de la barre systeme Android.
    // nuit-900 et nuit-800, les memes que le systeme visuel de globals.css.
    background_color: '#0c1229',
    theme_color: '#131c3d',

    categories: ['business', 'productivity', 'food'],

    icons: [
      { src: '/brand/djiguiflow-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/djiguiflow-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android recadre l'icone selon le constructeur — cercle, squircle ou
      // losange. Cette version va bord a bord et garde la marque dans les
      // 80 % centraux, seule zone dont la visibilite est garantie.
      { src: '/brand/djiguiflow-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
