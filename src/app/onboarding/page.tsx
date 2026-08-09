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
};

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
        setBoutique((b) => (b ? { ...b, [field]: value } : b));
        setMessage('✅ Enregistré');
      } else {
        setMessage('❌ ' + (j?.error || 'Erreur'));
      }
    } catch {
      setMessage('❌ Enregistrement impossible');
    }
    setTimeout(() => setMessage(''), 3000);
  };

  if (loading) return <div className="p-8">Chargement…</div>;

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-3xl font-bold">🏭 Onboarding — {boutique?.nom || 'ma boutique'}</h1>
      <p className="text-gray-600">
        Configurez votre boutique : les workflows s'adaptent automatiquement.
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

          <section className="border rounded-lg p-4 space-y-2">
            <h2 className="font-semibold">💬 2. Votre ID Telegram (alertes)</h2>
            <p className="text-sm text-gray-600">
              Envoyez <code>ID</code> à <b>MissKouameBot</b> en privé, copiez la réponse.
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
            <h2 className="font-semibold">🚚 3. ID du groupe livreurs</h2>
            <p className="text-sm text-gray-600">
              Créez le groupe, ajoutez <b>MissKouameBot</b>, envoyez <code>ID</code> dans le groupe.
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
            <h2 className="font-semibold">📊 4. Noms des feuilles Google</h2>
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