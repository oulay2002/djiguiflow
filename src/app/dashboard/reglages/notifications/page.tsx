'use client';

import { useCallback, useEffect, useState } from 'react';
import { LienRetour, classesBouton } from '@/components/ui/Bouton';
import { supabase, utilisateurCourant } from '@/lib/supabase';
import { useBoutique, uuidBoutiqueCourante } from '@/lib/boutique';
import ReglagePush from '@/components/pwa/ReglagePush';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Bell,
  Save,
  Loader2,
  CheckCircle,
  ShoppingBag,
  Truck,
  Package,
  BarChart3,
  AlertTriangle,
  type LucideIcon
} from 'lucide-react';

type NotificationSettings = {
  whatsapp_numero: string;
  whatsapp_actif: boolean;
  telegram_chat_id: string;
  telegram_actif: boolean;
  notif_nouvelle_commande: boolean;
  notif_assignation_livreur: boolean;
  notif_statut_livraison: boolean;
  notif_rapport_quotidien: boolean;
  notif_stock_faible: boolean;
};

export default function NotificationsPage() {
  const router = useRouter();
  const { boutiqueId: boutiqueSlug } = useBoutique();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [erreur, setErreur] = useState('');
  const [boutiqueId, setBoutiqueId] = useState<string>('');
  const [settings, setSettings] = useState<NotificationSettings>({
    whatsapp_numero: '',
    whatsapp_actif: true,
    telegram_chat_id: '',
    telegram_actif: false,
    notif_nouvelle_commande: true,
    notif_assignation_livreur: true,
    notif_statut_livraison: true,
    notif_rapport_quotidien: true,
    notif_stock_faible: true,
  });

  const loadSettings = useCallback(async () => {
    const user = await utilisateurCourant();
    if (!user) {
      router.push('/login');
      return;
    }

    const uuid = await uuidBoutiqueCourante(boutiqueSlug);
    if (!uuid) {
      setLoading(false);
      return;
    }

    setBoutiqueId(uuid);

    // `maybeSingle` et non `single` : une boutique qui n'a jamais touche a ses
    // preferences n'a pas de ligne ici, et l'absence n'est pas une erreur — on
    // affiche alors les valeurs par defaut. `single` repondait 406 a chaque
    // ouverture de l'ecran.
    const { data } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('boutique_id', uuid)
      .maybeSingle();

    if (data) {
      setSettings(data as NotificationSettings);
    }
    setLoading(false);
  }, [router, boutiqueSlug]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadSettings();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadSettings]);

  const saveSettings = async () => {
    setSaving(true);
    setSuccess(false);

    /**
     * `onConflict` SUR LA VRAIE CONTRAINTE.
     *
     * Sans lui, l'upsert vise la cle primaire `id` -- absente de la charge --
     * et tente donc un INSERT, qui se heurte a
     * `notification_settings_boutique_id_key`. Or la ligne existe TOUJOURS :
     * elle est creee au provisionnement de la boutique.
     *
     * L'ecriture echouait donc a chaque fois, et il n'y avait AUCUNE branche
     * d'erreur : ni succes ni message, le bouton redevenait simplement
     * « Sauvegarder ». Le marchand cliquait, recliquait, et croyait
     * l'application morte.
     */
    const { error } = await supabase
      .from('notification_settings')
      .upsert(
        {
          boutique_id: boutiqueId,
          ...settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'boutique_id' },
      );

    if (error) {
      console.error('Notifications — enregistrement impossible :', error.message);
      setErreur('Vos préférences n’ont pas pu être enregistrées. Réessayez.');
    } else {
      setErreur('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
    setSaving(false);
  };

  const toggleNotification = (key: keyof NotificationSettings) => {
    setSettings({ ...settings, [key]: !settings[key] });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-nuit-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <LienRetour href="/dashboard">Retour au tableau de bord</LienRetour>
        <div>
          <h1 className="font-display text-3xl font-bold text-nuit-900">Notifications</h1>
          <p className="text-chaux-600 mt-1">Ce que vous recevez, et sur quel canal.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Push : place en premier parce que c'est le canal le plus rapide —
            les autres passent par un fournisseur tiers, celui-ci sonne
            directement sur l'appareil. */}
        <ReglagePush />

        {/**
         * LES DEUX BLOCS DE CANAL ONT ETE RETIRES, ET C'EST LE CORRECTIF.
         *
         * Cet ecran portait deux interrupteurs « Recevez les notifications sur
         * WhatsApp / sur Telegram » et, sous chacun, un champ : un numero
         * WhatsApp, un identifiant Telegram.
         *
         * RIEN DE TOUT CELA N'ETAIT LU. Ni `whatsapp_actif`, ni
         * `telegram_actif`, ni `whatsapp_numero`, ni `telegram_chat_id` :
         * ecrits par cet ecran, lus NULLE PART dans l'application. Le marchand
         * saisissait son identifiant Telegram, enregistrait, et la valeur
         * dormait en base.
         *
         * PIRE QUE DECORATIF : L'ETAPE 3 DE « BRANCHEMENT » DEMANDE LA MEME
         * CHOSE, et celle-la est utilisee — c'est elle qui porte les alertes du
         * gerant. Deux ecrans posaient la meme question, un seul s'en servait.
         * Un marchand qui remplissait celui-ci et pas l'autre ne recevait
         * aucune alerte, sans aucun moyen de comprendre pourquoi. Meme motif
         * que les deux champs de livraison de « Ma boutique », ferme le meme
         * jour.
         *
         * ON NE LES A PAS « FAIT MARCHER », ET C'EST DELIBERE. Mesure du
         * 23 aout 2026 : `telegram_actif` vaut `false` par defaut, et une
         * boutique reelle sur deux le portait a `false` TOUT EN ETANT prevenue
         * sur Telegram. Les honorer aurait coupe ses alertes le soir meme. Ces
         * colonnes decrivent un etat que personne n'a jamais tenu ; la source
         * de verite est le raccordement.
         *
         * Le bandeau d'avertissement disparait avec eux : il n'existait que
         * pour couvrir ce que l'ecran promettait sans le faire. Ce qui reste
         * est vrai sans reserve.
         */}
        <div className="border border-[var(--hairline)] bg-chaux-50 px-4 py-3">
          <p className="text-sm font-bold text-nuit-900">
            Ce que vous choisissez ici est appliqué à vos alertes.
          </p>
          <p className="mt-1 text-sm text-chaux-600">
            Le <b>canal</b> sur lequel vous êtes prévenu — WhatsApp ou Telegram — se
            règle dans{' '}
            <Link href="/onboarding" className="font-semibold underline underline-offset-4">
              Branchement
            </Link>
            , avec le reste de votre raccordement.
          </p>
        </div>

        {/* Types de notifications */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 border border-chaux-200"
        >
          <h2 className="text-xl font-bold text-nuit-900 mb-6 flex items-center gap-2">
            <Bell className="w-6 h-6 text-mangue-500" />
            Types de notifications
          </h2>

          <div className="space-y-4">
            <NotificationToggle
              icon={ShoppingBag}
              label="Nouvelle commande"
              description="Recevoir une notification quand une nouvelle commande est passée"
              checked={settings.notif_nouvelle_commande}
              onChange={() => toggleNotification('notif_nouvelle_commande')}
            />
            <NotificationToggle
              icon={Truck}
              label="Assignation livreur"
              description="Notifier le livreur quand une livraison lui est assignée"
              checked={settings.notif_assignation_livreur}
              onChange={() => toggleNotification('notif_assignation_livreur')}
            />
            <NotificationToggle
              icon={Package}
              label="Statut de livraison"
              description="Notifier le client quand le statut de sa commande change"
              checked={settings.notif_statut_livraison}
              onChange={() => toggleNotification('notif_statut_livraison')}
            />
            <NotificationToggle
              icon={BarChart3}
              label="Rapport quotidien"
              description="Recevoir un résumé quotidien de votre activité"
              checked={settings.notif_rapport_quotidien}
              onChange={() => toggleNotification('notif_rapport_quotidien')}
            />
            <NotificationToggle
              icon={AlertTriangle}
              label="Alerte stock faible"
              description="Être alerté quand un produit a moins de 5 unités"
              checked={settings.notif_stock_faible}
              onChange={() => toggleNotification('notif_stock_faible')}
            />
          </div>
        </motion.div>

        {/* Bouton Sauvegarder */}
        <div className="flex items-center justify-between">
          {success && (
            <div className="flex items-center gap-2 text-accent-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Paramètres sauvegardés !</span>
            </div>
          )}
          {/* Un echec doit se voir. Il ne se voyait pas : ni succes ni message,
              le bouton redevenait « Sauvegarder » et le marchand recliquait. */}
          {erreur && (
            <p role="alert" className="text-sm font-medium text-bissap-700">
              {erreur}
            </p>
          )}
          <button
            onClick={saveSettings}
            disabled={saving}
            className={`${classesBouton('action')} ml-auto px-6`}
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Sauvegarde...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Sauvegarder
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

type NotificationToggleProps = {
  icon: LucideIcon;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
};

function NotificationToggle({ icon: Icon, label, description, checked, onChange }: NotificationToggleProps) {
  return (
    <div className="flex items-center justify-between p-4 bg-chaux-50 hover:bg-chaux-100 transition">
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5 text-chaux-600" />
        <div>
          <p className="font-medium text-nuit-900">{label}</p>
          <p className="text-sm text-chaux-600">{description}</p>
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-chaux-200 peer-focus:outline-none peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-chaux-300 after:border after: after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-500"></div>
      </label>
    </div>
  );
}