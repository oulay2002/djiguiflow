import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';

/**
 * Le guide de branchement, DANS le produit.
 *
 * POURQUOI UNE PAGE ET PAS UN LIEN. Ce guide a d'abord vecu comme document
 * partage. Un lien externe se perd, se partage a moitie, et vieillit a part du
 * produit qu'il decrit. Ici il suit le code : quand une etape change, elle
 * change au meme endroit que ce qu'elle explique.
 *
 * ELLE EST PUBLIQUE, ET C'EST VOULU. Un marchand qui n'arrive pas a se
 * connecter ne peut pas lire une page qui exige d'etre connecte.
 *
 * LE DISPOSITIF DU DOCUMENT est la souche « Verifiez » sous chaque etape.
 * C'est ce qui distingue un guide d'une liste d'instructions : le marchand est
 * seul devant son ecran, il n'a pas besoin d'une consigne de plus, il a besoin
 * de savoir s'il peut passer a la suite.
 *
 * LA PAGE EST UN CARNET A SOUCHES, et le systeme visuel le dit sans decor
 * ajoute : la couture perforee ouvre chaque acte, la souche se detache du
 * feuillet, le verrou bloquant est un feuillet arrache au fond de la page.
 *
 * ON N'Y ARRIVE PAS TOUJOURS PAR LE HAUT. Le bandeau du tableau de bord
 * designe une etape precise, et la commande d'essai renvoie a l'etape en
 * cause : chaque etape porte donc son ancre, et la carte visee s'annonce.
 */

export const metadata: Metadata = {
  title: 'Brancher sa boutique — DjiguiFlow',
  description:
    'Huit étapes pour que votre boutique reçoive de vraies commandes, les confie '
    + 'à un livreur et tienne son stock toute seule.',
};

/**
 * L'ouverture d'un acte.
 *
 * C'est la colonne vertebrale de la page, et elle doit peser plus lourd qu'une
 * carte d'etape : sous un oeil qui parcourt, ce sont ces quatre reperes qui
 * disent ou l'on en est. La couture perforee est le separateur du systeme —
 * un filet gris ferait le meme travail en disant qu'on est ailleurs.
 */
function Acte({
  titre,
  compte,
  tampon,
}: {
  titre: string;
  compte?: string;
  tampon?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-4">
        <h2 className="font-display text-lg font-extrabold uppercase tracking-[0.14em] text-nuit-900">
          {titre}
        </h2>
        {compte ? (
          <span className="ml-auto font-mono text-xs text-chaux-600">{compte}</span>
        ) : null}
        {tampon ? (
          <span className="stamp ml-auto font-mono text-xs font-bold uppercase text-bissap-600">
            {tampon}
          </span>
        ) : null}
      </div>
      <div className="perf-line mt-4 text-nuit-900" aria-hidden />
    </div>
  );
}

/**
 * Un feuillet : le geste en haut, la preuve qu'il a pris en bas.
 *
 * L'adresse (« ou ») se lit AVANT le titre, parce qu'un marchand qui reprend
 * son branchement cherche d'abord l'ecran, pas l'intitule. Elle est a deux
 * niveaux : l'application porte le poids, le chemin reste en retrait.
 */
function Etape({
  rang,
  titre,
  app,
  chemin,
  children,
  verification,
}: {
  rang: number;
  titre: string;
  app: string;
  chemin?: string;
  children: ReactNode;
  verification: ReactNode;
}) {
  return (
    <article
      id={`etape-${rang}`}
      className="etape scroll-mt-6 border border-chaux-200 bg-white sm:scroll-mt-10"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-baseline gap-4">
          <span className="w-7 shrink-0 font-mono text-2xl font-bold leading-none tabular-nums text-nuit-900 sm:w-9 sm:text-3xl">
            {rang}
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="font-mono text-xs uppercase tracking-[0.14em]">
              <b className="font-semibold text-nuit-900">{app}</b>
              {chemin ? <span className="text-chaux-600"> · {chemin}</span> : null}
            </p>
            <h3 className="font-display text-xl font-bold leading-tight tracking-[-0.01em] text-nuit-900">
              {titre}
            </h3>
          </div>
        </div>

        <div className="flex max-w-[66ch] flex-col gap-3 text-nuit-800">{children}</div>
      </div>

      {/* La souche : ce qu'on garde quand on a arrache le reste. */}
      <div className="souche bg-accent-50 px-5 py-4 sm:px-6">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-accent-700">
          Vérifiez
        </p>
        <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-nuit-800">
          {verification}
        </p>
      </div>
    </article>
  );
}

/** Ce que le marchand tape ou colle : la mono le dit sans le dire. */
function Val({ children }: { children: ReactNode }) {
  return (
    <code className="whitespace-nowrap border border-chaux-200 bg-chaux-50 px-1.5 py-0.5 font-mono text-[0.85em] text-nuit-900">
      {children}
    </code>
  );
}

