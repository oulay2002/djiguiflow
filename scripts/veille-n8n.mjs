/**
 * Sonde externe : verifie que n8n execute encore, et alerte si non.
 *
 * POURQUOI ELLE N'EST PAS DANS n8n. Le 15 aout 2026 a 12h00 UTC, le quota
 * d'executions du plan n8n Cloud s'est epuise. Toutes les executions ont ete
 * refusees par le hook PRE-execution, avant le premier noeud — commandes,
 * notifications, dispatch livreurs, tout s'est arrete. Et `Alerte Erreurs`,
 * le workflow d'erreur de la plateforme, est mort sur le meme mur : un
 * `errorWorkflow` ne peut pas signaler la panne qui l'empeche de tourner.
 * La panne a dure 45 minutes sans que rien ne soit signale nulle part.
 *
 * Cette sonde ne partage donc AUCUNE dependance avec ce qu'elle surveille :
 * ni n8n, ni Vercel, ni Supabase. Elle tourne chez GitHub, interroge l'API
 * n8n en lecture, et parle a Telegram en direct.
 *
 * CE QU'ELLE SURVEILLE. Pas la sante de l'instance : le 15 aout, n8n repondait
 * parfaitement, c'est l'EXECUTION qui etait refusee. Un `/healthz` aurait dit
 * que tout allait bien. La sonde verifie donc qu'un workflow temoin — celui
 * dont la cadence est connue — a REUSSI recemment.
 *
 * Usage :
 *   node scripts/veille-n8n.mjs
 *   VEILLE_FORCER_ALERTE=1 node scripts/veille-n8n.mjs   # eprouver l'alerte
 */

const ZONE = 'Africa/Abidjan';

const conf = {
  // Migre le 16 aout 2026 de n8n Cloud vers le VPS auto-heberge. Les valeurs
  // par defaut doivent TOUJOURS designer l'instance vivante : une sonde pointee
  // sur l'ancienne surveillerait un serveur mort et se tairait — ou hurlerait —
  // pour de mauvaises raisons. Elle donnerait dans les deux cas l'illusion
  // d'une surveillance, ce qui est pire que pas de sonde du tout.
  apiUrl: process.env.N8N_API_URL || 'https://n8n.djiguiflow.com/api/v1',
  apiKey: process.env.N8N_API_KEY,
  botToken: process.env.TELEGRAM_ALERTE_TOKEN,
  // Le groupe technique DjiguiFlow-Technique, volontairement distinct de tout
  // marchand : une panne plateforme ne doit pas atterrir chez un gerant.
  chatId: process.env.TELEGRAM_ALERTE_CHAT_ID || '-1003994906478',
  // Alerte Retard Livraison. Temoin ideal : il tourne a cadence connue (toutes
  // les heures de 7h a 21h) et il REUSSIT meme quand il n'a rien a signaler,
  // ce qui en fait un battement de coeur propre.
  // L'identifiant est propre a CHAQUE instance : la migration en attribue un
  // nouveau. Celui du Cloud etait `hgAo49I79mGHgH65`. Le conserver aurait
  // interroge le VPS sur un workflow inexistant — donc « aucune execution
  // reussie », donc une fausse alerte a chaque passage, jusqu'a ce que
  // plus personne ne les lise.
  canari: process.env.VEILLE_CANARI || 'xOTEplx2HMFYyPNx',
  nomCanari: 'Alerte Retard Livraison',
  // Le temoin passe a l'heure pile, la sonde a HH:20. Une reussite de moins de
  // 70 minutes tolere donc un passage manque et un retard d'ordonnancement.
  toleranceMin: Number(process.env.VEILLE_TOLERANCE_MIN || 70),
  heureDebut: 7,
  heureFin: 21,
};

/** L'heure locale du marchand, 00-23. Abidjan ne change pas d'heure. */
function heureLocale(d = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', hourCycle: 'h23' }).format(d),
  );
}

function horodatage(d) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: ZONE, dateStyle: 'short', timeStyle: 'short',
  }).format(d);
}

/**
 * Telegram recoit du texte BRUT, sans parse_mode. Un message d'erreur n8n
 * contient des soulignes, des asterisques et des chevrons ; en Markdown ou en
 * HTML, Telegram repond 400 et l'alerte se perd — exactement le silence que
 * cette sonde existe pour supprimer. On renonce donc a la mise en forme.
 */
