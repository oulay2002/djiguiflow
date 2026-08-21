/**
 * Combien de conversations le VPS n8n mene-t-il EN MEME TEMPS ?
 *
 *   k6 run scripts/charge/n8n-concurrence.js
 *
 * Le webhook vise attend 3 secondes puis repond — la duree d'un appel au
 * modele de langage, sans en payer un seul et sans toucher la moindre donnee.
 *
 * CE QUE LA MESURE VEUT DIRE. Si le VPS traite les demandes en parallele, la
 * duree reste proche de 3 s quel que soit le nombre de visiteurs. Si elle
 * grimpe, c'est qu'elles font la queue — et une file d'attente sur ce chemin,
 * c'est un client qui attend sa reponse.
 */

import http from 'k6/http';
import { check } from 'k6';

const URL = __ENV.URL || 'https://n8n.djiguiflow.com/webhook/charge-concurrence';

export const options = {
  stages: [
    { duration: '20s', target: 10 },
    { duration: '30s', target: 30 },
    { duration: '30s', target: 60 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    // 3 s d'attente voulue. Au-dela de 6, la moitie du temps est de la file.
    http_req_duration: ['p(95)<6000'],
    http_req_failed: ['rate<0.02'],
  },
};

export default function () {
  const r = http.get(URL, { timeout: '60s' });
  check(r, { 'repond 200': (x) => x.status === 200 });
}
