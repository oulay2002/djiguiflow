'use client';

import { supabase } from '@/lib/supabase';
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

/**
 * Rend l'uuid de la boutique sur laquelle travailler, ou null.
 *
 * Trois ecrans resolvaient « ma boutique » par un `.single()` sur
 * `user_id` — ce qui suppose qu'un marchand n'en possede qu'une. Des qu'un
 * compte en tient deux, PostgREST repond 406 (« The result contains 2 rows »),
 * la resolution echoue et l'ecran s'affiche vide : constate le 11 aout 2026
 * sur Commandes et Livreurs, qui annoncaient zero commande a un compte qui en
 * avait six. Et le selecteur du bandeau, lui, etait purement ignore.
 *
 * `boutiqueId` porte le slug, alors que `commandes.boutique_id` est un uuid :
 * d'ou la traduction. Sans selection — un compte sans registre — on prend la
 * premiere boutique possedee, mais avec `limit(1)` et non `single()`, pour que
 * le cas « plusieurs » cesse d'etre une erreur.
 */
export async function uuidBoutiqueCourante(boutiqueId: string): Promise<string | null> {
  const requete = supabase.from('boutiques').select('id');
  const { data, error } = boutiqueId
    ? await requete.eq('slug', boutiqueId).limit(1)
    : await requete.limit(1);

  if (error) {
    console.error('Résolution de la boutique courante :', error);
    return null;
  }
  return data?.[0]?.id ?? null;
}

export function BoutiqueProvider({ children }: { children: ReactNode }) {
  const [boutiqueId, setBoutiqueIdState] = useState('');
  const [boutiques, setBoutiques] = useState<BoutiqueOption[]>([]);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    let annule = false;

    // LE CHOIX DU MARCHAND EST DEJA CONNU : il est range dans le navigateur.
    // On le publie tout de suite pour que l ecran lance ses lectures, et on
    // verifie le registre en arriere-plan. Attendre le registre ajoutait un
    // aller-retour complet AVANT que la page ne commence seulement a
    // travailler — sur chacun des onze ecrans, a chaque navigation.
    //
    // Si la boutique memorisee a disparu du registre, la verification la
    // corrige quelques centaines de millisecondes plus tard et les pages,
    // qui suivent `boutiqueId`, relisent d elles-memes.
    (async () => {
      // Un rendu de plus, volontairement : il coute infiniment moins que
      // l'aller-retour qu'il evite.
      const memoriseAuDepart = localStorage.getItem(CLE_STOCKAGE) || '';
      if (memoriseAuDepart) {
        setBoutiqueIdState(memoriseAuDepart);
        setPret(true);
      }

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token ?? '';
        const r = await fetch('/api/dashboard/mes-boutiques', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
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
          // Premiere visite : on retient la premiere boutique du registre — et
          // on la MEMORISE. Sans cela, chaque ecran devait redemander le
          // registre avant de pouvoir lire quoi que ce soit : le raccourci
          // ci-dessus ne servait jamais a un marchand qui ne touche jamais au
          // selecteur, c est-a-dire a celui qui n a qu une boutique.
          if (liste.length > 0) {
            setBoutiqueIdState(liste[0].id);
            localStorage.setItem(CLE_STOCKAGE, liste[0].id);
          }
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
