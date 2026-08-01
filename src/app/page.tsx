'use client';

import { motion } from 'framer-motion';
import { 
  MessageSquare, 
  TrendingUp, 
  Clock, 
  Shield, 
  Zap, 
  Users,
  CheckCircle,
  ArrowRight,
  Star,
  ChevronDown
} from 'lucide-react';

// Fonction pour le smooth scroll
const scrollToSection = (sectionId: string) => {
  const element = document.getElementById(sectionId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' });
  }
};

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <span className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
                DjiguiFlow
              </span>
            </div>
            <div className="hidden md:flex space-x-8">
              <button onClick={() => scrollToSection('features')} className="text-gray-700 hover:text-primary-600 transition">Fonctionnalités</button>
              <button onClick={() => scrollToSection('pricing')} className="text-gray-700 hover:text-primary-600 transition">Tarifs</button>
              <button onClick={() => scrollToSection('faq')} className="text-gray-700 hover:text-primary-600 transition">FAQ</button>
            </div>
            <div className="flex space-x-4">
              <button className="px-4 py-2 text-gray-700 hover:text-primary-600 transition">
                Connexion
              </button>
              <button onClick={() => scrollToSection('pricing')} className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition shadow-lg hover:shadow-xl">
                Essayer gratuitement
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                Automatisez votre{' '}
                <span className="bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
                  commerce en ligne
                </span>
              </h1>
              <p className="mt-6 text-xl text-gray-600 leading-relaxed">
                Le système qui prend les commandes, gère les livreurs et satisfait vos clients pendant que vous dormez.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <button onClick={() => scrollToSection('pricing')} className="px-8 py-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition shadow-lg hover:shadow-xl flex items-center justify-center gap-2">
                  Commencer maintenant
                <ArrowRight className="w-5 h-5" />
                </button>
                <button className="px-8 py-4 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition border-2 border-gray-200">
                  Voir la démo
                </button>
              </div>
              <div className="mt-8 flex items-center gap-2 text-sm text-gray-500">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span>30 jours d'essai gratuit</span>
                <CheckCircle className="w-5 h-5 text-green-500 ml-4" />
                <span>Sans carte bancaire</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="bg-white rounded-2xl shadow-2xl p-6 border border-gray-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">DjiguiFlow Bot</h3>
                    <p className="text-sm text-gray-500">En ligne</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="bg-gray-100 rounded-lg p-3 max-w-[80%]">
                    <p className="text-sm text-gray-700">Bonjour !  Votre boutique est prête à automatiser.</p>
                  </div>
                  <div className="bg-primary-100 rounded-lg p-3 max-w-[80%] ml-auto">
                    <p className="text-sm text-primary-900">Je veux commander 2 pizzas margherita</p>
                  </div>
                  <div className="bg-gray-100 rounded-lg p-3 max-w-[80%]">
                    <p className="text-sm text-gray-700">✅ Commande #DJ-7823 reçue → envoyée à Livreur Aminata</p>
                  </div>
                  <div className="bg-green-100 rounded-lg p-3 max-w-[80%]">
                    <p className="text-sm text-green-900">✅ Livraison confirmée. Note client : 5/5 ⭐</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { value: '+30%', label: 'de commandes en plus', icon: TrendingUp },
              { value: '-80%', label: 'de retards de livraison', icon: Clock },
              { value: '2h', label: 'gagnées par jour', icon: Zap },
            ].map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
                  <stat.icon className="w-8 h-8 text-primary-600" />
                </div>
                <div className="text-4xl font-bold text-gray-900">{stat.value}</div>
                <div className="text-gray-600 mt-2">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      {/* Comment ça marche Section */}
      <section className="py-20 bg-gradient-to-br from-slate-50 to-blue-50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900">
              Comment ça{' '}
              <span className="bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
                marche
              </span>
            </h2>
            <p className="mt-4 text-xl text-gray-600">
              3 étapes simples pour automatiser votre commerce
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                icon: MessageSquare,
                title: 'Le client commande',
                description: 'Votre client envoie un message sur Telegram ou WhatsApp. Notre IA comprend sa demande et prend la commande automatiquement.',
              },
              {
                step: '02',
                icon: Users,
                title: 'Le livreur est assigné',
                description: 'La commande est envoyée au livreur disponible le plus proche. Vous et le client suivez la livraison en temps réel.',
              },
              {
                step: '03',
                icon: TrendingUp,
                title: 'Vous encaissez et analysez',
                description: 'Le paiement est confirmé, la note client enregistrée. Vous consultez vos performances sur votre dashboard.',
              },
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition border border-gray-100"
              >
                <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-to-br from-primary-600 to-accent-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  {item.step}
                </div>
                <div className="w-16 h-16 bg-primary-100 rounded-xl flex items-center justify-center mb-6 mt-4">
                  <item.icon className="w-8 h-8 text-primary-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600 leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900">
              Tout ce qu'il faut pour{' '}
              <span className="bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
                réussir
              </span>
            </h2>
            <p className="mt-4 text-xl text-gray-600">
              Une solution complète pour automatiser votre commerce
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: MessageSquare,
                title: 'Bot Intelligent 24/7',
                description: 'Votre assistant IA prend les commandes automatiquement, même à 3h du matin.',
              },
              {
                icon: Users,
                title: 'Gestion des Livreurs',
                description: 'Assignation automatique, suivi en temps réel, et notation des performances.',
              },
              {
                icon: TrendingUp,
                title: 'Dashboard Analytics',
                description: 'Suivez vos ventes, vos clients et vos performances en temps réel.',
              },
              {
                icon: Clock,
                title: 'Alertes Intelligentes',
                description: 'Notifications instantanées pour les retards, stocks faibles et avis clients.',
              },
              {
                icon: Shield,
                title: 'Paiement Sécurisé',
                description: 'Intégration Mobile Money (Wave, Orange Money) et cartes bancaires.',
              },
              {
                icon: Zap,
                title: 'Installation Rapide',
                description: 'Opérationnel en 24h. Formation incluse et support technique 7j/7.',
              },
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition border border-gray-100"
              >
                <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      {/* Témoignages Section */}
      <section className="py-20 bg-gradient-to-br from-primary-50 to-accent-50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900">
              Ils nous font{' '}
              <span className="bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
                confiance
              </span>
            </h2>
            <p className="mt-4 text-xl text-gray-600">
              Découvrez ce que nos clients disent de DjiguiFlow
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                name: 'Moussa Koné',
                role: 'Gérant, Restaurant Le Palmier',
                avatar: '👨‍🍳',
                text: 'Depuis qu\'on utilise DjiguiFlow, on a réduit nos retards de livraison de 80%. Le gérant peut enfin se concentrer sur la cuisine au lieu de gérer les appels.',
                rating: 5,
              },
              {
                name: 'Aminata Diallo',
                role: 'Propriétaire, Boutique Mode Express',
                avatar: '‍💼',
                text: 'L\'IA prend les commandes même à 23h ! On a augmenté notre chiffre d\'affaires de 30% le premier mois. C\'est comme avoir un employé qui ne dort jamais.',
                rating: 5,
              },
              {
                name: 'Emma Yaba',
                role: 'Propriétaire, Yaba resto',
                avatar:  '👨‍🍳',
                text: 'Le dashboard nous permet de suivre les performances en temps réel. On sait exactement quels produits se vendent le mieux. Un outil indispensable.',
                rating: 5,
              },
            ].map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition border border-gray-100"
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-accent-500 text-accent-500" />
                  ))}
                </div>
                <p className="text-gray-700 mb-6 leading-relaxed italic">
                  "{testimonial.text}"
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary-100 to-accent-100 rounded-full flex items-center justify-center text-2xl">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{testimonial.name}</h4>
                    <p className="text-sm text-gray-500">{testimonial.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-white px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900">Tarifs simples et transparents</h2>
            <p className="mt-4 text-xl text-gray-600">
              Choisissez le plan qui correspond à votre business
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                name: 'Starter',
                price: '25 000',
                description: 'Pour les petits commerçants',
                features: ['1 bot Telegram', 'Google Sheets', '3 workflows', 'Support email'],
                popular: false,
              },
              {
                name: 'Pro',
                price: '50 000',
                description: 'Pour les restaurants et boutiques',
                features: ['4 bots Telegram', 'Dashboard complet', '7 workflows', 'Support prioritaire', 'Analytics avancés'],
                popular: true,
              },
              {
                name: 'Premium',
                price: '100 000',
                description: 'Pour les grosses structures',
                features: ['Tout illimité', 'WhatsApp Business', 'Support 24/7', 'Formation sur site', 'Personnalisation complète'],
                popular: false,
              },
            ].map((plan, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`rounded-2xl p-8 ${
                  plan.popular
                    ? 'bg-gradient-to-br from-primary-600 to-primary-800 text-white shadow-2xl scale-105'
                    : 'bg-white border-2 border-gray-200'
                }`}
              >
                {plan.popular && (
                  <div className="inline-block px-3 py-1 bg-accent-500 text-white text-sm font-semibold rounded-full mb-4">
                    Plus populaire
                  </div>
                )}
                <h3 className={`text-2xl font-bold ${plan.popular ? 'text-white' : 'text-gray-900'}`}>
                  {plan.name}
                </h3>
                <p className={`mt-2 ${plan.popular ? 'text-primary-100' : 'text-gray-600'}`}>
                  {plan.description}
                </p>
                <div className="mt-6">
                  <span className={`text-4xl font-bold ${plan.popular ? 'text-white' : 'text-gray-900'}`}>
                    {plan.price}
                  </span>
                  <span className={`text-lg ${plan.popular ? 'text-primary-100' : 'text-gray-600'}`}>
                    {' '}FCFA/mois
                  </span>
                </div>
                <ul className="mt-8 space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle className={`w-5 h-5 ${plan.popular ? 'text-accent-300' : 'text-green-500'}`} />
                      <span className={plan.popular ? 'text-primary-50' : 'text-gray-700'}>{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className={`mt-8 w-full py-3 rounded-lg font-semibold transition ${
                    plan.popular
                      ? 'bg-white text-primary-600 hover:bg-gray-100'
                      : 'bg-primary-600 text-white hover:bg-primary-700'
                  }`}
                >
                  Commencer
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      {/* FAQ Section */}
      <section id="faq" className="py-20 bg-white px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900">
              Questions{' '}
              <span className="bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
                fréquentes
              </span>
            </h2>
            <p className="mt-4 text-xl text-gray-600">
              Tout ce que vous devez savoir sur DjiguiFlow
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                question: 'Combien de temps prend l\'installation ?',
                answer: 'L\'installation complète prend entre 24h et 48h. Nous configurons tout pour vous : les bots Telegram, le dashboard, et la formation de votre équipe est incluse.',
              },
              {
                question: 'Mes clients doivent-ils télécharger une application ?',
                answer: 'Non ! Vos clients utilisent simplement Telegram ou WhatsApp, qu\'ils ont déjà sur leur téléphone. Aucune application supplémentaire à installer.',
              },
              {
                question: 'Puis-je utiliser DjiguiFlow pour mon type de commerce ?',
                answer: 'Oui ! DjiguiFlow s\'adapte à tous les commerces : restaurants, boutiques, pharmacies, services à domicile. Notre IA s\'adapte à votre catalogue et votre métier.',
              },
              {
                question: 'Que se passe-t-il si je ne suis pas satisfait ?',
                answer: 'Nous offrons une garantie satisfait ou remboursé de 30 jours. Si le système ne vous convient pas, nous vous remboursons intégralement, sans question.',
              },
              {
                question: 'Le système fonctionne-t-il 24h/24 ?',
                answer: 'Oui ! Notre IA prend les commandes automatiquement, même la nuit et les jours fériés. Vous recevez les commandes le lendemain matin.',
              },
              {
                question: 'Comment sont gérés les paiements ?',
                answer: 'Nous intégrons les solutions Mobile Money (Wave, Orange Money, MTN) et les cartes bancaires. L\'argent arrive directement sur votre compte.',
              },
            ].map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className="bg-gray-50 rounded-xl p-6 hover:bg-gray-100 transition border border-gray-200"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {faq.question}
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  {faq.answer}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-gray-900">
            Prêt à automatiser votre commerce ?
          </h2>
          <p className="mt-4 text-xl text-gray-600">
            Rejoignez les commerçants qui ont déjà transformé leur business
          </p>
          <button className="mt-8 px-8 py-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition shadow-lg hover:shadow-xl text-lg">
            Démarrer l'essai gratuit
          </button>
          <p className="mt-4 text-sm text-gray-500">
            30 jours gratuits • Sans engagement • Support inclus
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
                DjiguiFlow
              </h3>
              <p className="mt-4 text-gray-400">
                L'automatisation intelligente pour les commerçants africains.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Produit</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition">Fonctionnalités</a></li>
                <li><a href="#" className="hover:text-white transition">Tarifs</a></li>
                <li><a href="#" className="hover:text-white transition">Démo</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Entreprise</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition">À propos</a></li>
                <li><a href="#" className="hover:text-white transition">Blog</a></li>
                <li><a href="#" className="hover:text-white transition">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Légal</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition">CGU</a></li>
                <li><a href="#" className="hover:text-white transition">Confidentialité</a></li>
                <li><a href="#" className="hover:text-white transition">Mentions légales</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-gray-800 text-center text-gray-400">
            <p>© 2026 DjiguiFlow. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}