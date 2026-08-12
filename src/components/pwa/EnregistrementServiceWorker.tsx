'use client';

import { useEffect } from 'react';

/**
 * Enregistre le service worker. Aucun rendu.
 *
 * Monte dans le layout racine : le worker sert aussi la vitrine et la page de
 * suivi client, pas seulement le tableau de bord.
 */
export default function EnregistrementServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // En developpement, le worker met en cache des chunks que Turbopack
    // regenere a chaque edition : on servait du code mort. On l'enregistre
    // donc uniquement en production.
    if (process.env.NODE_ENV !== 'production') return;

    const enregistrer = () => {
      navigator.serviceWorker
        // `updateViaCache: 'none'` : sans cela le navigateur peut servir un
        // sw.js mis en cache pendant 24 h, et un correctif n'atteint jamais
        // les marchands.
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch((e) => console.error('Service worker non enregistre :', e));
    };

    // Apres `load` : l'enregistrement entre en concurrence avec le chargement
    // initial, et c'est celui-ci qui compte pour le marchand.
    if (document.readyState === 'complete') {
      enregistrer();
      return;
    }

    window.addEventListener('load', enregistrer);
    return () => window.removeEventListener('load', enregistrer);
  }, []);

  return null;
}
