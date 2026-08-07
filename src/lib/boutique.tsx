'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type BoutiqueOption = { id: string; nom: string; secteur: string; emoji: string };

type BoutiqueCtx = {
  /** '' = marchand par défaut côté serveur (MARCHAND_DEFAUT). */
  boutiqueId: string;
  setBoutiqueId: (id: string) => void;
  boutiques: BoutiqueOption[];
  /** Registre chargé et sélection restaurée : les pages peuvent charger. */
  pret: boolean;
};

const CLE_STOCKAGE = 'djiguiflow.boutique';
const Contexte = createContext<BoutiqueCtx | null>(null);

export function useBoutique(): BoutiqueCtx {
  const c = useContext(Contexte);
  if (!c) throw new Error('useBoutique doit être utilisé dans <BoutiqueProvider>');
  return c;
}

/** Ajoute ?boutique_id= à une URL d'API quand une boutique est sélectionnée. */
export function avecBoutique(url: string, boutiqueId: string): string {
  if (!boutiqueId) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}boutique_id=${encodeURIComponent(boutiqueId)}`;
}

export function BoutiqueProvider({ children }: { children: ReactNode }) {
  const [boutiqueId, setBoutiqueIdState] = useState('');
  const [boutiques, setBoutiques] = useState<BoutiqueOption[]>([]);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    let annule = false;

    (async () => {
      try {
        const r = await fetch('/api/marchands');
        const d = await r.json();
        if (annule) return;

        const liste: BoutiqueOption[] = Array.isArray(d?.marchands) ? d.marchands : [];
        setBoutiques(liste);

        // Une boutique mémorisée qui a disparu du registre doit être oubliée,
        // sinon toutes les requêtes partiraient en 404.
                const memorise = localStorage.getItem(CLE_STOCKAGE) || '';
        if (memorise && liste.some(b => b.id === memorise)) {
          setBoutiqueIdState(memorise);
        } else {
          if (memorise) localStorage.removeItem(CLE_STOCKAGE);
          // Premier visite : on sélectionne automatiquement la première boutique du registre
          if (liste.length > 0) setBoutiqueIdState(liste[0].id);
        }

      } catch (e) {
        console.error('Chargement du registre boutiques :', e);
      } finally {
        // Même en cas d'échec : on débloque les pages, qui repartent
        // sur le marchand par défaut.
        if (!annule) setPret(true);
      }
    })();

    return () => { annule = true; };
  }, []);

  const setBoutiqueId = (id: string) => {
    setBoutiqueIdState(id);
    if (id) localStorage.setItem(CLE_STOCKAGE, id);
    else localStorage.removeItem(CLE_STOCKAGE);
  };

  return (
    <Contexte.Provider value={{ boutiqueId, setBoutiqueId, boutiques, pret }}>
      {children}
    </Contexte.Provider>
  );
}
