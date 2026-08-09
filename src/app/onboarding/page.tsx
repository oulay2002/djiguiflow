'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/login';
        return;
      }

        const r = await fetch('/api/onboarding', {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      if (r.ok) {
        setBoutique(await r.json());
      } else {
        const j = await r.json().catch(() => null);
        setMessage('❌ ' + (j?.error || `HTTP ${r.status}`));
      }
      setLoading(false);
    })();
  }, []);

  const save = async (field: string, value: string) => {
    if (!boutique) return;
    setSaving(true);
    setMessage('');
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch('/api/onboarding', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session!.access_token}`,
      },
      body: JSON.stringify({ [field]: value }),
    });
    const j = await r.json();
    if (r.ok) {
      setBoutique({ ...boutique, [field]: value });
      setMessage('✅ Enregistré');
    } else {
      setMessage('❌ ' + (j.error || 'Erreur'));
    }
    setTimeout(() => setMessage(''), 3000);
    setSaving(false);
  };

  if (loading) return <div className="p-8">Chargement…</div>;
  if (!boutique) return <div className="p-8 text-red-600">Boutique introuvable</div>;

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <h1 className="text-3xl font-bold">🏭 Onboarding — {boutique.nom}</h1>
      <p className="text-gray-600">Configurez votre boutique. Les workflows s'adapteront automatiquement.</p>

      {message && <div className="p-3 bg-blue-50 rounded">{message}</div>}

      {/* Étape 1 : WhatsApp */}
      <section className="border rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">📱 1. Numéro WhatsApp Business</h2>
        <p className="text-sm text-gray-600">Format international sans + (ex: 2250759486701)</p>
        <input
          defaultValue={boutique.telephone || ''}
          onBlur={(e) => save('telephone', e.target.value)}
          disabled={saving}
          className="w-full border rounded p-2"
        />
      </section>

      {/* Étape 2 : Telegram marchand */}
      <section className="border rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">💬 2. Votre ID Telegram (alertes)</h2>
        <p className="text-sm text-gray-600">
          Envoyez <code>ID</code> à <b>MissKouameBot</b> en privé, copiez la réponse.
        </p>
        <input
          defaultValue={boutique.telegram_marchand || ''}
          onBlur={(e) => save('telegram_marchand', e.target.value)}
          disabled={saving}
          className="w-full border rounded p-2"
          placeholder="ex: 1724402569"
        />
      </section>

      {/* Étape 3 : Groupe livreurs */}
      <section className="border rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">🚚 3. ID du groupe livreurs</h2>
        <p className="text-sm text-gray-600">
          Créez le groupe, ajoutez <b>MissKouameBot</b> comme membre, puis envoyez <code>ID</code> dans le groupe.
        </p>
        <input
          defaultValue={boutique.groupe_livreurs || ''}
          onBlur={(e) => save('groupe_livreurs', e.target.value)}
          disabled={saving}
          className="w-full border rounded p-2"
          placeholder="ex: -1004461402565"
        />
      </section>

      {/* Étape 4 : Feuilles */}
      <section className="border rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">📊 4. Noms des feuilles Google</h2>
        <div className="grid grid-cols-3 gap-2">
          <input
            defaultValue={boutique.sheet_commandes || ''}
            onBlur={(e) => save('sheet_commandes', e.target.value)}
            disabled={saving}
            placeholder="Commandes_Zahara"
            className="border rounded p-2"
          />
          <input
            defaultValue={boutique.sheet_menu || ''}
            onBlur={(e) => save('sheet_menu', e.target.value)}
            disabled={saving}
            placeholder="Menu"
            className="border rounded p-2"
          />
          <input
            defaultValue={boutique.sheet_notes || ''}
            onBlur={(e) => save('sheet_notes', e.target.value)}
            disabled={saving}
            placeholder="Notes"
            className="border rounded p-2"
          />
        </div>
      </section>

      <a href="/dashboard" className="inline-block bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
        → Retour au dashboard
      </a>
    </div>
  );
}