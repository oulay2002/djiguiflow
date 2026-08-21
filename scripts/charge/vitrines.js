/**
 * Combien de visiteurs simultanes la plateforme encaisse-t-elle ?
 *
 *   k6 run scripts/charge/vitrines.js
 *
 * CE QUI EST MESURE : le parcours d'un visiteur qui arrive sur une vitrine.
 * La page rendue, la fiche de la boutique, le catalogue. C'est ce que fait
 * une foule un vendredi soir, et c'est la seule chose qu'on puisse eprouver
 * sans consequence.
 *
 * CE QUI N'EST PAS MESURE, ET POURQUOI. La prise de commande n'est PAS
 * sollicitee : elle creerait de vraies commandes, alerterait de vrais livreurs
 * sur Telegram et previendrait de vrais marchands. Un test de charge qui
 * derange des gens n'est pas un test, c'est un incident. L'assistante non plus :
 * chaque appel coute des jetons Mistral et passe par un limiteur de rafale —
 * on mesurerait le limiteur, pas la plateforme.
 *
 * DEUX BOUTIQUES, A DESSEIN : la plateforme est multi-marchand, et une mesure
 * sur une seule enseigne cacherait un cache qui ne se partage pas.
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'https://www.djiguiflow.com';
const BOUTIQUES = ['zahara', 'rose-monde'];

/** Un 200 qui rend une page vide est une panne, pas un succes. */
const reponsesVides = new Rate('reponses_vides');
const dureeCatalogue = new Trend('duree_catalogue', true);

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // les premiers arrivent
    { duration: '45s', target: 30 },   // affluence normale
    { duration: '45s', target: 60 },   // coup de feu
    { duration: '30s', target: 0 },    // la salle se vide
  ],
  thresholds: {
    // Au-dela d'une seconde et demie, un client d'Abidjan sur mobile s'en va.
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.01'],
    reponses_vides: ['rate<0.01'],
  },
};

export default function () {
  const slug = BOUTIQUES[Math.floor(Math.random() * BOUTIQUES.length)];

  group('vitrine', () => {
    const page = http.get(`${BASE}/boutiques/${slug}`, { tags: { etape: 'page' } });
    check(page, { 'page rendue': (r) => r.status === 200 });

    const fiche = http.get(`${BASE}/api/boutiques/${slug}`, { tags: { etape: 'fiche' } });
    const ficheOk = check(fiche, {
      'fiche 200': (r) => r.status === 200,
      'fiche nommee': (r) => {
        try { return String(r.json('nom') || '').length > 0; } catch (e) { return false; }
      },
    });

    const menu = http.get(`${BASE}/api/boutiques/${slug}/menu`, { tags: { etape: 'menu' } });
    dureeCatalogue.add(menu.timings.duration);

    const menuOk = check(menu, {
      'menu 200': (r) => r.status === 200,
      'menu non vide': (r) => {
        try { return Array.isArray(r.json()) && r.json().length > 0; } catch (e) { return false; }
      },
    });

    reponsesVides.add(!(ficheOk && menuOk));
  });

  // Un visiteur lit avant de cliquer. Sans cette pause, on mesure la capacite
  // d'un robot, pas celle d'une boutique.
  sleep(Math.random() * 2 + 1);
}