/**
 * Les echanges Telegram, schematises.
 *
 * Pas des captures : elles vieillissent a chaque mise a jour de Telegram, sont
 * illisibles sur un petit ecran, et noient l'essentiel dans du decor. Le schema
 * dit ce qu'il faut ENVOYER et ce qu'il faut ATTENDRE.
 *
 * Les bulles du marchand sont en indigo, pas en bissap : ce sont ses propres
 * mots, de la structure, et le bissap se garde pour ce qui exige un geste.
 */
function Echange({ legende, lignes }: { legende: string; lignes: [string, string][] }) {
  return (
    <div className="flex flex-col gap-2 border border-chaux-200 bg-chaux-50 p-3.5">
      <span className="font-mono text-xs uppercase tracking-[0.14em] text-chaux-600">
        {legende}
      </span>
      {lignes.map(([qui, texte], i) => (
        <span
          key={i}
          className={
            qui === 'moi'
              ? 'max-w-[88%] self-end bg-nuit-800 px-3 py-2 font-mono text-sm text-white'
              : 'max-w-[88%] self-start border border-chaux-200 bg-white px-3 py-2 text-sm text-nuit-800'
          }
        >
          {texte}
        </span>
      ))}
    </div>
  );
}

/** Un renvoi vers l'etape en cause. Le lien fait ce que le texte promettait. */
function Renvoi({ etape }: { etape: number }) {
  return (
    <a
      href={`#etape-${etape}`}
      className="font-semibold text-nuit-700 underline decoration-nuit-200 underline-offset-4 transition-colors duration-150 hover:decoration-nuit-700"
    >
      Sinon&nbsp;: étape {etape}
    </a>
  );
}

/**
 * Les quatre preuves de la commande d'essai.
 *
 * Chacune designe l'etape qui manque : c'est la seule table de diagnostic dont
 * dispose un marchand seul devant son telephone.
 */
const PREUVES: { titre: string; detail: string; etape: number }[] = [
  {
    titre: 'Le client reçoit la demande de confirmation',
    detail: 'Avec les deux liens, « Je confirme » et « J’annule ».',
    etape: 4,
  },
  {
    titre: 'Vous recevez l’alerte de nouvelle commande',
    detail: 'Sur votre Telegram privé.',
    etape: 5,
  },
  {
    titre: 'Le groupe reçoit la course',
    detail: 'Avec les articles lisibles et les boutons J’accepte / Je refuse.',
    etape: 6,
  },
  {
    titre: 'À l’acceptation : itinéraire, puis frais, puis suivi',
    detail:
      'Le livreur annonce son tarif, le client en est prévenu, et le stock se décompte.',
    etape: 7,
  },
];

const SURPRISES: [string, string][] = [
  [
    'Sans horaires, votre boutique est toujours ouverte',
    'C’est volontaire : personne ne doit se retrouver fermé par accident. Mais tant que vous ne les déclarez pas, vous recevrez des commandes à 3 h du matin.',
  ],
  [
    'Le classeur Google est facultatif',
    'Ne vous en occupez que si vous tenez à retrouver vos commandes dans un tableur. Un bouton crée vos onglets en un clic ; sans lui, tout fonctionne quand même.',
  ],
  [
    'Une pause vaut mieux qu’un stock à zéro',
    'Four en panne, rupture imprévue, journée débordée : le bouton « Je ferme un moment » suspend les commandes pour la durée que vous choisissez, et rouvre tout seul.',
  ],
];

