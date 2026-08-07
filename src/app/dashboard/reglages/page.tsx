'use client';

import { User, Store, Shield, ChevronRight } from 'lucide-react';
import { LienRetour } from '@/components/ui/Bouton';
import Link from 'next/link';

export default function ReglagesPage() {
  const menuItems = [
    {
      title: 'Profil',
      description: 'Modifiez vos informations personnelles',
      icon: User,
      href: '/dashboard/reglages/profil',
      color: 'bg-blue-50 text-blue-600'
    },
    {
      title: 'Boutique',
      description: 'Paramètres de votre boutique',
      icon: Store,
      href: '/dashboard/reglages/boutique',
      color: 'bg-green-50 text-green-600'
    },
    {
      title: 'Sécurité',
      description: 'Gérez votre mot de passe et authentification',
      icon: Shield,
      href: '/dashboard/reglages/securite',
      color: 'bg-red-50 text-red-600'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <LienRetour href="/dashboard">Retour au dashboard</LienRetour>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Réglages</h1>
          <p className="text-gray-600 mt-1">Gérez les paramètres de votre compte</p>
        </div>
      </div>

      {/* Menu des réglages */}
      <div className="max-w-4xl mx-auto space-y-4">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block bg-white rounded-xl p-6 border border-gray-100 hover:shadow-lg transition"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${item.color}`}>
                  <item.icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                  <p className="text-sm text-gray-500">{item.description}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}