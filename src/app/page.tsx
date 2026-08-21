'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import AssistantChat from '@/components/AssistantChat';
import BoutiquesEnLigne from '@/components/BoutiquesEnLigne';
import { BILLING_PLANS } from '@/lib/billing/plans';

const NUIT = '#131c3d';
const CHAUX = '#eeece5';

const openAssistant = () => {
  window.dispatchEvent(new Event('djiguiflow:assistant-open'));
};

// Des faits sur le mécanisme, pas des moyennes mesurées : la plateforme
// ouvre, elle n'a pas encore l'historique qui permettrait d'annoncer un
// gain constaté. Une preuve inventée coûte plus cher qu'une preuve modeste.
const stats = [
  { value: '24 h/24', label: 'l’assistant répond, même boutique fermée' },
  { value: '0', label: 'carnet à recompter le soir' },
  { value: '1', label: 'endroit pour les commandes, le stock et les livreurs' },
];

const releves = [
  {
    cle: '23 h',
    titre: 'Répondre après la fermeture',
    texte:
      "L'assistant lit le message, confirme la commande et l'enregistre. Vous relisez le matin, au calme.",
  },
  {
    cle: 'zones',
    titre: 'Chercher qui peut livrer',
    texte:
      "Le livreur disponible dans la bonne zone reçoit la course, avec l'adresse et le montant à encaisser.",
  },
  {
    cle: 'stock',
    titre: 'Compter au stylo',
    texte: 'Chaque vente décrémente le stock. Vous voyez ce qui part et ce qui dort.',
  },
  {
    cle: 'retards',
    titre: 'Relancer les livreurs',
    texte: "Passé le délai promis, l'alerte part toute seule : au livreur d'abord, à vous ensuite.",
  },
  {
    cle: 'caisse',
    titre: 'Courir après les paiements',
    texte:
      'Mobile Money et carte bancaire, avec la trace de chaque transaction en face de chaque commande.',
  },
  {
    cle: 'avis',
    titre: 'Deviner si le client est content',
    texte:
      'La note arrive à la livraison. Trois mauvaises notes sur la même zone, vous le savez le soir même.',
  },
];

const releve = [
  { poste: 'commandes reçues', valeur: '47' },
  { poste: 'livrées à l’heure', valeur: '44' },
  { poste: 'en retard', valeur: '3' },
];

const encaisse = [
  { poste: 'mobile money', valeur: '248 000' },
  { poste: 'espèces livreur', valeur: '64 500' },
];

const questions = [
  {
    q: 'Mes clients doivent-ils installer une application ?',
    r: 'Non. Ils commandent depuis WhatsApp ou Telegram, comme ils vous écrivent déjà. Rien ne change de leur côté.',
  },
  {
    q: 'Que se passe-t-il si je veux confirmer moi-même une commande ?',
    r: 'Vous gardez la main. L’assistant peut simplement enregistrer et vous notifier, sans jamais confirmer à votre place : c’est un réglage, pas un choix définitif.',
  },
  {
    q: 'Et si le réseau coupe ?',
    r: 'Les commandes reçues restent enregistrées et repartent dès le retour du réseau. Rien ne se perd entre deux coupures.',
  },
  {
    q: 'Comment sont encaissés les paiements ?',
    r: 'Mobile Money, carte bancaire ou espèces à la livraison. Chaque encaissement est rattaché à sa commande, avec le mode de paiement et l’heure.',
  },
  {
    q: 'Puis-je adapter le système à mon commerce ?',
    r: 'Oui. Catalogue, zones de livraison, délais, messages de l’assistant et rôles de l’équipe se règlent depuis votre espace.',
  },
];