export default function GuideBrancherPage() {
  return (
    <main className="min-h-screen bg-chaux-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-16 px-5 py-16 sm:gap-20 sm:px-6">

        <header className="flex flex-col gap-5">
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.02em] text-nuit-900 sm:text-5xl">
            Brancher sa boutique
          </h1>
          <p className="max-w-[34em] text-lg leading-relaxed text-nuit-700">
            Huit étapes pour que votre boutique reçoive de vraies commandes, les confie
            à un livreur et tienne son stock toute seule.
          </p>
          <p className="border-t border-chaux-200 pt-4 font-mono text-xs text-chaux-600">
            Comptez 30 minutes · Prévoyez votre téléphone à portée de main
          </p>
        </header>

        <section className="flex flex-col gap-5">
          <Acte titre="Votre boutique" compte="Étapes 1 à 2" />

          <div className="flex flex-col gap-3">
            <Etape
              rang={1}
              titre="Décrivez votre boutique"
              app="Tableau de bord"
              chemin="Ma Boutique"
              verification="Ouvrez votre vitrine. Votre nom et votre logo s’y affichent."
            >
              <p>
                Votre nom d’enseigne, votre secteur, votre quartier, votre numéro de
                téléphone et votre logo. C’est ce que vos clients verront en haut de
                votre vitrine.
              </p>
            </Etape>

            <Etape
              rang={2}
              titre="Mettez vos articles en vente"
              app="Tableau de bord"
              chemin="Produits"
              verification="Vos articles apparaissent sur votre vitrine, avec leur prix."
            >
              <p>
                Un nom, un prix, une photo. Indiquez la quantité dont vous disposez si
                vous voulez que DjiguiFlow la décompte à chaque vente — laissez le stock
                vide pour les articles que vous ne comptez pas.
              </p>
            </Etape>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <Acte titre="Vos canaux" compte="Étapes 3 à 6" />

          <p className="max-w-[66ch] text-nuit-700">
            Ces quatre étapes se suivent dans l’ordre, et l’ordre n’est pas un détail :
            vous ne pouvez pas obtenir votre identifiant avant que le bot existe, ni
            créer le groupe des livreurs avant d’avoir le bot à y ajouter.
          </p>

          <div className="flex flex-col gap-3">
            <Etape
              rang={3}
              titre="Créez votre bot Telegram"
              app="Telegram"
              chemin="écrivez à @BotFather"
              verification={
                <>
                  Votre bot apparaît dans Telegram et répond quand vous lui écrivez. Le
                  jeton est la ligne qui contient <b>deux-points</b> — c’est elle qu’il
                  faut copier, en entier.
                </>
              }
            >
              <ol className="flex list-decimal flex-col gap-1.5 pl-5">
                <li>Envoyez-lui <Val>/newbot</Val>.</li>
                <li>Donnez le nom de votre boutique, puis un identifiant finissant par <Val>bot</Val>.</li>
                <li>Il vous répond avec un <b>jeton</b> — une longue suite de caractères. Gardez-la.</li>
              </ol>
              <Echange
                legende="Conversation avec @BotFather"
                lignes={[
                  ['moi', '/newbot'],
                  ['lui', 'Alright, a new bot. How are we going to call it?'],
                  ['moi', 'Ma Boutique'],
                  ['lui', 'Good. Now let’s choose a username for your bot.'],
                  ['moi', 'MaBoutique_bot'],
                  ['lui', 'Done! Use this token to access the HTTP API : 8740607635:AAH…'],
                ]}
              />
            </Etape>

            <Etape
              rang={4}
              titre="Connectez vos messageries"
              app="Onboarding"
              chemin="étapes 1 et 2"
              verification="La pastille « connecté » s’allume à côté du champ."
            >
              <p>
                Indiquez d’abord le numéro WhatsApp auquel vos clients écrivent, au format
                international sans le plus — <Val>2250759486701</Val>. Collez ensuite le
                jeton de votre bot dans le champ Telegram.
              </p>
              <p className="text-sm text-nuit-600">
                Ce que vous collez part dans un coffre chiffré : rien ne réapparaîtra sur
                cette page, et personne d’autre ne peut le lire. C’est votre propre compte
                qui parle à vos clients, jamais un numéro partagé.
              </p>
            </Etape>

            <Etape
              rang={5}
              titre="Récupérez votre identifiant Telegram"
              app="Onboarding"
              chemin="étape 3"
              verification={
                <>
                  Le numéro est <b>positif</b> : c’est une personne. Enregistrez-le sans
                  espace ni signe autour.
                </>
              }
            >
              <p>
                Écrivez <Val>ID</Val> en privé à votre bot. Il vous répond un numéro.
                Recopiez-le dans le champ.
              </p>
              <p className="text-sm text-nuit-600">
                C’est là que vous recevrez l’alerte de chaque nouvelle commande.
              </p>
              <Echange
                legende="En privé, avec VOTRE bot"
                lignes={[
                  ['moi', 'ID'],
                  ['lui', '🆔 Identifiant de cette conversation : 1724402569'],
                ]}
              />
            </Etape>

            <Etape
              rang={6}
              titre="Créez le groupe de vos livreurs"
              app="Telegram"
              chemin="puis Onboarding, étape 4"
              verification={
                <>
                  Le numéro commence par un <b>tiret</b> — c’est ainsi que Telegram désigne
                  un groupe. Sans le tiret, vos courses ne partiraient nulle part.
                </>
              }
            >
              <ol className="flex list-decimal flex-col gap-1.5 pl-5">
                <li>Créez un groupe Telegram et nommez-le, par exemple <Val>Livreurs Ma Boutique</Val>.</li>
                <li>Ajoutez-y votre bot, <b>en administrateur</b>.</li>
                <li>Envoyez <Val>ID</Val> dans le groupe : le bot répond un numéro négatif.</li>
                <li>Recopiez ce numéro, signe moins compris, dans le champ.</li>
              </ol>
              <Echange
                legende="Dans le groupe des livreurs"
                lignes={[
                  ['moi', 'ID'],
                  ['lui', '🆔 Identifiant de cette conversation : -1003906513172'],
                ]}
              />
            </Etape>
          </div>
        </section>

        {/*
          Le verrou. C'est le seul endroit de la page ou le marchand doit
          s'arreter, donc le seul feuillet arrache au fond : `--tear-bg` vaut la
          couleur de la page, pour que les encoches soient de vrais trous.
        */}
        <section
          className="relative border-x border-b border-bissap-200 bg-bissap-50 px-5 py-8 sm:px-7 sm:py-9"
          style={{ '--tear-bg': 'var(--color-chaux-50)' } as CSSProperties}
        >
          <div className="tear absolute inset-x-0 top-0" aria-hidden />
          <div className="flex max-w-[62ch] flex-col gap-3">
            <h2 className="font-display text-2xl font-bold leading-tight tracking-[-0.01em] text-bissap-700">
              Votre tableau de bord est le juge
            </h2>
            <p className="text-nuit-800">
              Tant qu’il reste un bandeau rouge{' '}
              <b>« Votre boutique ne peut pas encore servir une commande »</b>, quelque
              chose manque — et il vous dit quoi.
            </p>
            <p className="text-nuit-800">
              Ne passez pas à la suite avant qu’il ait disparu. Une boutique en ligne mais
              non branchée accepte des commandes que personne ne traite : le client attend,
              et c’est vous qu’il juge.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <Acte titre="Vos livreurs et vos horaires" compte="Étapes 7 à 8" />

          <div className="flex flex-col gap-3">
            <Etape
              rang={7}
              titre="Inscrivez vos livreurs"
              app="Tableau de bord"
              chemin="Livreurs"
              verification="Le livreur passe de « invité » à « rattaché » dans la liste."
            >
              <p>
                Ajoutez chaque livreur avec son nom et son numéro, puis envoyez-lui son{' '}
                <b>lien d’invitation</b>. Il doit l’ouvrir : c’est ce geste qui relie son
                compte Telegram à votre boutique.
              </p>
              <p className="text-sm text-nuit-600">
                Un livreur qui rejoint le groupe sans ouvrir son lien peut livrer, mais vos
                clients ne recevront pas son numéro — seulement le vôtre.
              </p>
            </Etape>

            <Etape
              rang={8}
              titre="Déclarez vos horaires"
              app="Tableau de bord"
              chemin="Ma Boutique"
              verification="Votre vitrine affiche « Ouvert jusqu’à … » pendant vos heures, et annonce l’heure de réouverture en dehors."
            >
              <p>
                Cochez « Définir des horaires » et indiquez vos jours et heures d’ouverture.
                Si un service se termine après minuit, écrivez l’heure telle quelle —{' '}
                <Val>18:00</Val> à <Val>02:00</Val> est compris comme il faut.
              </p>
            </Etape>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <Acte titre="La commande d’essai" tampon="Obligatoire" />

          <p className="max-w-[66ch] text-nuit-800">
            Passez vous-même une commande depuis votre vitrine, puis acceptez-la comme
            livreur. Quatre choses doivent arriver — si l’une manque, c’est l’étape
            correspondante qui n’est pas terminée.
          </p>

          <ol className="flex flex-col gap-2.5">
            {PREUVES.map(({ titre, detail, etape }, i) => (
              <li
                key={titre}
                className="grid grid-cols-[1.75rem_1fr] gap-4 border border-chaux-200 bg-white px-4 py-3.5"
              >
                <span className="font-mono font-bold tabular-nums text-nuit-900">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <b className="block font-semibold text-nuit-900">{titre}</b>
                  <span className="mt-1 block max-w-[60ch] text-sm leading-snug text-chaux-600">
                    {detail} <Renvoi etape={etape} />
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-5">
          <Acte titre="Trois choses qui surprennent" />

          <div className="flex flex-col gap-4">
            {SURPRISES.map(([titre, texte]) => (
              <div key={titre} className="border-t border-chaux-200 pt-4">
                <b className="mb-1 block font-semibold text-nuit-900">{titre}</b>
                <p className="max-w-[66ch] text-nuit-700">{texte}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="flex flex-col gap-5 border-t border-chaux-200 pt-6">
          <p className="max-w-[62ch] text-sm text-chaux-600">
            Une étape résiste ? Ne devinez pas : le bandeau du tableau de bord et les
            quatre points de la commande d’essai désignent toujours l’étape en cause.
          </p>
          <Link
            href="/onboarding"
            className="inline-flex w-fit items-center gap-2 bg-bissap-500 px-5 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-bissap-600 active:translate-y-px"
          >
            Aller au branchement
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </footer>

      </div>
    </main>
  );
}
