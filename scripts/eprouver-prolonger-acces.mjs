/**
 * Éprouve `prolonger_acces` POUR DE BON, sur un utilisateur jetable.
 *
 * C'est la dernière marche de la chaîne de paiement — celle qui ouvre les
 * droits une fois l'argent reçu — et elle n'a jamais tourné après un vrai
 * encaissement. Aucun test ne la nomme.
 *
 * On appelle la RPC exactement comme le fait `prolongerAcces()` :
 *   sb.rpc('prolonger_acces', { p_user_id, p_plan_key, p_mois, p_reference })
 *
 * L'utilisateur est créé puis SUPPRIMÉ, quoi qu'il arrive. Aucun marchand réel
 * n'est touché : la RPC est clé sur `user_id`, jamais sur une boutique.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Les cles, lues dans .env.local comme le fait le reste des scripts.
function env(nom) {
  if (process.env[nom]) return process.env[nom];
  try {
    const fichier = readFileSync('.env.local', 'utf8');
    const ligne = fichier.split('\n').find((l) => l.startsWith(`${nom}=`));
    return ligne ? ligne.slice(nom.length + 1).trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

const url = env('NEXT_PUBLIC_SUPABASE_URL');
const cle = env('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !cle) {
  console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.');
  process.exit(2);
}
const sb = createClient(url, cle, { auth: { persistSession: false } });

let reussis = 0;
let echecs = 0;
function verifier(titre, ok, detail = '') {
  if (ok) { reussis += 1; console.log(`  ✓ ${titre}`); }
  else { echecs += 1; console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ''}`); }
}

const EMAIL = 'banc-prolonger-acces@example.com';
let userId = null;

const jours = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

try {
  // ---- l'utilisateur jetable
  const { data: cree, error: errCreation } = await sb.auth.admin.createUser({
    email: EMAIL,
    password: `banc-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    email_confirm: true,
  });
  if (errCreation) throw new Error(`création impossible — ${errCreation.message}`);
  userId = cree.user.id;
  console.log(`utilisateur jetable ${userId}\n`);

  const appel = (params) => sb.rpc('prolonger_acces', params);

  // ---- 1. le premier paiement ouvre les droits
  console.log('1. Le premier paiement ouvre les droits');
  const r1 = await appel({
    p_user_id: userId, p_plan_key: 'pro', p_mois: 1, p_reference: 'BANC-A',
  });
  verifier('la RPC ne rend pas d erreur', !r1.error, r1.error?.message);
  verifier('elle rend une date', Boolean(r1.data), String(r1.data));
  const fin1 = r1.data;
  verifier('la fin est a ~30 jours', Math.abs(jours(fin1, new Date()) - 30) <= 1,
    `${jours(fin1, new Date())} jours`);

  const { data: abo1 } = await sb.from('subscriptions')
    .select('plan_key, status, last_checkout_session_id').eq('user_id', userId).maybeSingle();
  verifier('l abonnement est actif', abo1?.status === 'active', abo1?.status);
  verifier('le plan est celui paye', abo1?.plan_key === 'pro', abo1?.plan_key);
  verifier('la reference est tracee', abo1?.last_checkout_session_id === 'BANC-A',
    abo1?.last_checkout_session_id);

  // ---- 2. le MEME paiement rejoue ne prolonge pas deux fois
  console.log('\n2. Le meme paiement rejoue — l idempotence par reference');
  const r2 = await appel({
    p_user_id: userId, p_plan_key: 'pro', p_mois: 1, p_reference: 'BANC-A',
  });
  verifier('la RPC ne rend pas d erreur', !r2.error, r2.error?.message);
  verifier('la date N A PAS bouge', String(r2.data) === String(fin1),
    `${fin1} -> ${r2.data}`);

  // ---- 3. un second paiement part de la fin, pas de maintenant
  console.log('\n3. Un second paiement — il part de la fin, pas de maintenant');
  const r3 = await appel({
    p_user_id: userId, p_plan_key: 'pro', p_mois: 1, p_reference: 'BANC-B',
  });
  verifier('la RPC ne rend pas d erreur', !r3.error, r3.error?.message);
  verifier('la fin est a ~60 jours, pas 30', Math.abs(jours(r3.data, new Date()) - 60) <= 1,
    `${jours(r3.data, new Date())} jours`);
  verifier('celui qui paie en avance ne perd rien', jours(r3.data, fin1) >= 29,
    `${jours(r3.data, fin1)} jours ajoutes`);

  // ---- 4. les refus, qui doivent lever proprement
  console.log('\n4. Les refus');
  const r4 = await appel({
    p_user_id: userId, p_plan_key: 'pro', p_mois: 0, p_reference: 'BANC-C',
  });
  verifier('zero mois est refuse', Boolean(r4.error), 'aucune erreur rendue');
  const r5 = await appel({
    p_user_id: userId, p_plan_key: 'pro', p_mois: 1, p_reference: '   ',
  });
  verifier('une reference vide est refusee', Boolean(r5.error), 'aucune erreur rendue');

  const { data: apresRefus } = await sb.from('subscriptions')
    .select('current_period_end').eq('user_id', userId).maybeSingle();
  verifier('un refus n a rien deplace',
    String(apresRefus?.current_period_end) === String(r3.data),
    `${r3.data} -> ${apresRefus?.current_period_end}`);
} catch (e) {
  echecs += 1;
  console.log(`\n✗ ARRET — ${e.message}`);
} finally {
  // ---- le menage, garanti
  if (userId) {
    await sb.from('subscriptions').delete().eq('user_id', userId);
    const { error: errSupp } = await sb.auth.admin.deleteUser(userId);
    const { data: reste } = await sb.from('subscriptions')
      .select('user_id').eq('user_id', userId).maybeSingle();
    console.log('\n--- menage ---');
    verifier('l abonnement jetable a disparu', !reste);
    verifier('l utilisateur jetable a disparu', !errSupp, errSupp?.message);
  }
}

console.log(`\n${reussis} controle(s) reussi(s), ${echecs} echec(s)`);
process.exit(echecs ? 1 : 0);
