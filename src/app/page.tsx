'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle,
  Clock3,
  Globe2,
  Handshake,
  Leaf,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

const scrollToSection = (sectionId: string) => {
  const element = document.getElementById(sectionId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' });
  }
};

const stats = [
  { value: '+30%', label: 'de commandes en plus', icon: TrendingUp },
  { value: '-80%', label: 'de retards de livraison', icon: Clock3 },
  { value: '2h', label: 'gagnées par jour', icon: Zap },
];

const values = [
  {
    icon: Handshake,
    title: 'Solidarité',
    text: 'Un commerce qui soutient les communautés, les familles et les réseaux de proximité.',
  },
  {
    icon: Sparkles,
    title: 'Créativité',
    text: 'Des solutions adaptées au terrain, à l’énergie des marchés et à la modernité locale.',
  },
  {
    icon: ShieldCheck,
    title: 'Confiance',
    text: 'Des transactions sécurisées, des livraisons fiables et une relation durable avec les clients.',
  },
  {
    icon: Leaf,
    title: 'Croissance',
    text: 'Un modèle pensé pour faire grandir les boutiques, restaurants et services partout en Afrique.',
  },
];

const steps = [
  {
    step: '01',
    icon: MessageSquare,
    title: 'Le client commande',
    description: 'La commande est reçue par message, WhatsApp ou Telegram, sans friction pour le client.',
  },
  {
    step: '02',
    icon: Users,
    title: 'Le livreur est assigné',
    description: 'Le bon livreur est sélectionné selon la zone, le délai et la disponibilité en temps réel.',
  },
  {
    step: '03',
    icon: TrendingUp,
    title: 'La vente est optimisée',
    description: 'Le dashboard centralise les ventes, les performances, les avis et la satisfaction client.',
  },
];

const features = [
  {
    icon: MessageSquare,
    title: 'Bot intelligent 24/7',
    description: 'Votre assistant répond, confirme et transforme des messages en ventes même tard le soir.',
  },
  {
    icon: Store,
    title: 'Gestion de boutique',
    description: 'Suivi des produits, des stocks, et des demandes clients depuis un seul espace de travail.',
  },
  {
    icon: TrendingUp,
    title: 'Analytics en temps réel',
    description: 'Une vue claire sur les ventes, les zones fortes, les meilleurs produits et les retards.',
  },
  {
    icon: Clock3,
    title: 'Alertes intelligentes',
    description: 'Recevez des notifications pour les commandes prioritaires, les retards et les demandes urgentes.',
  },
  {
    icon: ShieldCheck,
    title: 'Paiement sécurisé',
    description: 'Mobile Money, carte bancaire et suivi des transactions avec une couche de sécurité solide.',
  },
  {
    icon: Globe2,
    title: 'Prêt pour le marché local',
    description: 'Conçu pour les réalités africaines, les habitudes de paiement et la dynamique des quartiers.',
  },
];

const testimonials = [
  {
    name: 'Moussa Koné',
    role: 'Gérant, Restaurant Le Palmier',
    avatar: '🍽️',
    text: 'DjiguiFlow a transformé notre service. Les commandes arrivent plus vite, les livreurs sont mieux organisés et nos clients reviennent plus souvent.',
    rating: 5,
  },
  {
    name: 'Aminata Diallo',
    role: 'Boutique Mode Express',
    avatar: '💼',
    text: 'Le système est simple à utiliser et visuellement très moderne. On a gagné du temps et augmenté nos ventes pendant les heures creuses.',
    rating: 5,
  },
  {
    name: 'Yacouba Diakité',
    role: 'Directeur, Fresh Market',
    avatar: '🥭',
    text: 'Ce qui nous a marqué, c’est la simplicité et la logique locale. L’outil comprend notre marché, nos rythmes et nos besoins.',
    rating: 5,
  },
];

const plans = [
  {
    name: 'Starter',
    price: '25 000',
    description: 'Pour les petits commerces qui veulent se structurer.',
    features: ['1 bot Telegram', 'Suivi de base', '3 workflows', 'Support email'],
    popular: false,
  },
  {
    name: 'Pro',
    price: '50 000',
    description: 'Pour les boutiques et restaurants en croissance.',
    features: ['4 bots', 'Dashboard complet', '7 workflows', 'Support prioritaire', 'Analytics avancés'],
    popular: true,
  },
  {
    name: 'Premium',
    price: '100 000',
    description: 'Pour les structures qui veulent l’excellence.',
    features: ['Tout illimité', 'WhatsApp Business', 'Support 24/7', 'Formation sur site', 'Personnalisation complète'],
    popular: false,
  },
];

