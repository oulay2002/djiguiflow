'use client';

import { useEffect, useState } from 'react';
import { fetchDashboard } from '@/lib/apiClient';

type Boutique = {
  id: string;
  nom: string | null;
  telephone: string | null;
  telegram_marchand: string | null;
  groupe_livreurs: string | null;
  sheet_commandes: string | null;
  sheet_menu: string | null;
  sheet_notes: string | null;
  slug?: string | null;
  // Etat de branchement des canaux. Les jetons eux-memes ne sortent jamais du
  // serveur : la page ne sait que s'ils existent.
  whatsapp_connecte?: boolean;
  whatsapp_webhook_protege?: boolean;
  telegram_connecte?: boolean;
  telegram_webhook_branche?: boolean;
};

function Etat({ actif, quand, sinon }: { actif?: boolean; quand: string; sinon: string }) {
  return (
    <span className={actif ? 'text-green-700' : 'text-gray-500'}>
      {actif ? `✅ ${quand}` : `○ ${sinon}`}
    </span>
  );
}

export default function OnboardingPage() {
  const [boutique, setBoutique] = useState<Boutique | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchDashboard('/api/onboarding');
        if (r.ok) {
          setBoutique(await r.json());
        } else {
          const j = await r.json().catch(() => null);
          setMessage('❌ ' + (j?.error || `HTTP ${r.status}`));
        }
      } catch {
        setMessage('❌ Connexion impossible — êtes-vous connecté ?');
      }
      setLoading(false);
    })();
  }, []);

  const save = async (field: string, value: string) => {
    setMessage('…');
    try {
      const r = await fetchDashboard('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      const j = await r.json().catch(() => null);
      if (r.ok) {
        // La fiche renvoyee fait foi : elle porte l'etat de branchement
        // recalcule, que la page ne saurait pas deviner seule.
        setBoutique((b) => (j?.boutique ? j.boutique : b ? { ...b, [field]: value } : b));
        setMessage(j?.faits?.length ? `✅ ${j.faits.join(' · ')}` : '✅ Enregistré');
      } else {
        setMessage('❌ ' + (j?.error || 'Erreur'));
      }
    } catch {
      setMessage('❌ Enregistrement impossible');
    }
    setTimeout(() => setMessage(''), 5000);
  };

  /** Un secret ne se reaffiche pas : le champ se vide une fois envoye. */
  const saveSecret = async (field: string, e: React.FocusEvent<HTMLInputElement>) => {
    const valeur = e.target.value.trim();
    if (!valeur) return;
    e.target.value = '';
    await save(field, valeur);
  };

  if (loading) return <div className="p-8">Chargement…</div>;

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-3xl font-bold">🏭 Onboarding — {boutique?.nom || 'ma boutique'}</h1>
      <p className="text-gray-600">
        Configurez votre boutique : les workflows s&apos;adaptent automatiquement.
      </p>

      {message && <div className="p-3 bg-blue-50 rounded">{message}</div>}

      {!boutique && !message && (
        <div className="p-3 bg-red-50 text-red-700 rounded">
          Boutique introuvable — vérifiez que vous êtes connecté.
        </div>
      )}

      {boutique && (
        <>
          <section className="border rounded-lg p-4 space-y-2">
            <h2 className="font-semibold">📱 1. Numéro WhatsApp Business</h2>
            <p className="text-sm text-gray-600">Format international sans + (ex : 2250759486701)</p>
            <input
              key={'tel' + (boutique.telephone || '')}
              defaultValue={boutique.telephone || ''}
              onBlur={(e) => save('telephone', e.target.value)}
              className="w-full border rounded p-2"
            />
          </section>

          <section className="border rounded-lg p-4 space-y-3">
            <h2 className="font-semibold">🔑 2. Connectez vos comptes</h2>
            <p className="text-sm text-gray-600">
              Vos clients écrivent à <b>votre</b> numéro et à <b>votre</b> bot. Ces clés partent
              dans un coffre chiffré : elles ne réapparaîtront jamais ici, et personne d&apos;autre
              ne les lit.
            </p>

            <div className="space-y-1">
              <label className="text-sm font-medium">Clé API WhatsApp (wasender)</label>
              <input
                type="password"
                autoComplete="off"
                onBlur={(e) => saveSecret('wasender_token', e)}
                className="w-full border rounded p-2"
                placeholder={boutique.whatsapp_connecte ? '•••••• déjà connecté' : 'collez la clé'}
              />
              <p className="text-xs">
                <Etat
                  actif={boutique.whatsapp_connecte}
                  quand="WhatsApp connecté"
                  sinon="WhatsApp pas encore connecté"
                />
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Secret du webhook wasender</label>
              <input
                type="password"
                autoComplete="off"
                onBlur={(e) => saveSecret('wasender_webhook_secret', e)}
                className="w-full border rounded p-2"
                placeholder={boutique.whatsapp_webhook_protege ? '•••••• déjà posé' : 'collez le secret'}
              />
              <p className="text-xs text-gray-600">
                Dans wasender, pointez le webhook sur
                {' '}<code>https://oulai2002.app.n8n.cloud/webhook/1b96720c-e3b3-4638-a351-7f3704bd483e/whatsapp/{String(boutique.slug ?? '')}</code>
                {' '}puis collez ici le secret qu&apos;il affiche.{' '}
                <Etat
                  actif={boutique.whatsapp_webhook_protege}
                  quand="webhook protégé"
                  sinon="webhook non protégé"
                />
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Jeton du bot Telegram</label>
              <input
                type="password"
                autoComplete="off"
                onBlur={(e) => saveSecret('telegram_bot_token', e)}
                className="w-full border rounded p-2"
                placeholder={boutique.telegram_connecte ? '•••••• déjà connecté' : 'collez le jeton donné par @BotFather'}
              />
              <p className="text-xs text-gray-600">
                Créez votre bot avec <b>@BotFather</b> sur Telegram et collez son jeton : nous le
                branchons tout seuls.{' '}
                <Etat
                  actif={boutique.telegram_webhook_branche}
                  quand="bot branché"
                  sinon="bot pas encore branché"
                />
              </p>
            </div>
          </section>

          <section className="border rounded-lg p-4 space-y-2">
            <h2 className="font-semibold">💬 3. Votre ID Telegram (alertes)</h2>
            <p className="text-sm text-gray-600">
              Écrivez <code>ID</code> en privé à <b>votre bot</b>, copiez la réponse.
            </p>
            <input
              key={'tg' + (boutique.telegram_marchand || '')}
              defaultValue={boutique.telegram_marchand || ''}
              onBlur={(e) => save('telegram_marchand', e.target.value)}
              className="w-full border rounded p-2"
              placeholder="ex : 1724402569"
            />
          </section>

          <section className="border rounded-lg p-4 space-y-2">
            <h2 className="font-semibold">🚚 4. ID du groupe livreurs</h2>
            <p className="text-sm text-gray-600">
              Créez le groupe, ajoutez <b>votre bot</b>, envoyez <code>ID</code> dans le groupe.
            </p>
            <input
              key={'gr' + (boutique.groupe_livreurs || '')}
              defaultValue={boutique.groupe_livreurs || ''}
              onBlur={(e) => save('groupe_livreurs', e.target.value)}
              className="w-full border rounded p-2"
              placeholder="ex : -1004461402565"
            />
          </section>

          <section className="border rounded-lg p-4 space-y-2">
            <h2 className="font-semibold">📊 5. Noms des feuilles Google</h2>
            <div className="grid grid-cols-3 gap-2">
              <input
                key={'sc' + (boutique.sheet_commandes || '')}
                defaultValue={boutique.sheet_commandes || ''}
                onBlur={(e) => save('sheet_commandes', e.target.value)}
                className="border rounded p-2"
                placeholder="Commandes_Zahara"
              />
              <input
                key={'sm' + (boutique.sheet_menu || '')}
                defaultValue={boutique.sheet_menu || ''}
                onBlur={(e) => save('sheet_menu', e.target.value)}
                className="border rounded p-2"
                placeholder="Menu"
              />
              <input
                key={'sn' + (boutique.sheet_notes || '')}
                defaultValue={boutique.sheet_notes || ''}
                onBlur={(e) => save('sheet_notes', e.target.value)}
                className="border rounded p-2"
                placeholder="Notes"
              />
            </div>
          </section>

          <a
            href="/dashboard"
            className="inline-block bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            → Retour au dashboard
          </a>
        </>
      )}
    </div>
  );
}