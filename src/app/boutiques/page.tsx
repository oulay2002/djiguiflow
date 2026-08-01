'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
  Search, 
  MapPin, 
  Star, 
  ShoppingBag, 
  ArrowLeft, 
  Filter,
  Phone,
  Clock
} from 'lucide-react';

// Données de démonstration (Mock Data)
const mockShops = [
  {
    id: 1,
    name: 'Chez Aminata',
    owner: 'Aminata D.',
    zone: 'Cocody - Angré',
    category: 'Restaurant',
    rating: 4.8,
    productsCount: 24,
    deliveryTime: '30-45 min',
    color: 'from-orange-400 to-red-500',
    initials: 'CA'
  },
  {
    id: 2,
    name: 'Le Maquis du Coin',
    owner: 'Koffi M.',
    zone: 'Yopougon - Niangon',
    category: 'Maquis',
    rating: 4.6,
    productsCount: 18,
    deliveryTime: '20-30 min',
    color: 'from-green-400 to-emerald-600',
    initials: 'MC'
  },
  {
    id: 3,
    name: 'Boutique Électro Plus',
    owner: 'Jean P.',
    zone: 'Plateau - Centre',
    category: 'Électronique',
    rating: 4.9,
    productsCount: 42,
    deliveryTime: '45-60 min',
    color: 'from-blue-400 to-indigo-600',
    initials: 'BE'
  },
  {
    id: 4,
    name: 'Pharmacie de la Paix',
    owner: 'Dr. Koné',
    zone: 'Marcory - Zone 4',
    category: 'Santé',
    rating: 4.7,
    productsCount: 56,
    deliveryTime: '15-25 min',
    color: 'from-teal-400 to-cyan-600',
    initials: 'PP'
  },
  {
    id: 5,
    name: 'Saveurs d\'Ailleurs',
    owner: 'Fatou B.',
    zone: 'Riviera - Palmeraie',
    category: 'Épicerie',
    rating: 4.5,
    productsCount: 31,
    deliveryTime: '30-40 min',
    color: 'from-purple-400 to-pink-600',
    initials: 'SA'
  },
  {
    id: 6,
    name: 'Tech & Gadgets CI',
    owner: 'Moussa T.',
    zone: 'Abobo - Baoulé',
    category: 'Électronique',
    rating: 4.4,
    productsCount: 15,
    deliveryTime: '40-50 min',
    color: 'from-gray-500 to-gray-700',
    initials: 'TG'
  },
];

const categories = ['Tous', 'Restaurant', 'Maquis', 'Électronique', 'Santé', 'Épicerie'];

export default function MarketplacePage() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tous');

  const filteredShops = mockShops.filter(shop => {
    const matchesSearch = shop.name.toLowerCase().includes(search.toLowerCase()) || 
                          shop.zone.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'Tous' || shop.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* En-tête simplifié */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-amber-700 rounded-lg flex items-center justify-center text-white font-bold">
              D
            </div>
            <span className="font-bold text-xl text-gray-900">DjiguiFlow</span>
          </Link>
          <Link 
            href="/login" 
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition font-medium text-sm"
          >
            Espace Commerçant
          </Link>
        </div>
      </header>

      {/* Section Hero */}
      <div className="bg-gradient-to-br from-amber-50 via-white to-green-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4"
          >
            Explorez les meilleures boutiques <br/>
            <span className="text-amber-600">près de chez vous</span>
          </motion.h1>
          <p className="text-lg text-gray-600 mb-8">
            Découvrez des commerçants de confiance, commandez en quelques clics et faites-vous livrer rapidement.
          </p>

          {/* Barre de recherche */}
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher une boutique, un produit ou une zone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-xl shadow-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-gray-900 placeholder-gray-400"
            />
          </div>
        </div>
      </div>

      {/* Filtres par catégorie */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex gap-3 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition ${
                selectedCategory === cat 
                  ? 'bg-amber-600 text-white shadow-md' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Liste des boutiques */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            {filteredShops.length} boutique{filteredShops.length > 1 ? 's' : ''} trouvée{filteredShops.length > 1 ? 's' : ''}
          </h2>
          <button className="flex items-center gap-2 text-gray-600 hover:text-amber-600 transition">
            <Filter className="w-4 h-4" />
            <span className="text-sm font-medium">Trier par</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredShops.map((shop, index) => (
            <motion.div
              key={shop.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition group cursor-pointer"
            >
              {/* Bannière de la boutique */}
              <div className={`h-32 bg-gradient-to-br ${shop.color} relative p-6 flex items-end`}>
                <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm px-2 py-1 rounded-md text-white text-xs font-medium flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {shop.deliveryTime}
                </div>
                <div className="w-16 h-16 bg-white rounded-xl shadow-lg flex items-center justify-center text-xl font-bold text-gray-900 -mb-8">
                  {shop.initials}
                </div>
              </div>

              {/* Contenu de la carte */}
              <div className="pt-10 px-6 pb-6">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 group-hover:text-amber-600 transition">
                      {shop.name}
                    </h3>
                    <p className="text-sm text-gray-500">{shop.category}</p>
                  </div>
                  <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded-md">
                    <Star className="w-3 h-3 fill-green-600 text-green-600" />
                    <span className="text-sm font-bold text-green-700">{shop.rating}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                  <MapPin className="w-4 h-4" />
                  <span>{shop.zone}</span>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <ShoppingBag className="w-4 h-4 text-amber-600" />
                    <span>{shop.productsCount} produits</span>
                  </div>
                  <button className="px-4 py-2 bg-amber-50 text-amber-700 rounded-lg font-medium text-sm hover:bg-amber-100 transition">
                    Voir la boutique
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {filteredShops.length === 0 && (
          <div className="text-center py-16">
            <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">Aucune boutique ne correspond à votre recherche.</p>
            <button 
              onClick={() => { setSearch(''); setSelectedCategory('Tous'); }}
              className="mt-4 text-amber-600 font-medium hover:underline"
            >
              Réinitialiser les filtres
            </button>
          </div>
        )}
      </div>

      {/* Footer simple */}
      <footer className="bg-white border-t border-gray-100 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
          <p>© 2024 DjiguiFlow. Commerce intelligent, pensé pour l'Afrique.</p>
        </div>
      </footer>
    </div>
  );
}