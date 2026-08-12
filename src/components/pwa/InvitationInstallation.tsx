'use client';

import { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';

/**
 * L'evenement que Chrome emet quand l'application devient installable. Il ne
 * figure pas dans les types du DOM : il n'est pas standardise, et Safari ne
 * l'emet pas.
 */
type EvenementInstallation = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const CLE_REFUS = 'djiguiflow:installation-refusee';

/**
 * Invite le marchand a poser DjiguiFlow sur son ecran d'accueil.
 *
 * Deux chemins, parce que les navigateurs ne se ressemblent pas :
 *  - Chrome/Android emet `beforeinstallprompt`, on peut donc ouvrir la vraie
 *    boite d'installation du systeme ;
 *  - Safari/iOS n'emet rien et n'expose aucune API. Il ne reste qu'a montrer
 *    le geste — Partager, puis « Sur l'ecran d'accueil ».
 *
 * L'invite ne revient pas apres un refus : un bandeau qui reapparait a chaque
 * ouverture se fait ignorer, puis detester.
 */
export default function InvitationInstallation() {
  const [invite, setInvite] = useState<EvenementInstallation | null>(null);
  const [surIOS, setSurIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Deja installee : `standalone` sur les navigateurs recents, la propriete
    // non standard de Safari sinon.
    const installee =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (installee) return;

    let refusee = false;
    try {
      refusee = localStorage.getItem(CLE_REFUS) === '1';
    } catch {
      // Navigation privee : le stockage leve. On montre l'invite, c'est le
      // moindre mal.
    }
    if (refusee) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

    const surInvite = (e: Event) => {
      // Sans cela Chrome affiche sa propre barre, en plus de la notre.
      e.preventDefault();
      setInvite(e as EvenementInstallation);
      setVisible(true);
    };

    // L'ecoute est posee tout de suite : `beforeinstallprompt` peut partir
    // tres tot apres le chargement, et un abonnement differe le manquerait.
    if (!ios) window.addEventListener('beforeinstallprompt', surInvite);

    // iOS n'annoncera jamais l'installabilite : on affiche les instructions
    // sans attendre d'evenement. Le report d'un tick evite d'ecrire dans
    // l'etat pendant l'effet, ce qui declencherait un rendu en cascade —
    // meme procede que la garde d'acces de `dashboard/layout.tsx`.
    const minuteur = window.setTimeout(() => {
      if (ios) {
        setSurIOS(true);
        setVisible(true);
      }
    }, 0);

    return () => {
      window.clearTimeout(minuteur);
      window.removeEventListener('beforeinstallprompt', surInvite);
    };
  }, []);

  const fermer = () => {
    setVisible(false);
    try {
      localStorage.setItem(CLE_REFUS, '1');
    } catch {
      // Sans stockage, l'invite reviendra. Acceptable.
    }
  };

  const installer = async () => {
    if (!invite) return;
    await invite.prompt();
    await invite.userChoice;
    // L'evenement ne se rejoue pas : qu'il ait accepte ou refuse, l'invite
    // a fait son office.
    setInvite(null);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Installer DjiguiFlow"
      // `bottom-24` sous lg : la barre de navigation du bas occupe deja le
      // pied d'ecran.
      className="fixed inset-x-3 bottom-24 z-40 rounded-[1.5rem] border border-[var(--hairline)] bg-white p-4 shadow-[0_18px_45px_rgba(12,18,41,0.22)] lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-96"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 text-lg font-black text-white">
          D
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-black text-nuit-900">Installer DjiguiFlow</p>
          <p className="mt-1 text-sm leading-snug text-chaux-600">
            {surIOS
              ? 'Ouvrez le menu Partager, puis « Sur l’écran d’accueil ».'
              : 'Ajoutez l’application à votre écran d’accueil pour l’ouvrir en un geste.'}
          </p>

          {surIOS ? (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-chaux-600">
              <Share className="h-4 w-4" aria-hidden />
              Partager
              <span aria-hidden>→</span>
              <SquarePlus className="h-4 w-4" aria-hidden />
              Sur l’écran d’accueil
            </p>
          ) : (
            <button
              onClick={installer}
              className="mt-3 inline-flex min-h-[2.75rem] items-center gap-2 rounded-full bg-bissap-500 px-5 py-2.5 text-sm font-bold text-white active:bg-bissap-600"
            >
              <Download className="h-4 w-4" />
              Installer
            </button>
          )}
        </div>

        <button
          onClick={fermer}
          aria-label="Ne plus proposer l’installation"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-chaux-500 hover:bg-chaux-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
