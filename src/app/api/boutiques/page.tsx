'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Bebas_Neue, Manrope } from 'next/font/google';
import {
  ArrowRight,
  Clock,
  Filter,
  MapPin,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

const bebas = Bebas_Neue({ subsets: ['latin'], weight: '400' });
const manrope = Manrope({ subsets: ['latin'], weight: ['400', '600', '700', '800'] });

type BoutiqueRow = {
  id: string;
  nom: string | null;
  description: string | null;
  zone: string | null;
  categorie: string | null;
  logo_url?: string | null;
  user_id?: string | null;
};

type ProduitRow = {
  id: string;
  boutique_id: string;
  disponible: boolean | null;
};

type MarketplaceShop = {
  id: string;
  name: string;
  zone: string;
  category: string;
  logoUrl: string | null;
  rating: number;
  productsCount: number;
  deliveryTime: string;
  color: string;
  initials: string;
  vibe: string;
  isFeatured: boolean;
};

const sortOptions = [
  { key: 'popularite', label: 'Popularite' },
  { key: 'note', label: 'Meilleure note' },
  { key: 'rapide', label: 'Livraison la plus rapide' },
] as const;

const gradients = [
  'from-orange-400 to-red-500',
  'from-green-400 to-emerald-600',
  'from-blue-400 to-indigo-600',
  'from-teal-400 to-cyan-600',
  'from-purple-400 to-pink-600',
  'from-amber-500 to-orange-700',
];

function buildInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return 'BT';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildDeliveryTime(seed: string): string {
  const hash = hashString(seed);
  const start = 15 + (hash % 6) * 5;
  const end = start + 10 + ((hash >> 3) % 3) * 5;
  return `${start}-${end} min`;
}

function buildRating(seed: string): number {
  const hash = hashString(seed);
  return Number((4.2 + (hash % 8) / 10).toFixed(1));
}

function getSponsoredShopIds(shops: MarketplaceShop[]): Set<string> {
  if (shops.length === 0) {
    return new Set<string>();
  }

  const ranked = [...shops].sort((a, b) => {
    const aScore = a.productsCount + a.rating * 10 + (a.isFeatured ? 15 : 0);
    const bScore = b.productsCount + b.rating * 10 + (b.isFeatured ? 15 : 0);
    return bScore - aScore;
  });

  const sponsoredSlots = Math.max(1, Math.round(shops.length * 0.2));
  return new Set(ranked.slice(0, sponsoredSlots).map((shop: MarketplaceShop) => shop.id));
}

export default function MarketplacePage() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tous');
  const [sortBy, setSortBy] = useState<(typeof sortOptions)[number]['key']>('popularite');
  const [loading, setLoading] = useState(true);
  const [shops, setShops] = useState<MarketplaceShop[]>([]);
  const [failedLogoIds, setFailedLogoIds] = useState<Set<string>>(new Set());
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadMarketplace = async () => {
      setLoading(true);
      setFetchError(null);

      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData.user?.id ?? null;

      const { data: boutiquesData, error: boutiquesError } = await supabase
        .from('boutiques')
        .select('id, nom, description, zone, categorie, logo_url')
        .order('nom', { ascending: true });

      const ownBoutiquesResponse = currentUserId
        ? await supabase
            .from('boutiques')
            .select('id, nom, description, zone, categorie, logo_url, user_id')
            .eq('user_id', currentUserId)
            .order('nom', { ascending: true })
        : null;

      const ownBoutiquesData = (ownBoutiquesResponse?.data as BoutiqueRow[] | null) ?? [];
      const ownBoutiquesError = ownBoutiquesResponse?.error ?? null;

      const mergedBoutiquesById = new Map<string, BoutiqueRow>();
      ((boutiquesData as BoutiqueRow[] | null) ?? []).forEach((boutique) => {
        mergedBoutiquesById.set(boutique.id, boutique);
      });
      ownBoutiquesData.forEach((boutique) => {
        mergedBoutiquesById.set(boutique.id, boutique);
      });
      const mergedBoutiques = Array.from(mergedBoutiquesById.values());

      if (boutiquesError && ownBoutiquesError) {
        if (isMounted) {
          setFetchError('Impossible de charger les boutiques pour le moment.');
          setShops([]);
          setLoading(false);
        }
        return;
      }

      const { data: produitsData, error: produitsError } = await supabase
        .from('produits')
        .select('id, boutique_id, disponible');

      const countsByBoutique = new Map<string, number>();
      const availableCountsByBoutique = new Map<string, number>();
      ((produitsError ? [] : (produitsData as ProduitRow[] | null) ?? [])).forEach((produit) => {
        countsByBoutique.set(produit.boutique_id, (countsByBoutique.get(produit.boutique_id) ?? 0) + 1);
        if (produit.disponible !== false) {
          availableCountsByBoutique.set(
            produit.boutique_id,
            (availableCountsByBoutique.get(produit.boutique_id) ?? 0) + 1,
          );
        }
      });

      const mappedShops: MarketplaceShop[] = mergedBoutiques
        .map((boutique, index) => {
        const name = boutique.nom?.trim() || 'Boutique sans nom';
        const productsCount = countsByBoutique.get(boutique.id) ?? 0;
        const seed = `${boutique.id}-${name}`;
        const fallbackCategory = 'Autre';

        return {
          id: boutique.id,
          name,
          zone: boutique.zone?.trim() || 'Zone non renseignee',
          category: boutique.categorie?.trim() || fallbackCategory,
          logoUrl: boutique.logo_url?.trim() || null,
          rating: buildRating(seed),
          productsCount,
          deliveryTime: buildDeliveryTime(seed),
          color: gradients[index % gradients.length],
          initials: buildInitials(name),
          vibe: boutique.description?.trim() || 'Decouvrez les produits proposes par cette boutique.',
          isFeatured: (availableCountsByBoutique.get(boutique.id) ?? 0) >= 8,
        };
      });

      if (isMounted) {
        setShops(mappedShops);
        setLoading(false);
      }
    };

    void loadMarketplace();

    return () => {
      isMounted = false;
    };
  }, []);

  const categories = useMemo(() => {
    const dynamicCategories = Array.from(new Set(shops.map((shop) => shop.category))).sort((a, b) => a.localeCompare(b));
    return ['Tous', 'Sponsorisees', ...dynamicCategories];
  }, [shops]);

  const sponsoredShopIds = getSponsoredShopIds(shops);

  const filteredShops = shops.filter((shop: MarketplaceShop) => {
    const matchesSearch =
      shop.name.toLowerCase().includes(search.toLowerCase()) ||
      shop.zone.toLowerCase().includes(search.toLowerCase()) ||
      shop.vibe.toLowerCase().includes(search.toLowerCase());

    const matchesCategory =
      selectedCategory === 'Tous' ||
      (selectedCategory === 'Sponsorisees' ? sponsoredShopIds.has(shop.id) : shop.category === selectedCategory);
    return matchesSearch && matchesCategory;
  });

  const sortedShops = [...filteredShops].sort((a: MarketplaceShop, b: MarketplaceShop) => {
    if (sortBy === 'note') return b.rating - a.rating;

    if (sortBy === 'rapide') {
      const aTime = Number.parseInt(a.deliveryTime.split('-')[0], 10);
      const bTime = Number.parseInt(b.deliveryTime.split('-')[0], 10);
      return aTime - bTime;
    }

    const aScore = a.productsCount + a.rating * 10 + (a.isFeatured ? 15 : 0);
    const bScore = b.productsCount + b.rating * 10 + (b.isFeatured ? 15 : 0);
    return bScore - aScore;
  });

  const featuredCount = sortedShops.filter((shop: MarketplaceShop) => shop.isFeatured).length;
  const avgRating =
    sortedShops.length > 0
      ? (sortedShops.reduce((sum: number, shop: MarketplaceShop) => sum + shop.rating, 0) / sortedShops.length).toFixed(1)
      : '0.0';
  const fastestETA =
    sortedShops.length > 0
      ? Math.min(...sortedShops.map((shop: MarketplaceShop) => Number.parseInt(shop.deliveryTime.split('-')[0], 10)))
      : 0;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f0e7]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-amber-600" />
      </div>
    );
  }

  return (
    <div
      className={`${manrope.className} min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(13,116,102,0.20),transparent_35%),radial-gradient(circle_at_20%_15%,_rgba(245,158,11,0.20),transparent_40%),linear-gradient(180deg,#fffef9_0%,#f4efe4_100%)] text-slate-900`}
    >
      <header className="sticky top-0 z-50 border-b border-white/40 bg-white/55 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 font-extrabold text-white">
              D
            </div>
            <span className={`${bebas.className} text-3xl tracking-wide`}>DjiguiFlow</span>
          </Link>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-amber-600/25 transition hover:translate-y-[-1px]"
          >
            Espace Commercant
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden px-4 pb-8 pt-12 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute -left-24 top-10 h-60 w-60 rounded-full bg-amber-300/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 top-24 h-64 w-64 rounded-full bg-emerald-300/25 blur-3xl" />

        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="mb-8 rounded-[2rem] border border-white/65 bg-white/70 p-8 shadow-[0_26px_80px_rgba(62,42,15,0.14)] backdrop-blur-xl lg:p-10"
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">
              <Sparkles className="h-3.5 w-3.5" />
              Marketplace Local Premium
            </div>

            <h1 className={`${bebas.className} text-5xl leading-[0.95] tracking-wide sm:text-7xl`}>
              Explorer les boutiques
              <span className="block bg-gradient-to-r from-amber-700 via-amber-500 to-emerald-600 bg-clip-text text-transparent">
                devient une experience
              </span>
              inoubliable
            </h1>

            <p className="mt-5 max-w-3xl text-base text-slate-600 sm:text-lg">
              Parcourez les adresses les plus aimees du quartier, comparez les delais, trouvez des perles locales et commandez avec assurance.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <MetricCard value={`${sortedShops.length}`} label="Boutiques actives" icon={ShoppingBag} />
              <MetricCard value={avgRating} label="Note moyenne" icon={Star} />
              <MetricCard value={`${fastestETA} min`} label="Livraison la plus rapide" icon={Clock} />
            </div>

            <div className="mt-7 flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher une boutique, une zone ou une ambiance..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-12 py-4 text-slate-800 shadow-md shadow-slate-900/5 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                />
              </div>

              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <Filter className="h-4 w-4" />
                Filtres avances
              </button>
            </div>
          </motion.div>

          <div className="mb-2 flex flex-wrap items-center gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  selectedCategory === cat ? 'bg-slate-900 text-white shadow-md' : 'bg-white/85 text-slate-600 hover:bg-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/70 px-4 py-3 backdrop-blur-xl">
            <p className="text-sm text-slate-600">
              <span className="font-extrabold text-slate-900">{sortedShops.length}</span> boutique
              {sortedShops.length > 1 ? 's' : ''} trouvee{sortedShops.length > 1 ? 's' : ''} dont{' '}
              <span className="font-extrabold text-emerald-700">{featuredCount}</span> recommandee
              {featuredCount > 1 ? 's' : ''}
            </p>

            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-slate-500">Trier :</span>
              <div className="flex gap-1 rounded-full bg-slate-100 p-1">
                {sortOptions.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => setSortBy(option.key)}
                    className={`rounded-full px-3 py-1.5 font-semibold transition ${
                      sortBy === option.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        {fetchError && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {fetchError}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {sortedShops.map((shop, index) => (
            (() => {
              const isSponsored = sponsoredShopIds.has(shop.id);
              return (
            <motion.div
              key={shop.id}
              initial={{ opacity: 0, y: 46, scale: 0.94 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.62, delay: index * 0.08, type: 'spring', stiffness: 105, damping: 17 }}
              whileHover={{ y: -6 }}
              className={`group relative overflow-hidden rounded-[1.75rem] border border-white/80 bg-white transition duration-300 ${
                isSponsored
                  ? 'ring-1 ring-amber-300/80 shadow-[0_30px_72px_rgba(217,119,6,0.24)]'
                  : 'shadow-[0_24px_55px_rgba(28,20,8,0.16)]'
              }`}
            >
              {isSponsored && (
                <>
                  <motion.div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-[1]"
                    initial={{ opacity: 0.55 }}
                    animate={{ opacity: [0.45, 0.8, 0.45] }}
                    transition={{ duration: 8, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
                  >
                    <div className="absolute -left-10 top-8 h-28 w-28 rounded-full bg-amber-300/20 blur-3xl" />
                    <div className="absolute -right-12 bottom-10 h-32 w-32 rounded-full bg-rose-300/20 blur-3xl" />
                    <div className="absolute inset-x-8 bottom-0 h-1 rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400 opacity-80" />
                  </motion.div>

                  <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 translate-y-3 rounded-full border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-800 shadow-sm">
                    Boutique Sponsorisee
                  </div>
                </>
              )}

              <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.14),transparent_42%)]" />

              <div className={`relative z-[2] flex h-44 items-end overflow-hidden bg-gradient-to-br ${shop.color} p-6`}>
                <div className="absolute inset-0 bg-[linear-gradient(122deg,rgba(255,255,255,0.26),transparent_38%,rgba(0,0,0,0.22))]" />
                <div className="absolute -bottom-8 -right-8 h-28 w-28 rounded-full bg-white/20 blur-2xl" />

                <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/25 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
                  <Clock className="h-3.5 w-3.5" />
                  {shop.deliveryTime}
                </div>

                {shop.isFeatured && (
                  <div className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full border border-white/35 bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white backdrop-blur-sm">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {isSponsored ? 'Selection Signature' : 'Coup de coeur'}
                  </div>
                )}

                <div className="relative -mb-9 h-[4.5rem] w-[4.5rem] overflow-hidden rounded-[1.1rem] border-2 border-white bg-white shadow-[0_14px_24px_rgba(0,0,0,0.22)]">
                  {shop.logoUrl && !failedLogoIds.has(shop.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- logo URL Supabase storage, domain may vary by environment
                    <img
                      src={shop.logoUrl}
                      alt={`Logo de ${shop.name}`}
                      className="h-full w-full object-cover"
                      onError={() => {
                        setFailedLogoIds((prev) => {
                          const next = new Set(prev);
                          next.add(shop.id);
                          return next;
                        });
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#fff7ed_0%,#fef3c7_100%)] text-xl font-black text-slate-900">
                      {shop.initials}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-6 pb-6 pt-11">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-black tracking-tight text-slate-900 transition group-hover:text-amber-700">
                      {shop.name}
                    </h3>
                    <p className="mt-0.5 text-sm font-semibold text-slate-500">{shop.category}</p>
                  </div>

                  <div className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-sm font-extrabold text-emerald-700 shadow-sm shadow-emerald-100/60">
                    <Star className="h-3.5 w-3.5 fill-emerald-600 text-emerald-600" />
                    {shop.rating}
                  </div>
                </div>

                <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-slate-600">{shop.vibe}</p>

                <div className="mb-5 flex items-center gap-2 text-sm font-medium text-slate-500">
                  <MapPin className="h-4 w-4" />
                  <span>{shop.zone}</span>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-600">
                    <ShoppingBag className="h-4 w-4 text-amber-600" />
                    <span>{shop.productsCount} produits</span>
                  </div>

                  <Link
                    href={`/boutiques/${shop.id}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-slate-900/25 transition hover:-translate-y-0.5 hover:bg-slate-800"
                  >
                    Voir la boutique
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>

                {isSponsored && (
                  <div className="mt-4 h-1 w-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400" />
                )}
              </div>
            </motion.div>
              );
            })()
          ))}
        </div>

        {sortedShops.length === 0 && (
          <div className="mt-10 rounded-3xl border border-dashed border-slate-300 bg-white/70 py-16 text-center">
            <ShoppingBag className="mx-auto mb-4 h-12 w-12 text-slate-300" />
            <p className="text-lg font-semibold text-slate-600">Aucune boutique ne correspond a votre recherche.</p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedCategory('Tous');
              }}
              className="mt-4 font-bold text-amber-700 hover:underline"
            >
              Reinitialiser les filtres
            </button>
          </div>
        )}
      </section>

      <section className="mx-auto mb-14 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border border-white/70 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-900 p-7 text-white shadow-[0_30px_80px_rgba(16,24,40,0.35)] lg:flex lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">Nouveau sur la plateforme</p>
            <h3 className={`${bebas.className} mt-2 text-4xl leading-none tracking-wide sm:text-5xl`}>
              Faites rayonner votre boutique
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">
              Rejoignez les commercants qui attirent chaque jour de nouveaux clients grace a une vitrine moderne et des livraisons fluides.
            </p>
          </div>

          <Link
            href="/register"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-extrabold text-slate-900 transition hover:bg-emerald-50 lg:mt-0"
          >
            Creer ma boutique
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/40 bg-white/45 py-8 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-slate-500">
          <p>© 2026 DjiguiFlow. Le commerce local, sublime et vivant.</p>
        </div>
      </footer>
    </div>
  );
}

type MetricCardProps = {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

function MetricCard({ value, label, icon: Icon }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <p className="text-2xl font-black text-slate-900">{value}</p>
        <Icon className="h-5 w-5 text-amber-600" />
      </div>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
    </div>
  );
}
