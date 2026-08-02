'use client';

import Link from 'next/link';
import { Settings, ArrowLeft } from 'lucide-react';

export default function ReglagesPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8 flex items-center justify-center">
      <div className="text-center">
        <Settings className="w-16 h-16 text-amber-600 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Réglages</h1>
        <p className="text-gray-600 mb-6">Cette fonctionnalité sera bientôt disponible.</p>
        <Link href="/dashboard" className="inline-flex items-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition">
          <ArrowLeft className="w-5 h-5" />
          Retour au dashboard
        </Link>
      </div>
    </div>
  );
}