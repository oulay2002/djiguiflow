'use client';

import { User, Store, Shield, Bell, ChevronRight } from 'lucide-react';
import { LienRetour } from '@/components/ui/Bouton';
import Link from 'next/link';

export default function ReglagesPage() {
  const menuItems = [
    {
      title: 'Profil',
      description: 'Votre nom, votre numéro, votre email',
      icon: User,
      href: '/dashboard/reglages/profil',
      color: 'bg-nuit-50 text-nuit-600'
    },
    {
      // Pas de page dediee sous /reglages : la fiche boutique existe deja et
      // gere le cas multi-boutiques. Un doublon divergerait a la premiere
      // evolution du formulaire.
      title: 'Boutique',
      description: 'Nom, quartier, horaires et catégorie',
      icon: Store,
      href: '/dashboard/ma-boutique',
      color: 'bg-accent-50 text-accent-600'
    },
    {
      title: 'Notifications',
      description: 'WhatsApp, Telegram et alertes',
      icon: Bell,
      href: '/dashboard/reglages/notifications',
      color: 'bg-mangue-50 text-mangue-700'
    },
    {
      title: 'Sécurité',
      description: 'Mot de passe et appareils connectés',
      icon: Shield,
      href: '/dashboard/reglages/securite',
      color: 'bg-bissap-50 text-bissap-600'
    }
  ];

  return (
    <div className="min-h-screen bg-[var(--background)] p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <LienRetour href="/dashboard">Retour au dashboard</LienRetour>
        <div>
          <h1 className="font-display text-3xl font-bold text-nuit-900">Réglages</h1>
          <p className="text-chaux-600 mt-1">Votre compte, votre boutique, et ce que vous recevez.</p>
        </div>
      </div>

      {/* Menu des réglages */}
      <div className="max-w-4xl mx-auto space-y-4">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block bg-white rounded-xl p-6 border border-chaux-200 hover:shadow-lg transition"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${item.color}`}>
                  <item.icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-nuit-900">{item.title}</h3>
                  <p className="text-sm text-chaux-600">{item.description}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-chaux-400" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}