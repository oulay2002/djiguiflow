'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Bell,
  Phone,
  MessageCircle,
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const { data: boutique } = await supabase
      .from('boutiques')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!boutique) {
      setLoading(false);
      return;
    }

    setBoutiqueId(boutique.id);

    const { data } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('boutique_id', boutique.id)
      .single();

    if (data) {
      setSettings(data as NotificationSettings);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadSettings();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadSettings]);

  const saveSettings = async () => {
    setSaving(true);
    setSuccess(false);

    const { error } = await supabase
      .from('notification_settings')
      .upsert({
        boutique_id: boutiqueId,
        ...settings,
        updated_at: new Date().toISOString(),
      });

    if (!error) {
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-gray-600 hover:text-amber-600 transition mb-2">
          <span>← Retour au dashboard</span>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Paramètres de Notification</h1>
          <p className="text-gray-600 mt-1">Configurez vos préférences de notification</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* WhatsApp */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl p-6 border border-gray-100"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-50 rounded-lg">
                <MessageCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">WhatsApp</h2>
                <p className="text-sm text-gray-500">Recevez les notifications sur WhatsApp</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.whatsapp_actif}
                onChange={() => toggleNotification('whatsapp_actif')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
            </label>
          </div>

          {settings.whatsapp_actif && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Numéro WhatsApp
                </label>
                <input
                  type="tel"
                  value={settings.whatsapp_numero}
                  onChange={(e) => setSettings({ ...settings, whatsapp_numero: e.target.value })}
                  placeholder="Ex: 0759486701"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Format : numéro local (ex: 0759486701)
                </p>
              </div>
            </div>
          )}
        </motion.div>

        {/* Telegram */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl p-6 border border-gray-100"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-50 rounded-lg">
                <Phone className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Telegram</h2>
                <p className="text-sm text-gray-500">Recevez les notifications sur Telegram</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.telegram_actif}
                onChange={() => toggleNotification('telegram_actif')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {settings.telegram_actif && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chat ID Telegram
                </label>
                <input
                  type="text"
                  value={settings.telegram_chat_id}
                  onChange={(e) => setSettings({ ...settings, telegram_chat_id: e.target.value })}
                  placeholder="Ex: 123456789"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Obtenez votre Chat ID via @userinfobot sur Telegram
                </p>
              </div>
            </div>
          )}
        </motion.div>

        {/* Types de notifications */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl p-6 border border-gray-100"
        >
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Bell className="w-6 h-6 text-amber-600" />
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
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Paramètres sauvegardés !</span>
            </div>
          )}
          <button
            onClick={saveSettings}
            disabled={saving}
            className="ml-auto flex items-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition font-medium disabled:opacity-50"
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
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5 text-gray-600" />
        <div>
          <p className="font-medium text-gray-900">{label}</p>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
      </label>
    </div>
  );
}