function Chip({ tone, children }: { tone: 'mangue' | 'nuit' | 'feuille'; children: ReactNode }) {
  const tones = {
    mangue: 'bg-mangue-100 text-mangue-700',
    nuit: 'bg-nuit-100 text-nuit-700',
    feuille: 'bg-accent-100 text-accent-700',
  } as const;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-xs font-medium uppercase tracking-[0.16em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`font-mono text-xs uppercase tracking-[0.22em] ${className}`}>{children}</p>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-chaux-100">
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-nuit-900/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
              <rect x="0.75" y="4.75" width="24.5" height="16.5" rx="2.5" fill="#c4123f" />
              <line
                x1="17.5"
                y1="6.5"
                x2="17.5"
                y2="19.5"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="1"
                strokeDasharray="2 2.5"
              />
            </svg>
            <span className="font-display text-xl tracking-tight text-white">
              <span className="font-extrabold">Djigui</span>
              <span className="font-light text-nuit-200">Flow</span>
            </span>
          </Link>

          <div className="hidden items-center gap-7 lg:flex">
            <Link href="#metier" className="text-sm text-nuit-100 transition hover:text-white">
              Ce que ça change
            </Link>
            <Link href="#caisse" className="text-sm text-nuit-100 transition hover:text-white">
              La caisse du soir
            </Link>
            <Link href="#tarifs" className="text-sm text-nuit-100 transition hover:text-white">
              Tarifs
            </Link>
            <Link href="#questions" className="text-sm text-nuit-100 transition hover:text-white">
              Questions
            </Link>
            <Link href="/boutiques" className="text-sm text-nuit-100 transition hover:text-white">
              Les boutiques
            </Link>
            <button
              type="button"
              onClick={openAssistant}
              className="text-sm text-nuit-100 transition hover:text-white"
            >
              Assistant
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden px-3 py-2 text-sm text-nuit-100 transition hover:text-white sm:inline-flex"
            >
              Connexion
            </Link>
            <Link
              href="/register"
              className="inline-flex whitespace-nowrap rounded-sm bg-bissap-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-bissap-600"
            >
              Ouvrir ma boutique
            </Link>
          </div>
        </div>
      </nav>

      {/* ---------------------------------------------------------------- héros */}
      <section className="indigo-weave relative overflow-hidden bg-nuit-800 pt-28 pb-16 text-white sm:pt-32 lg:pb-24">
        <div className="relative mx-auto grid max-w-6xl gap-14 px-4 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-12">
          <div>
            <div className="flex items-start gap-2.5">
              <span className="pulse-dot mt-[5px] h-2 w-2 shrink-0 rounded-full bg-accent-400" />
              <Eyebrow className="text-nuit-200">
                mardi 23 h 41 · abidjan · votre boutique est fermée
              </Eyebrow>
            </div>

            <h1 className="mt-6 max-w-[15ch] font-display text-[2.75rem] font-extrabold leading-[0.95] tracking-[-0.03em] sm:text-6xl lg:text-[4.25rem]">
              Un client commande à{' '}
              <span className="font-mono text-mangue-300 tracking-tight">23:41</span>. C’est livré à{' '}
              <span className="font-mono text-accent-300 tracking-tight">23:52</span>.
            </h1>

            <p className="mt-7 max-w-lg text-[1.0625rem] leading-relaxed text-nuit-100">
              DjiguiFlow reçoit la commande sur WhatsApp, assigne le livreur de la zone, encaisse et
              enregistre la note du client. Vous, vous dormiez.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-sm bg-bissap-500 px-7 py-4 text-base font-semibold text-white transition hover:bg-bissap-600"
              >
                Ouvrir ma boutique
              </Link>
              <Link
                href="#metier"
                className="inline-flex items-center justify-center rounded-sm border border-white/25 px-7 py-4 text-base font-medium text-white transition hover:border-white/60"
              >
                Voir ce que ça change
              </Link>
            </div>

            <p className="mt-6 font-mono text-xs uppercase tracking-[0.18em] text-nuit-300">
              30 jours offerts · sans carte bancaire
            </p>
          </div>

          {/* Le rail de tickets : la vie d'une seule commande, de bout en bout.
              Les trois feuillets restent solidaires, séparés par leur perforation. */}
          <div
            className="relative rotate-[-1.2deg]"
            aria-label="Le suivi de la commande DJ-7823"
          >
            <div
              className="slip-in relative z-10 rounded-t-sm bg-chaux-50 p-5 text-nuit-800 shadow-[0_24px_50px_rgba(6,10,25,0.45)]"
              style={{ animationDelay: '0.05s' } as CSSProperties}
            >
              <div className="flex items-baseline justify-between font-mono text-xs">
                <span className="font-semibold tracking-tight">#DJ-7823</span>
                <span className="text-chaux-600">mar. 23:41</span>
              </div>

              <div className="mt-4 space-y-1.5 font-mono text-sm">
                <div className="flex justify-between gap-4">
                  <span>2 × pizza margherita</span>
                  <span className="text-chaux-600">7 000</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>1 × jus de bissap</span>
                  <span className="text-chaux-600">2 500</span>
                </div>
              </div>

              <div className="mt-4 flex items-baseline justify-between border-t border-dashed border-nuit-900/25 pt-3">
                <span className="font-mono text-xs uppercase tracking-[0.16em] text-chaux-600">
                  à payer
                </span>
                <span className="font-mono text-lg font-semibold text-bissap-600">9 500 FCFA</span>
              </div>

              <div className="mt-5 flex items-center justify-between">
                <span className="stamp font-mono text-xs font-semibold uppercase text-nuit-500">
                  cocody
                </span>
                <Chip tone="mangue">reçue</Chip>
              </div>
            </div>

            <div
              className="slip-in relative z-20 bg-chaux-50 px-5 pb-5 pt-6 text-nuit-800 shadow-[0_24px_50px_rgba(6,10,25,0.4)]"
              style={{ '--tear-bg': NUIT, animationDelay: '0.28s' } as CSSProperties}
            >
              <div className="tear absolute inset-x-0 top-0" />
              <div className="flex items-baseline justify-between font-mono text-xs">
                <span className="text-chaux-600">assignation</span>
                <span className="text-chaux-600">23:43</span>
              </div>
              <p className="mt-3 font-display text-lg font-bold">Aminata K.</p>
              <p className="font-mono text-sm text-chaux-600">zone Cocody · 1,4 km · à moto</p>
              <div className="mt-4 flex justify-end">
                <Chip tone="nuit">livreur assigné</Chip>
              </div>
            </div>

            <div
              className="slip-in relative z-30 rounded-b-sm bg-chaux-50 px-5 pb-5 pt-6 text-nuit-800 shadow-[0_24px_50px_rgba(6,10,25,0.35)]"
              style={{ '--tear-bg': NUIT, animationDelay: '0.52s' } as CSSProperties}
            >
              <div className="tear absolute inset-x-0 top-0" />
              <div className="flex items-baseline justify-between font-mono text-xs">
                <span className="text-chaux-600">reçu</span>
                <span className="text-chaux-600">23:52</span>
              </div>
              <div className="mt-3 space-y-1.5 font-mono text-sm">
                <div className="flex justify-between gap-4">
                  <span>livrée en</span>
                  <span>11 min</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>encaissé · mobile money</span>
                  <span className="font-semibold">9 500</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>note du client</span>
                  <span>5/5</span>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Chip tone="feuille">livrée</Chip>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-6xl px-4 sm:px-6 lg:mt-20">
          <div className="border-t border-white/12 pt-8">
            <Eyebrow className="text-nuit-300">
              ce que DjiguiFlow prend en charge, dès la première commande
            </Eyebrow>
            <dl className="mt-6 grid gap-8 sm:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.label} className="flex flex-col-reverse">
                  <dt className="mt-1 text-sm text-nuit-200">{stat.label}</dt>
                  <dd className="font-display text-4xl font-extrabold tracking-tight">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ ce que vous arrêtez de faire */}
      <section id="metier" className="scroll-mt-20 py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Eyebrow className="text-chaux-600">votre journée, en moins</Eyebrow>
          <h2 className="mt-4 max-w-2xl font-display text-4xl font-extrabold leading-[1.02] tracking-[-0.02em] text-nuit-800 sm:text-5xl">
            Six choses que vous arrêtez de faire à la main.
          </h2>

          <div className="mt-14 grid gap-x-12 gap-y-10 md:grid-cols-2">
            {releves.map((item) => (
              <div key={item.cle} className="border-t border-nuit-900/15 pt-5">
                <span className="font-mono text-xs uppercase tracking-[0.22em] text-bissap-500">
                  {item.cle}
                </span>
                <h3 className="mt-3 font-display text-2xl font-bold tracking-tight text-nuit-800">
                  {item.titre}
                </h3>
                <p className="mt-2.5 max-w-md leading-relaxed text-nuit-700/85">{item.texte}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- la caisse */}
      <section id="caisse" className="scroll-mt-20 bg-chaux-200/60 py-20 lg:py-28">
        <div className="mx-auto grid max-w-6xl gap-14 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div
            className="rounded-sm bg-chaux-50 p-6 shadow-[0_18px_44px_rgba(19,28,61,0.12)] sm:p-8"
            style={{ '--tear-bg': CHAUX } as CSSProperties}
          >
            <div className="flex items-baseline justify-between font-mono text-xs uppercase tracking-[0.16em] text-chaux-600">
              <span>djiguiflow · relevé</span>
              <span>mar. 4 août</span>
            </div>

            <dl className="mt-6 space-y-2 font-mono text-sm">
              {releve.map((ligne) => (
                <div key={ligne.poste} className="flex items-baseline justify-between gap-4">
                  <dt className="text-nuit-700">{ligne.poste}</dt>
                  <dd className="font-semibold text-nuit-800">{ligne.valeur}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 border-t border-dashed border-nuit-900/25 pt-5">
              <dl className="space-y-2 font-mono text-sm">
                {encaisse.map((ligne) => (
                  <div key={ligne.poste} className="flex items-baseline justify-between gap-4">
                    <dt className="text-nuit-700">{ligne.poste}</dt>
                    <dd className="text-nuit-800">{ligne.valeur}</dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-4 pt-2">
                  <dt className="font-mono text-xs uppercase tracking-[0.16em] text-chaux-600">
                    total encaissé
                  </dt>
                  <dd className="font-mono text-xl font-semibold text-bissap-600">312 500 FCFA</dd>
                </div>
              </dl>
            </div>

            <div className="mt-5 space-y-2 border-t border-dashed border-nuit-900/25 pt-5 font-mono text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-nuit-700">note moyenne</span>
                <span className="text-nuit-800">4,8 / 5</span>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-nuit-700">meilleure zone</span>
                <span className="text-nuit-800">Cocody</span>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-nuit-700">rupture ce soir</span>
                <span className="text-bissap-600">jus de bissap</span>
              </div>
            </div>
          </div>

          <div>
            <Eyebrow className="text-chaux-600">à la fermeture</Eyebrow>
            <h2 className="mt-4 font-display text-4xl font-extrabold leading-[1.02] tracking-[-0.02em] text-nuit-800 sm:text-5xl">
              Le soir, tout est déjà compté.
            </h2>
            <p className="mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-nuit-700/85">
              Pas de carnet à recopier, pas de calcul de fin de journée. Le relevé se remplit à
              mesure que les commandes tombent : ce qui est vendu, ce qui est encaissé, ce qui est
              parti en retard et ce qu’il faut racheter demain matin.
            </p>
            <p className="mt-4 max-w-lg text-[1.0625rem] leading-relaxed text-nuit-700/85">
              Les mêmes chiffres alimentent vos alertes. Une rupture de stock, un livreur qui
              accumule les retards, une zone qui décroche : vous êtes prévenu avant que le client
              ne s’en aperçoive.
            </p>
            <Link
              href="/register"
              className="mt-8 inline-flex items-center gap-2 border-b-2 border-bissap-500 pb-1 font-semibold text-nuit-800 transition hover:border-bissap-600 hover:text-bissap-600"
            >
              Voir le relevé de ma boutique
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* --------------------------------------------- les boutiques en ligne */}
      <BoutiquesEnLigne />

      <div className="perf-line mx-auto max-w-6xl px-4 text-nuit-900 sm:px-6" />

      {/* -------------------------------------------------------------- tarifs */}
      <section id="tarifs" className="scroll-mt-20 py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Eyebrow className="text-chaux-600">tarifs</Eyebrow>
          <h2 className="mt-4 max-w-2xl font-display text-4xl font-extrabold leading-[1.02] tracking-[-0.02em] text-nuit-800 sm:text-5xl">
            Un tarif par volume de commandes. Payé d’avance, sans engagement.
          </h2>

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {BILLING_PLANS.map((plan) => {
              const vedette = plan.popular;
              return (
                <div
                  key={plan.key}
                  className={`relative flex flex-col rounded-sm p-7 ${
                    vedette
                      ? 'bg-nuit-800 text-white shadow-[0_24px_50px_rgba(19,28,61,0.28)]'
                      : 'bg-chaux-50 text-nuit-800 shadow-[0_14px_36px_rgba(19,28,61,0.09)]'
                  }`}
                  style={{ '--tear-bg': CHAUX } as CSSProperties}
                >
                  <div className="tear absolute inset-x-0 top-0" />

                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-xs uppercase tracking-[0.22em] ${
                        vedette ? 'text-nuit-200' : 'text-chaux-600'
                      }`}
                    >
                      {plan.key}
                    </span>
                    {vedette && (
                      <span className="stamp font-mono text-xs font-semibold uppercase text-mangue-300">
                        le plus pris
                      </span>
                    )}
                  </div>

                  <h3 className="mt-4 font-display text-3xl font-extrabold tracking-tight">
                    {plan.name}
                  </h3>
                  <p
                    className={`mt-2 text-sm leading-relaxed ${
                      vedette ? 'text-nuit-100' : 'text-nuit-700/85'
                    }`}
                  >
                    {plan.description}
                  </p>

                  <div
                    className={`mt-7 flex items-baseline gap-2 border-t border-dashed pt-6 ${
                      vedette ? 'border-white/25' : 'border-nuit-900/25'
                    }`}
                  >
                    <span className="font-mono text-4xl font-semibold tracking-tight">
                      {plan.priceLabel}
                    </span>
                    <span
                      className={`font-mono text-xs uppercase tracking-[0.16em] ${
                        vedette ? 'text-nuit-200' : 'text-chaux-600'
                      }`}
                    >
                      {plan.suffixePrix}
                    </span>
                  </div>

                  <ul className="mt-7 flex-1 space-y-2.5 text-sm">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3">
                        <span
                          aria-hidden="true"
                          className={vedette ? 'text-accent-300' : 'text-accent-600'}
                        >
                          ✓
                        </span>
                        <span className={vedette ? 'text-nuit-100' : 'text-nuit-700'}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={`/login?next=${encodeURIComponent(`/dashboard/paiements?plan=${plan.key}`)}`}
                    className={`mt-8 inline-flex w-full items-center justify-center rounded-sm px-5 py-3.5 font-semibold transition ${
                      vedette
                        ? 'bg-bissap-500 text-white hover:bg-bissap-400'
                        : 'border border-nuit-800 text-nuit-800 hover:bg-nuit-800 hover:text-white'
                    }`}
                  >
                    Choisir {plan.name}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ questions */}
      <section id="questions" className="scroll-mt-20 bg-chaux-200/60 py-20 lg:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Eyebrow className="text-chaux-600">questions</Eyebrow>
          <h2 className="mt-4 font-display text-4xl font-extrabold leading-[1.02] tracking-[-0.02em] text-nuit-800">
            Ce qu’on nous demande avant de signer.
          </h2>

          <div className="mt-10">
            {questions.map((item) => (
              <details key={item.q} className="group border-t border-nuit-900/15">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-left font-display text-lg font-bold text-nuit-800 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="mt-1 font-mono text-lg leading-none text-bissap-500 transition group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-2xl pb-6 leading-relaxed text-nuit-700/85">{item.r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ appel final */}
      <section className="indigo-weave bg-nuit-800 py-20 text-white lg:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 className="max-w-xl font-display text-4xl font-extrabold leading-[1.02] tracking-[-0.02em] sm:text-5xl">
              La prochaine commande peut déjà passer toute seule.
            </h2>
            <p className="mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-nuit-100">
              Ouvrez votre boutique, branchez votre numéro WhatsApp, ajoutez vos produits. Vos
              clients, eux, n’ont rien à apprendre.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-sm bg-bissap-500 px-7 py-4 text-base font-semibold text-white transition hover:bg-bissap-600"
              >
                Ouvrir ma boutique
              </Link>
              <button
                type="button"
                onClick={openAssistant}
                className="inline-flex items-center justify-center rounded-sm border border-white/25 px-7 py-4 text-base font-medium text-white transition hover:border-white/60"
              >
                Poser une question
              </button>
            </div>
          </div>

          <div
            className="rounded-sm border border-dashed border-white/30 p-6 font-mono text-sm text-nuit-200"
            aria-hidden="true"
          >
            <div className="flex items-baseline justify-between text-xs uppercase tracking-[0.16em]">
              <span>#DJ-0001</span>
              <span>en attente</span>
            </div>
            <div className="mt-6 space-y-3">
              <div className="h-px w-3/4 bg-white/15" />
              <div className="h-px w-1/2 bg-white/15" />
              <div className="h-px w-2/3 bg-white/15" />
            </div>
            <p className="mt-8 text-nuit-300">votre première commande</p>
          </div>
        </div>
      </section>

      <footer className="bg-nuit-900 py-14 text-nuit-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span className="font-display text-xl tracking-tight text-white">
              <span className="font-extrabold">Djigui</span>
              <span className="font-light text-nuit-300">Flow</span>
            </span>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-nuit-300">
              Les commandes, les livreurs et la caisse des commerces d’Afrique de l’Ouest, dans un
              seul flux.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <Link href="#metier" className="transition hover:text-white">
              Ce que ça change
            </Link>
            <Link href="#tarifs" className="transition hover:text-white">
              Tarifs
            </Link>
            <Link href="#questions" className="transition hover:text-white">
              Questions
            </Link>
            <Link href="/boutiques" className="transition hover:text-white">
              Les boutiques
            </Link>
            <Link href="/login" className="transition hover:text-white">
              Connexion
            </Link>
          </nav>
        </div>

        <div className="mx-auto mt-12 max-w-6xl px-4 sm:px-6">
          <p className="border-t border-white/10 pt-6 font-mono text-xs uppercase tracking-[0.16em] text-nuit-300">
            djiguiflow · abidjan · bamako · dakar
          </p>
        </div>
      </footer>

      <AssistantChat />
    </main>
  );
}
