import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, Image as ImageIcon, MapPin, ShoppingBag, Star } from 'lucide-react';
import { Bebas_Neue, Manrope } from 'next/font/google';
import { supabase } from '@/lib/supabase';

const bebas = Bebas_Neue({ subsets: ['latin'], weight: '400' });
const manrope = Manrope({ subsets: ['latin'], weight: ['400', '600', '700', '800'] });

type BoutiquePageProps = {
  params: Promise<{
    id: string;
  }>;
};

type BoutiqueRow = {
  id: string;
  nom: string | null;
  description: string | null;
  zone: string | null;
  categorie: string | null;
  telephone: string | null;
  is_public?: boolean | null;
};

type ProduitRow = {
  id: string;
  nom: string;
  description: string | null;
  prix: number;
  disponible: boolean | null;
  categorie: string | null;
  photo_url: string | null;
};

const gradients = [
  'from-orange-400 to-red-500',
  'from-green-400 to-emerald-600',
  'from-blue-400 to-indigo-600',
  'from-teal-400 to-cyan-600',
  'from-purple-400 to-pink-600',
  'from-amber-500 to-orange-700',
];

function buildDeliveryTime(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const normalized = Math.abs(hash);
  const start = 15 + (normalized % 6) * 5;
  const end = start + 10 + ((normalized >> 3) % 3) * 5;
  return `${start}-${end} min`;
}

function buildRating(productsCount: number): number {
  const rating = 4.2 + Math.min(productsCount, 20) / 25;
  return Number(rating.toFixed(1));
}

export default async function BoutiqueDetailPage({ params }: BoutiquePageProps) {
  const { id } = await params;

  const { data: boutiqueData, error: boutiqueError } = await supabase
    .from('boutiques')
    .select('id, nom, description, zone, categorie, telephone')
    .eq('id', id)
    .single();

  if (boutiqueError || !boutiqueData) {
    notFound();
  }

  const boutique = boutiqueData as BoutiqueRow;

  const { data: productsData, error: productsError } = await supabase
    .from('produits')
    .select('id, nom, description, prix, disponible, categorie, photo_url')
    .eq('boutique_id', boutique.id);

  if (productsError) {
    throw new Error('Impossible de charger les produits de la boutique.');
  }

  const products = (productsData as ProduitRow[] | null) ?? [];
  const visibleProducts = products.filter((product) => product.disponible !== false);
  const rating = buildRating(visibleProducts.length);
  const color = gradients[Math.abs(boutique.id.charCodeAt(0)) % gradients.length];
  const deliveryTime = buildDeliveryTime(boutique.id);

  return (
    <div
      className={`${manrope.className} min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(13,116,102,0.18),transparent_32%),radial-gradient(circle_at_12%_5%,_rgba(245,158,11,0.18),transparent_38%),linear-gradient(180deg,#fffef9_0%,#f4efe4_100%)] text-slate-900`}
    >
      <header className="sticky top-0 z-40 border-b border-white/40 bg-white/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/boutiques" className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-amber-700">
            <ArrowLeft className="h-4 w-4" />
            Retour aux boutiques
          </Link>
          <Link
            href="/login"
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            Espace Commercant
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-14 pt-10 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/80 shadow-[0_22px_70px_rgba(62,42,15,0.14)] backdrop-blur-xl">
          <div className={`bg-gradient-to-br ${color} p-8 text-white sm:p-10`}>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em]">
              <Star className="h-3.5 w-3.5" />
              Boutique verifiee
            </p>
            <h1 className={`${bebas.className} text-5xl leading-none tracking-wide sm:text-6xl`}>
              {boutique.nom || 'Boutique'}
            </h1>
            <p className="mt-3 max-w-3xl text-white/90">
              {boutique.description?.trim() || 'Decouvrez les produits proposes par cette boutique.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold text-white/95">
              <span className="inline-flex items-center gap-1 rounded-full bg-black/20 px-3 py-1">
                <MapPin className="h-4 w-4" />
                {boutique.zone || 'Zone non renseignee'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-black/20 px-3 py-1">
                <Clock className="h-4 w-4" />
                {deliveryTime}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-black/20 px-3 py-1">
                <ShoppingBag className="h-4 w-4" />
                {visibleProducts.length} produits visibles
              </span>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Catalogue produits</h2>
                <p className="text-sm text-slate-500">
                  Categorie: {boutique.categorie || 'Autre'}
                  {boutique.telephone ? ` • Contact: ${boutique.telephone}` : ''}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                <Star className="h-4 w-4 fill-emerald-600 text-emerald-600" />
                {rating}
              </span>
            </div>

            {visibleProducts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                Aucun produit disponible pour cette boutique.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {visibleProducts.map((product) => (
                  <article
                    key={product.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_28px_rgba(49,35,20,0.08)]"
                  >
                    <div className="aspect-[4/3] w-full border-b border-slate-100 bg-slate-50 sm:aspect-[16/10]">
                      {product.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- image URL comes from Supabase storage public URL
                        <img
                          src={product.photo_url}
                          alt={`Image du produit ${product.nom}`}
                          className="h-full w-full object-cover object-center"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm">
                            <ImageIcon className="h-4 w-4" />
                            Image indisponible
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-5">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-extrabold text-slate-900">{product.nom}</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {product.description || 'Description indisponible.'}
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                        {product.categorie || 'Produit'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                      <p className="text-lg font-black text-slate-900">
                        {Number(product.prix || 0).toLocaleString()} FCFA
                      </p>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          product.disponible !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {product.disponible !== false ? 'Disponible' : 'Rupture'}
                      </span>
                    </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