const faqs = [
  {
    question: 'Quel est l’avantage principal pour un commerce africain ?',
    answer: 'DjiguiFlow s’adapte aux réalités locales : paiements, délais, messagerie, livraisons et gestion quotidienne, sans complexité inutile.',
  },
  {
    question: 'Mes clients ont-ils besoin d’une application ?',
    answer: 'Non. Ils peuvent commander via WhatsApp ou Telegram, outils qu’ils utilisent déjà au quotidien.',
  },
  {
    question: 'Peut-on personnaliser le système ?',
    answer: 'Oui. Le produit est pensé pour évoluer avec votre catalogue, vos services et votre façon de travailler.',
  },
  {
    question: 'Est-ce que cela fonctionne même la nuit ?',
    answer: 'Oui. Les commandes peuvent être reçues, confirmées et traitées automatiquement 24h/24, même hors heures d’ouverture.',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen text-slate-900">
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-amber-200/70 bg-[#fffaf3]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 text-lg font-black text-white shadow-lg shadow-amber-300/30">
              D
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight text-slate-900">
                DjiguiFlow
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-8 md:flex">
            <button onClick={() => scrollToSection('valeurs')} className="text-sm font-medium text-slate-700 transition hover:text-primary-700">Valeurs</button>
            <button onClick={() => scrollToSection('features')} className="text-sm font-medium text-slate-700 transition hover:text-primary-700">Fonctionnalités</button>
            <button onClick={() => scrollToSection('pricing')} className="text-sm font-medium text-slate-700 transition hover:text-primary-700">Tarifs</button>
            <button onClick={() => scrollToSection('faq')} className="text-sm font-medium text-slate-700 transition hover:text-primary-700">FAQ</button>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden rounded-full border border-slate-200 bg-white/60 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-primary-300 hover:text-primary-700 sm:inline-flex">
              Connexion
            </Link>
            <Link href="/register" className="inline-flex rounded-full bg-gradient-to-r from-primary-600 to-primary-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 transition hover:scale-[1.02]">
              Essayer gratuitement
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden pt-32 pb-20 sm:pt-36">
        <div className="african-pattern absolute inset-0 opacity-70" />
        <div className="absolute inset-x-0 top-24 mx-auto h-72 w-72 rounded-full bg-primary-200/40 blur-3xl" />
        <div className="absolute right-10 top-28 h-64 w-64 rounded-full bg-accent-200/30 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white/75 px-4 py-2 text-sm font-semibold text-primary-700 shadow-sm">
              <Sparkles className="h-4 w-4" />
              Commerce intelligent, pensé pour l’Afrique
            </div>

            <h1 className="max-w-xl text-balance text-5xl font-black tracking-tight text-slate-900 lg:text-6xl">
              Faites grandir votre commerce avec la force de{' '}
              <span className="bg-gradient-to-r from-primary-600 via-primary-500 to-accent-600 bg-clip-text text-transparent">
                DjiguiFlow
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              Une plateforme premium pour gérer les commandes, les livraisons et la relation client, avec une expérience moderne, chaleureuse et profondément inspirée de nos valeurs africaines.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary-600 to-primary-500 px-8 py-4 text-base font-semibold text-white shadow-xl shadow-primary-500/25 transition hover:translate-y-[-1px]">
                Commencer l’essai
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link href="/login" className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/80 px-8 py-4 text-base font-semibold text-slate-700 transition hover:border-primary-300 hover:text-primary-700">
                Voir la démo
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-slate-600">
              <div className="inline-flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-accent-600" />
                <span>30 jours offerts</span>
              </div>
              <div className="inline-flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-accent-600" />
                <span>Sans carte bancaire</span>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.15 }} className="relative">
            <div className="gold-ring relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/70 p-5 shadow-2xl backdrop-blur-xl">
              <div className="rounded-[1.5rem] bg-gradient-to-br from-[#fffaf2] via-white to-[#eefaf4] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 text-white shadow-lg shadow-amber-300/20">
                      <MessageSquare className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-slate-900">DjiguiFlow Bot</p>
                      <p className="text-xs text-slate-500">Système actif</p>
                    </div>
                  </div>
                  <div className="rounded-full bg-accent-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-accent-700">
                    en ligne
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="max-w-[82%] rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">Bonjour ! Votre boutique est prête à recevoir les commandes.</div>
                  <div className="ml-auto max-w-[82%] rounded-2xl bg-primary-100 px-4 py-3 text-sm text-primary-900">Je veux 2 pizzas margherita et 1 jus de bissap.</div>
                  <div className="max-w-[88%] rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">✅ Commande #DJ-7823 reçue. Livreur Aminata assignée en zone Cocody.</div>
                  <div className="max-w-[86%] rounded-2xl bg-accent-100 px-4 py-3 text-sm text-accent-900">✅ Livraison confirmée. Note client : 5/5 ⭐</div>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    { label: 'Ventes', value: '1.2M', color: 'bg-primary-100 text-primary-700' },
                    { label: 'Livraisons', value: '94%', color: 'bg-accent-100 text-accent-700' },
                    { label: 'Clients', value: '8.4K', color: 'bg-amber-100 text-amber-700' },
                  ].map((item) => (
                    <div key={item.label} className={`rounded-2xl px-3 py-3 ${item.color}`}>
                      <div className="text-lg font-black">{item.value}</div>
                      <div className="text-[10px] uppercase tracking-wide opacity-75">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 md:grid-cols-3 sm:px-6 lg:px-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div key={index} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: index * 0.08 }} className="glass-panel rounded-[1.75rem] p-6 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-100 to-primary-200 text-primary-700">
                  <Icon className="h-7 w-7" />
                </div>
                <div className="text-4xl font-black text-slate-900">{stat.value}</div>
                <div className="mt-2 text-slate-600">{stat.label}</div>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section id="valeurs" className="relative py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.22em] text-primary-700">Nos valeurs</p>
            <h2 className="text-4xl font-black tracking-tight text-slate-900">Une vision qui reflète l’Afrique, moderne et humaine</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {values.map((value, index) => {
              const Icon = value.icon;
              return (
                <motion.div key={value.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: index * 0.08 }} className="rounded-[1.75rem] border border-amber-100 bg-white/80 p-6 shadow-lg shadow-amber-100/60">
                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-100 to-accent-100 text-primary-700">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="mb-3 text-2xl font-bold text-slate-900">{value.title}</h3>
                  <p className="leading-7 text-slate-600">{value.text}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="features" className="bg-white/60 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.22em] text-primary-700">Comment ça marche</p>
            <h2 className="text-4xl font-black tracking-tight text-slate-900">Une expérience qui rend chaque commande plus fluide</h2>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div key={item.step} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: index * 0.08 }} className="relative rounded-[2rem] border border-slate-100 bg-gradient-to-br from-white to-[#fffaf2] p-7 shadow-[0_20px_50px_rgba(49,35,20,0.08)]">
                  <div className="absolute -left-4 -top-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary-600 to-primary-500 text-lg font-black text-white shadow-lg shadow-primary-500/30">{item.step}</div>
                  <div className="mb-6 mt-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-100 text-primary-700">
                    <Icon className="h-8 w-8" />
                  </div>
                  <h3 className="mb-3 text-2xl font-bold text-slate-900">{item.title}</h3>
                  <p className="leading-7 text-slate-600">{item.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.22em] text-primary-700">Tout ce qu’il faut</p>
            <h2 className="text-4xl font-black tracking-tight text-slate-900">Des outils conçus pour la performance locale</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div key={feature.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: index * 0.06 }} className="rounded-[1.75rem] border border-slate-100 bg-white/80 p-6 shadow-md shadow-slate-100">
                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-100 to-accent-100 text-primary-700">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-slate-900">{feature.title}</h3>
                  <p className="leading-7 text-slate-600">{feature.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-br from-[#fff8ee] via-[#fffaf4] to-[#edfaf3] py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.22em] text-primary-700">Témoignages</p>
            <h2 className="text-4xl font-black tracking-tight text-slate-900">Les commerçants parlent mieux que n’importe quel pitch</h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {testimonials.map((testimonial, index) => (
              <motion.div key={testimonial.name} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: index * 0.08 }} className="rounded-[1.75rem] border border-amber-100 bg-white/80 p-6 shadow-lg shadow-amber-100/50">
                <div className="mb-4 flex gap-1 text-primary-500">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-current" />
                  ))}
                </div>
                <p className="mb-6 leading-8 text-slate-700">“{testimonial.text}”</p>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary-100 to-accent-100 text-2xl">{testimonial.avatar}</div>
                  <div>
                    <h4 className="font-bold text-slate-900">{testimonial.name}</h4>
                    <p className="text-sm text-slate-500">{testimonial.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.22em] text-primary-700">Tarifs</p>
            <h2 className="text-4xl font-black tracking-tight text-slate-900">Une offre claire pour chaque étape de croissance</h2>
          </div>

          <div className="grid gap-8 lg:grid-cols-3">
            {plans.map((plan, index) => (
              <motion.div key={plan.name} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: index * 0.08 }} className={`rounded-[2rem] border p-7 ${plan.popular ? 'border-primary-500 bg-gradient-to-br from-primary-600 to-primary-800 text-white shadow-2xl shadow-primary-500/20' : 'border-slate-200 bg-white shadow-lg shadow-slate-100'}`}>
                {plan.popular && (
                  <div className="mb-5 inline-flex rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-white/90">Plus populaire</div>
                )}

                <h3 className="text-2xl font-black">{plan.name}</h3>
                <p className={`${plan.popular ? 'mt-2 text-primary-100' : 'mt-2 text-slate-600'}`}>{plan.description}</p>

                <div className="mt-6 flex items-end gap-2">
                  <span className="text-4xl font-black">{plan.price}</span>
                  <span className={`${plan.popular ? 'text-primary-100' : 'text-slate-500'} pb-1`}>FCFA/mois</span>
                </div>

                <ul className="mt-8 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <CheckCircle className={`h-5 w-5 ${plan.popular ? 'text-amber-200' : 'text-accent-600'}`} />
                      <span className={plan.popular ? 'text-white/90' : 'text-slate-700'}>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button className={`mt-8 w-full rounded-full px-5 py-3 font-semibold transition ${plan.popular ? 'bg-white text-primary-700 hover:bg-primary-50' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
                  Commencer
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="bg-white/80 py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.22em] text-primary-700">FAQ</p>
            <h2 className="text-4xl font-black tracking-tight text-slate-900">Questions fréquentes</h2>
          </div>

          <div className="space-y-4">
            {faqs.map((item, index) => (
              <motion.div key={item.question} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: index * 0.04 }} className="rounded-[1.5rem] border border-slate-200 bg-[#fffdf9] p-6 shadow-sm">
                <h3 className="mb-2 text-lg font-bold text-slate-900">{item.question}</h3>
                <p className="leading-7 text-slate-600">{item.answer}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-5xl rounded-[2.5rem] border border-primary-100 bg-gradient-to-r from-primary-600 via-primary-500 to-accent-600 px-6 py-14 text-center text-white shadow-2xl shadow-primary-500/20 sm:px-10">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.22em] text-amber-100">Prêt à passer à l’étape supérieure ?</p>
          <h2 className="text-4xl font-black tracking-tight">Automatisez votre commerce sans perdre votre âme.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/85">Des outils puissants, un design premium et une expérience conçue pour les réalités de l’Afrique moderne.</p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Link href="/register" className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3.5 text-base font-bold text-primary-700 transition hover:bg-primary-50">Démarrer gratuitement</Link>
            <Link href="/login" className="inline-flex items-center justify-center rounded-full border border-white/40 bg-white/10 px-7 py-3.5 text-base font-bold text-white transition hover:bg-white/15">Connexion</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-950 py-12 text-slate-300">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="text-2xl font-black text-white">DjiguiFlow</div>
            <p className="mt-3 max-w-md text-sm text-slate-400">L’automatisation intelligente pour les commerçants africains.</p>
          </div>

          <div className="flex flex-wrap gap-6 text-sm text-slate-400">
            <button onClick={() => scrollToSection('features')} className="transition hover:text-white">Fonctionnalités</button>
            <button onClick={() => scrollToSection('pricing')} className="transition hover:text-white">Tarifs</button>
            <button onClick={() => scrollToSection('faq')} className="transition hover:text-white">FAQ</button>
          </div>
        </div>
      </footer>
    </main>
  );
}