function nettoyer(texte, max = 600) {
  return String(texte ?? '')
    .replace(/<[^>]*>/g, ' ')       // le quota arrive enrobe de HTML
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Combien de fois insister avant de crier, et a quel rythme.
 *
 * Trois tentatives espacees de vingt secondes absorbent une coupure passagere
 * sans retarder une vraie panne de plus d'une minute. Une sonde qui crie au
 * loup est PIRE que pas de sonde : on apprend a l'ignorer, et on rate le jour
 * ou elle a raison.
 */
const ESSAIS = 3;
const ATTENTE_MS = 20000;

const patienter = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Deuxieme avis, par un chemin different.
 *
 * `/healthz` ne demande pas de cle et ne touche pas la base : il repond des que
 * le service est debout. Le confronter a l'API separe deux pannes que l'alerte
 * confondait, et qui n'appellent pas le meme geste — un serveur a relancer, ou
 * une cle a renouveler.
 */
async function sonderSante() {
  const racine = conf.apiUrl.replace(/\/api\/v1\/?$/, '');
  try {
    const r = await fetch(`${racine}/healthz`, { signal: AbortSignal.timeout(10000) });
    return { ok: r.ok, statut: r.status };
  } catch (e) {
    return { ok: false, statut: null, erreur: e.message };
  }
}

async function n8n(chemin) {
  const reponse = await fetch(`${conf.apiUrl}${chemin}`, {
    headers: { 'X-N8N-API-KEY': conf.apiKey, accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!reponse.ok) {
    throw new Error(`API n8n ${reponse.status} sur ${chemin} — ${nettoyer(await reponse.text(), 200)}`);
  }
  return reponse.json();
}

/**
 * Le texte d'erreur de la derniere execution ratee. C'est LUI qui nomme la
 * cause — « Execution limit reached » pour le quota, un 401 pour une
 * credential revoquee. Sans lui, l'alerte dirait seulement « ca ne tourne
 * plus », ce qui n'aide personne a 6 heures du matin.
 */
async function derniereCause() {
  try {
    const { data } = await n8n('/executions?status=error&limit=1&includeData=true');
    const exec = data?.[0];
    if (!exec) return null;
    const err = exec.data?.resultData?.error;
    return {
      id: exec.id,
      workflowId: exec.workflowId,
      message: nettoyer(err?.message || err?.description || 'sans detail'),
    };
  } catch {
    // Le detail est un confort. Ne jamais laisser son absence empecher l'alerte.
    return null;
  }
}

async function alerter(titre, lignes) {
  const texte = [
    `🚨 ${titre}`,
    '',
    ...lignes,
    '',
    `🔎 ${conf.apiUrl.replace('/api/v1', '')}/home/executions`,
  ].join('\n').slice(0, 3500);

  const reponse = await fetch(`https://api.telegram.org/bot${conf.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: conf.chatId, text: texte, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(20000),
  });
  const corps = await reponse.json().catch(() => ({}));
  if (!reponse.ok || corps.ok !== true) {
    throw new Error(`Telegram a refuse l'alerte — ${reponse.status} ${nettoyer(JSON.stringify(corps), 300)}`);
  }
  console.log(`Alerte delivree dans ${conf.chatId} (message ${corps.result?.message_id}).`);
}

async function main() {
  // 1. Configuration. Une sonde mal configuree qui se tait est pire que pas de
  //    sonde : elle donne l'illusion d'une surveillance. On echoue donc fort,
  //    et l'echec de l'action GitHub previent par courriel.
  const manquantes = [
    !conf.apiKey && 'N8N_API_KEY',
    !conf.botToken && 'TELEGRAM_ALERTE_TOKEN',
  ].filter(Boolean);
  if (manquantes.length) {
    console.error(`Configuration incomplete — secrets absents : ${manquantes.join(', ')}`);
    process.exit(1);
  }

  // 2. Eprouver le cablage sans attendre une vraie panne. Un garde-fou jamais
  //    declenche n'est pas un garde-fou, c'est une intention.
  if (process.env.VEILLE_FORCER_ALERTE === '1') {
    await alerter("TEST DE LA SONDE — ceci n'est pas une panne", [
      'Si tu lis ce message, le cablage fonctionne :',
      "l'action GitHub, le jeton du bot et le groupe technique.",
      `Emis le ${horodatage(new Date())}.`,
    ]);
    return;
  }

  // 3. Hors des heures de service, le temoin ne tourne pas : son silence est
  //    normal et ne prouve rien. Un declenchement manuel passe outre — c'est
  //    justement ce qu'on fait pour tester.
  const heure = heureLocale();
  const manuel = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
  if (!manuel && (heure < conf.heureDebut || heure > conf.heureFin)) {
    console.log(`${heure}h a Abidjan — hors fenetre de service (${conf.heureDebut}h-${conf.heureFin}h), rien a verifier.`);
    return;
  }

  // 4. n8n repond-il seulement ? Une instance injoignable, une cle d'API
  //    revoquee ou un domaine expire tombent ici.
  let derniere;
  let echec = null;

  // UNE SEULE TENTATIVE RATEE N'EST PAS UNE PANNE. Le 17 aout a 19h45 cette
  // alerte est partie alors que n8n tournait parfaitement : l'execution 298 a
  // reussi a la seconde meme, et aucune des 250 executions suivantes n'a
  // echoue. C'etait le reseau entre GitHub et le VPS qui avait lache un
  // instant.
  for (let essai = 1; essai <= ESSAIS; essai++) {
    try {
      const { data } = await n8n(`/executions?workflowId=${conf.canari}&status=success&limit=1`);
      derniere = data?.[0];
      echec = null;
      break;
    } catch (e) {
      echec = e;
      if (essai < ESSAIS) await patienter(ATTENTE_MS);
    }
  }

  if (echec) {
    // Deuxieme avis avant d'accuser. `/healthz` separe deux pannes que le
    // message confondait — « le serveur est arrete » et « ma cle ne passe
    // plus » — et elles n'appellent ni la meme urgence ni le meme geste.
    const sante = await sonderSante();

    await alerter(
      sante.ok ? "la sonde n'a plus acces a l'API n8n" : 'n8n est injoignable depuis la sonde',
      sante.ok
        ? [
            'Le service est VIVANT — /healthz repond — mais l API rejette la sonde.',
            "La cle d API est probablement revoquee, expiree, ou absente du depot.",
            '',
            `Cause : ${nettoyer(echec.message)}`,
            '',
            "LES COMMANDES CONTINUENT D ETRE TRAITEES. C est la surveillance qui est aveugle.",
          ]
        : [
            `Aucune reponse apres ${ESSAIS} tentatives espacees de ${Math.round(ATTENTE_MS / 1000)}s.`,
            `/healthz ne repond pas non plus${sante.erreur ? ` (${nettoyer(sante.erreur, 80)})` : ''}.`,
            '',
            `Cause : ${nettoyer(echec.message)}`,
            '',
            "SI le serveur est bien arrete, aucune commande n est traitee.",
            "Mais cette sonde ne sait pas distinguer un serveur arrete d une coupure reseau chez GitHub. Ouvrez le lien avant de conclure.",
          ],
    );
    return;
  }

  // 5. Le temoin a-t-il reussi recemment ? C'est ici que le quota se voit :
  //    l'API repond, les executions existent, mais elles sont toutes en erreur.
  const depuis = derniere?.startedAt ? new Date(derniere.startedAt) : null;
  const minutes = depuis ? Math.round((Date.now() - depuis.getTime()) / 60000) : null;

  if (!depuis || minutes > conf.toleranceMin) {
    const cause = await derniereCause();
    const quota = /execution limit|limit reached|upgrade/i.test(cause?.message || '');

    await alerter("n8n n'execute plus", [
      `Temoin : ${conf.nomCanari}, attendu toutes les heures de ${conf.heureDebut}h a ${conf.heureFin}h.`,
      depuis
        ? `Derniere reussite : ${horodatage(depuis)}, il y a ${minutes} minutes.`
        : 'Aucune execution reussie trouvee.',
      ...(cause ? ['', `Derniere erreur (execution ${cause.id}) :`, cause.message] : []),
      '',
      // Le quota n'existe plus depuis le passage a l'auto-hebergement : le
      // conseil ne vaut que si l'on etait revenu sur une offre managee. On
      // garde la detection — elle ne coute rien et l'histoire montre qu'on
      // regrette les garde-fous retires trop tot.
      quota
        ? "👉 Un quota d'executions est epuise. Sur une offre managee, releve le plan ; en auto-heberge, ce message ne devrait pas apparaitre."
        : "👉 Ouvre les executions n8n : la cause y est nommee. Si l'API ne repond pas du tout, verifie le conteneur sur le VPS (docker ps, docker logs n8n-n8n-1).",
      '',
      "Tant que ceci dure, AUCUNE commande n'est traitee et aucun livreur n'est alerte.",
    ]);
    return;
  }

  console.log(`OK — ${conf.nomCanari} a reussi il y a ${minutes} minutes (${horodatage(depuis)}).`);
}

/**
 * Un echec ici veut dire « la sonde n'a pas pu faire son travail » : c'est le
 * seul cas ou l'action GitHub doit rougir, car alors GitHub previent par
 * courriel. Une panne detectee ET signalee est un succes de la sonde.
 */
main().catch((e) => {
  console.error(`Sonde en echec — ${e.message}`);
  process.exit(1);
});
