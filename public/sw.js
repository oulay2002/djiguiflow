/*
 * Service worker de DjiguiFlow.
 *
 * Deux roles, et deux seulement :
 *   1. garder l'application ouvrable quand le reseau tombe — le marchand est
 *      souvent en 3G instable, et un ecran blanc lui fait croire a une panne ;
 *   2. recevoir les notifications push d'une nouvelle commande.
 *
 * Ce qu'il ne fait volontairement PAS : mettre en cache les reponses de
 * /api/*, de Supabase ou de l'authentification. Une commande ou un solde
 * servis depuis le cache seraient faux, et un jeton de session mis en cache
 * survivrait a la deconnexion. Sur ces chemins on passe au reseau, et on
 * echoue franchement si le reseau manque.
 */

// Changer ce numero invalide les anciens caches a la prochaine activation.
const VERSION = 'djiguiflow-v1';
const CACHE_COQUE = `${VERSION}-coque`;

const PAGE_HORS_LIGNE = '/hors-ligne.html';

// Le strict minimum pour afficher quelque chose sans reseau.
const PRECHARGE = [
  PAGE_HORS_LIGNE,
  '/brand/djiguiflow-icon-192.png',
  '/brand/djiguiflow-icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_COQUE)
      .then((cache) => cache.addAll(PRECHARGE))
      // `skipWaiting` : sans lui, une version corrigee du worker attend que
      // tous les onglets soient fermes. Un marchand qui laisse l'app ouverte
      // en permanence ne la verrait jamais.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((noms) =>
        Promise.all(noms.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Chemins qui ne doivent jamais passer par le cache. */
function toujoursReseau(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/register')
  );
}

/** Ressources versionnees par leur nom de fichier : sures a garder. */
function actifImmuable(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/brand/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Le cache HTTP ne stocke que les GET. Laisser passer le reste.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Une autre origine (Supabase, Stripe) ne nous regarde pas.
  if (url.origin !== self.location.origin) return;

  if (toujoursReseau(url)) return;

  // Navigation : on tente le reseau, et on retombe sur la page hors-ligne.
  // L'inverse (cache d'abord) servirait un tableau de bord perime au marchand
  // qui a du reseau, ce qui est pire que lent.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(PAGE_HORS_LIGNE).then((r) => r ?? Response.error()),
      ),
    );
    return;
  }

  if (actifImmuable(url)) {
    event.respondWith(
      caches.match(request).then((enCache) => {
        if (enCache) return enCache;
        return fetch(request).then((reponse) => {
          // `basic` seulement : une reponse opaque a un statut illisible, on
          // mettrait en cache une erreur sans le savoir.
          if (reponse.ok && reponse.type === 'basic') {
            const copie = reponse.clone();
            caches.open(CACHE_COQUE).then((cache) => cache.put(request, copie));
          }
          return reponse;
        });
      }),
    );
  }
});

/* --- Notifications push -------------------------------------------------- */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let charge = {};
  try {
    charge = event.data.json();
  } catch {
    charge = { corps: event.data.text() };
  }

  const titre = charge.titre || 'DjiguiFlow';
  const options = {
    body: charge.corps || '',
    icon: charge.icone || '/brand/djiguiflow-icon-192.png',
    badge: '/brand/djiguiflow-icon-192.png',
    vibrate: [100, 50, 100],
    // `tag` regroupe : dix commandes ne doivent pas empiler dix bandeaux si
    // elles portent le meme tag. `renotify` fait quand meme vibrer.
    tag: charge.tag || 'djiguiflow',
    renotify: true,
    data: { url: charge.url || '/dashboard/commandes' },
  };

  event.waitUntil(self.registration.showNotification(titre, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const cible = event.notification.data?.url || '/dashboard/commandes';

  // Reutiliser un onglet deja ouvert plutot qu'en empiler un a chaque
  // notification.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      for (const fenetre of fenetres) {
        if (new URL(fenetre.url).origin === self.location.origin && 'focus' in fenetre) {
          fenetre.navigate?.(cible);
          return fenetre.focus();
        }
      }
      return self.clients.openWindow(cible);
    }),
  );
});
