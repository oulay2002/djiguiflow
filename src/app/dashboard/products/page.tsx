'use client';

import { useEffect, useState } from 'react';
import { useBoutique, avecBoutique } from '@/lib/boutique';
import {
  AlertTriangle,
  Pencil,
  Plus,
  RefreshCw,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { fetchDashboard } from '@/lib/apiClient';
import { Bouton } from '@/components/ui/Bouton';

type Prod = {
  id: string; nom: string; categorie: string; prix: number;
  description: string; disponible: boolean; image: string;
  stock: number | null; seuil_alerte: number | null;
  /** Retenu dans la selection du jour. Voir `SelectionDuJour` plus bas. */
  menu_du_jour: boolean;
  /** Le nom que le marchand donne a la caracteristique : Pointure, Taille… */
  attribut_nom: string;
  /** Les valeurs disponibles. Vide quand l'article n'a pas de caracteristique. */
  attribut_valeurs: string[];
};

export default function Page() {
  const [prods, setProds] = useState<Prod[]>([]);
  const [maj, setMaj] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [cat, setCat] = useState('toutes');

  const [ouvert, setOuvert] = useState(false);
  const [fNom, setFNom] = useState('');
  const [fCat, setFCat] = useState('');
  const [fPrix, setFPrix] = useState('');
  /**
   * La declinaison : un meme `groupe` rassemble les coloris d'un seul article.
   *
   * Le marchand n'a rien de nouveau a comprendre — il saisit ses articles comme
   * avant, un par coloris, et donne simplement le meme nom d'article aux
   * quatre. La vitrine fait le reste.
   */
  /**
   * Les coloris saisis en une seule fois.
   *
   * CE QU'IL FALLAIT FAIRE AVANT. Le marchand rouvrait le formulaire pour
   * chaque coloris, en retapant le nom, la categorie, le prix et la
   * description a l'identique — quatre fois pour quatre couleurs, avec quatre
   * occasions de se tromper d'un caractere et de casser le regroupement.
   *
   * Ce qui est COMMUN reste en haut ; ce qui DIFFERE — la couleur, sa photo,
   * son stock — se repete ici. C'est la seule chose qui distingue vraiment
   * deux declinaisons.
   */
  const [fColoris, setFColoris] = useState<
    { couleur: string; stock: string; fichier: File | null }[]
  >([]);
  const [fDesc, setFDesc] = useState('');
  const [fDispo, setFDispo] = useState(true);
  const [fUrl, setFUrl] = useState('');
  const [fFile, setFFile] = useState<File | null>(null);
  const [fStock, setFStock] = useState('');
  const [fSeuil, setFSeuil] = useState('5');
  /**
   * La caracteristique de l'article : pointure, taille, contenance.
   *
   * LE MARCHAND LA NOMME LUI-MEME, et ce n'est pas un detail. On dit POINTURE
   * pour une chaussure et TAILLE pour un vetement — deux mots pour la meme
   * idee, dans une meme boutique. Un champ fige aurait force le vendeur de
   * chaussures a ranger sa pointure sous un mot qui n'est pas le sien, et la
   * pharmacie sa contenance sous « taille ».
   */
  const [fAttrNom, setFAttrNom] = useState('');
  const [fAttrValeurs, setFAttrValeurs] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [msg, setMsg] = useState('');

  // Modal de modification de la fiche : nom, categorie, prix, description, photo.
  const [fiche, setFiche] = useState<Prod | null>(null);
  const [gNom, setGNom] = useState('');
  const [gCat, setGCat] = useState('');
  const [gPrix, setGPrix] = useState('');
  const [gDesc, setGDesc] = useState('');
  const [gFile, setGFile] = useState<File | null>(null);
  const [gAttrNom, setGAttrNom] = useState('');
  const [gAttrValeurs, setGAttrValeurs] = useState('');
  const [gMsg, setGMsg] = useState('');
  const [gEnvoi, setGEnvoi] = useState(false);

  /** Ce que la bascule du jour n'a pas pu enregistrer, dit une seule fois. */
  const [msgJour, setMsgJour] = useState('');

  // Modal de gestion de stock
  const [editProd, setEditProd] = useState<Prod | null>(null);
  const [eStock, setEStock] = useState('');
  const [eSeuil, setESeuil] = useState('');
  const [eDispo, setEDispo] = useState(true);
  const [eMsg, setEMsg] = useState('');
  const [eEnvoi, setEEnvoi] = useState(false);

  const { boutiqueId, boutiques, pret } = useBoutique();
  const nomBoutique = boutiques.find(b => b.id === boutiqueId)?.nom ?? 'Ma boutique';

  const charger = async () => {
    setRefreshing(true);
    try {
      const r = await fetchDashboard(avecBoutique('/api/dashboard/produits', boutiqueId));
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setProds(d.produits || []);
      setMaj(new Date().toLocaleTimeString('fr-FR'));
    } catch (e) {
      console.error('Chargement des produits :', e);
    } finally { setRefreshing(false); }
  };
  useEffect(() => { if (pret) charger(); }, [pret, boutiqueId]);

  const ajouter = async () => {
    if (!fNom || !fPrix) { setMsg('Nom et prix sont obligatoires.'); return; }
    setEnvoi(true); setMsg('');
    try {
      let image = fUrl.trim();
      if (fFile) {
        // La photo passe par le serveur, qui la redresse, la recadre et
        // l'allege avant de la ranger. Elle partait auparavant du navigateur
        // droit au Storage : le fichier brut du telephone, plusieurs
        // megaoctets, atterrissait tel quel sur la vitrine.
        const formulaire = new FormData();
        formulaire.append('fichier', fFile);
        formulaire.append('boutique_id', boutiqueId);

        const rep = await fetchDashboard('/api/dashboard/produits/photo', {
          method: 'POST',
          body: formulaire,
        });
        const d = await rep.json();
        if (!rep.ok) throw new Error(d?.error || `Envoi de la photo échoué (${rep.status})`);

        image = d.url;
        if (d.octetsAvant && d.octets) {
          const ko = (n: number) => `${Math.round(n / 1024)} Ko`;
          setMsg(`Photo retravaillée : ${ko(d.octetsAvant)} → ${ko(d.octets)}.`);
        }
      }
      /** Une photo part au serveur, qui la redresse et l'allege, et rend son URL. */
      const televerser = async (fichier: File) => {
        const formulaire = new FormData();
        formulaire.append('fichier', fichier);
        formulaire.append('boutique_id', boutiqueId);
        const rep = await fetchDashboard('/api/dashboard/produits/photo', {
          method: 'POST', body: formulaire,
        });
        const d = await rep.json();
        if (!rep.ok) throw new Error(d?.error || `Envoi de la photo échoué (${rep.status})`);
        return String(d.url || '');
      };

      const creer = async (corps: Record<string, unknown>) => {
        const res = await fetchDashboard(avecBoutique('/api/dashboard/produits', boutiqueId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        });
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || 'Erreur serveur');
      };

      const commun = {
        categorie: fCat, prix: Number(fPrix) || 0,
        description: fDesc, disponible: fDispo,
        seuil_alerte: fSeuil === '' ? null : Number(fSeuil),
        // La caracteristique est COMMUNE aux coloris : le meme modele existe
        // dans les memes pointures quelle que soit sa couleur. Si ce n'est pas
        // le cas chez un marchand, il saisit deux articles — c'est deja ce
        // qu'il fait quand deux coloris n'ont pas le meme prix.
        attribut_nom: fAttrNom.trim(),
        attribut_valeurs: fAttrValeurs,
      };

      // Les coloris renseignes, ceux dont la couleur est nommee. Une ligne
      // laissee vide est une ligne que le marchand a ouverte puis abandonnee :
      // la creer produirait un article fantome sans nom de couleur.
      const declinaisons = fColoris.filter(c => c.couleur.trim());

      if (declinaisons.length === 0) {
        await creer({
          ...commun, nom: fNom, image,
          stock: fStock === '' ? null : Number(fStock),
        });
      } else {
        // UN PRODUIT PAR COLORIS, relies par le nom de l'article. Chacun garde
        // son stock et sa photo — c'est ce qui permet a la vitrine de refuser
        // le rouge sans toucher au bleu.
        //
        // En serie et non en parallele : le serveur redimensionne chaque photo,
        // et lancer quatre traitements d'image a la fois sur une connexion
        // d'Abidjan echoue plus souvent qu'il n'accelere.
        for (const c of declinaisons) {
          const photo = c.fichier ? await televerser(c.fichier) : image;
          await creer({
            ...commun,
            nom: `${fNom} ${c.couleur.trim()}`.trim(),
            groupe: fNom,
            couleur: c.couleur.trim(),
            image: photo,
            stock: c.stock === '' ? null : Number(c.stock),
          });
        }
      }
      setOuvert(false);
      setFNom(''); setFCat(''); setFPrix(''); setFDesc(''); setFUrl('');
      setFFile(null); setFDispo(true); setFStock(''); setFSeuil('5');
      setFColoris([]); setFAttrNom(''); setFAttrValeurs('');
      await charger();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally { setEnvoi(false); }
  };

  const ouvrirFiche = (p: Prod) => {
    setFiche(p);
    setGNom(p.nom);
    setGCat(p.categorie);
    setGPrix(String(p.prix ?? ''));
    setGDesc(p.description ?? '');
    setGFile(null);
    setGAttrNom(p.attribut_nom ?? '');
    setGAttrValeurs((p.attribut_valeurs ?? []).join(', '));
    setGMsg('');
  };

  /**
   * Mettre un article dans la selection du jour, ou l'en retirer.
   *
   * ON MET A JOUR L'ECRAN D'ABORD. Composer une carte, c'est basculer dix
   * articles a la suite : attendre le serveur entre chaque clic rendrait le
   * geste penible au point qu'on ne l'utiliserait pas. En cas d'echec on
   * REVIENT EN ARRIERE et on le dit — un bouton qui reste allume alors que
   * rien n'est enregistre est pire que pas de bouton du tout, parce que le
   * marchand croit sa carte composee.
   */
  const basculerDuJour = async (p: Prod) => {
    const voulu = !p.menu_du_jour;
    setMsgJour('');
    setProds(liste => liste.map(x => (x.id === p.id ? { ...x, menu_du_jour: voulu } : x)));
    try {
      const res = await fetchDashboard(avecBoutique('/api/dashboard/produits', boutiqueId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: p.id, menu_du_jour: voulu }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d?.error || `HTTP ${res.status}`);
    } catch (e) {
      setProds(liste => liste.map(x => (x.id === p.id ? { ...x, menu_du_jour: !voulu } : x)));
      setMsgJour(
        `« ${p.nom} » n’a pas pu être ${voulu ? 'ajouté à' : 'retiré de'} la carte du jour. ${
          e instanceof Error ? e.message : ''
        }`.trim(),
      );
    }
  };

  /** Vider la selection : l'assistante repropose alors tout le catalogue. */
  const viderSelection = async () => {
    const retenus = prods.filter(p => p.menu_du_jour);
    for (const p of retenus) await basculerDuJour(p);
  };

  const sauvegarderFiche = async () => {
    if (!fiche) return;
    if (!gNom.trim()) { setGMsg('Le nom ne peut pas être vide.'); return; }
    setGEnvoi(true); setGMsg('');
    try {
      // La photo suit le meme chemin qu'a la creation : le serveur la redresse,
      // la recadre et l'allege. On ne l'envoie que si le marchand en a choisi
      // une nouvelle — sinon `image` reste absent et l'ancienne est conservee.
      let image: string | undefined;
      if (gFile) {
        const formulaire = new FormData();
        formulaire.append('fichier', gFile);
        formulaire.append('boutique_id', boutiqueId);
        const rep = await fetchDashboard('/api/dashboard/produits/photo', {
          method: 'POST',
          body: formulaire,
        });
        const d = await rep.json();
        if (!rep.ok) throw new Error(d?.error || `Envoi de la photo échoué (${rep.status})`);
        image = d.url;
      }

      const res = await fetchDashboard(avecBoutique('/api/dashboard/produits', boutiqueId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: fiche.id,
          nom: gNom.trim(),
          categorie: gCat,
          prix: Number(gPrix) || 0,
          description: gDesc,
          attribut_nom: gAttrNom.trim(),
          attribut_valeurs: gAttrValeurs,
          ...(image ? { image } : {}),
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d?.error || `HTTP ${res.status}`);
      setFiche(null);
      await charger();
    } catch (e) {
      setGMsg(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally { setGEnvoi(false); }
  };

  const ouvrirStock = (p: Prod) => {
    setEditProd(p);
    setEStock(p.stock === null ? '' : String(p.stock));
    setESeuil(p.seuil_alerte === null ? '' : String(p.seuil_alerte));
    setEDispo(p.disponible);
    setEMsg('');
  };

  const sauvegarderStock = async () => {
    if (!editProd) return;
    setEEnvoi(true); setEMsg('');
    try {
      const res = await fetchDashboard(avecBoutique('/api/dashboard/produits', boutiqueId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: editProd.id,
          stock: eStock === '' ? null : Number(eStock),
          seuil_alerte: eSeuil === '' ? null : Number(eSeuil),
          disponible: eDispo,
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || 'Erreur serveur');
      setEditProd(null);
      await charger();
    } catch (e) {
      setEMsg(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally { setEEnvoi(false); }
  };

  // Analyse des stocks pour les badges et alertes
  const statutStock = (p: Prod) => {
    if (p.stock === null) return { type: 'na', label: 'Sans suivi', color: 'bg-chaux-100 text-chaux-600' };
    if (p.stock === 0) return { type: 'rupture', label: 'Rupture', color: 'bg-bissap-100 text-bissap-700' };
    if (p.seuil_alerte !== null && p.stock <= p.seuil_alerte) return { type: 'bas', label: `Bas · ${p.stock}`, color: 'bg-mangue-100 text-mangue-700' };
    return { type: 'ok', label: `Stock · ${p.stock}`, color: 'bg-accent-100 text-accent-700' };
  };

  const alertes = prods.filter(p => p.stock !== null && ((p.seuil_alerte !== null && p.stock <= p.seuil_alerte) || p.stock === 0));

  /**
   * LA SELECTION DU JOUR EST UN INTERRUPTEUR A UN SEUL CRAN, et c'est le
   * piege qu'il faut nommer a l'ecran.
   *
   * Tant qu'AUCUN article n'est retenu, l'assistante propose tout le catalogue
   * disponible. Des qu'UN SEUL l'est, elle ne propose plus que celui-la : le
   * reste de la boutique disparait de sa carte, sans que rien n'ait ete
   * supprime. Un marchand qui coche un plat par curiosite ferme donc sa
   * boutique aux yeux du bot, et ne le decouvre que par un client qui ne
   * trouve plus rien.
   *
   * Cette regle vient du 19 aout : filtrer sur la selection rendait une carte
   * VIDE aux boutiques de vetements et aux pharmacies, qui n'ont pas de
   * selection quotidienne. Le repli « rien de coche = tout le catalogue » les
   * a rendues vendeuses sans reglage — mais il rend l'interrupteur d'autant
   * plus brutal pour celui qui s'en sert.
   */
  const duJour = prods.filter(p => p.menu_du_jour);
  const duJourDisponibles = duJour.filter(p => p.disponible);

  const cats = ['toutes', ...Array.from(new Set(prods.map(p => p.categorie).filter(Boolean)))];
  const filtrés = cat === 'toutes' ? prods : prods.filter(p => p.categorie === cat);

  return (
    <div className="min-h-screen bg-[var(--background)] p-4 lg:p-6">
      <div className="mx-auto max-w-[1600px]">
        <main id="contenu" className="min-w-0 space-y-6">
          <header className="indigo-weave relative overflow-hidden bg-nuit-900 p-6 text-chaux-50 soft-shadow">
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-mangue-100">Menu réel · feuille Google</p>
                <h1 className="mt-2 font-display text-3xl font-black">Produits · {nomBoutique}</h1>
                <p className="mt-1 text-xs text-mangue-100">
                  {prods.length} produits · {prods.filter(p => p.disponible).length} disponibles · à jour à {maj}
                </p>
              </div>
              <div className="flex gap-2">
                <Bouton variante="contraste" onClick={() => setOuvert(true)}>
                  <Plus className="h-4 w-4" /> Ajouter un produit
                </Bouton>
                <Bouton variante="voile" onClick={charger} disabled={refreshing}>
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Actualiser
                </Bouton>
              </div>
            </div>
          </header>

          {alertes.length > 0 && (
            <div className="flex items-start gap-3 border border-mangue-300 bg-mangue-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-mangue-700" />
              <div className="flex-1">
                <p className="font-bold text-mangue-700">
                  <AlertTriangle className="inline h-4 w-4" aria-hidden /> {alertes.length} produit
            {alertes.length > 1 ? 's' : ''} sous le seuil d’alerte
                </p>
                <p className="mt-1 text-sm text-mangue-700">
                  {alertes.slice(0, 3).map(p => p.nom).join(', ')}
                  {alertes.length > 3 && ` et ${alertes.length - 3} autre${alertes.length - 3 > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
          )}

          {/* LA CARTE DU JOUR, ET CE QU'ELLE FAIT VRAIMENT.
              Ce bandeau ne decore pas : il dit l'effet de bord que le bouton
              ne peut pas montrer. Coche, la selection MASQUE tout le reste aux
              yeux de l'assistante ; vide, tout le catalogue est propose. Sans
              cette phrase, un marchand qui coche un plat ferme sa boutique au
              bot sans le savoir. */}
          {prods.length > 0 && (
            <div
              className={`flex flex-wrap items-start justify-between gap-4 border p-4 ${
                duJour.length > 0
                  ? 'border-accent-300 bg-accent-50'
                  : 'border-[var(--hairline)] bg-chaux-50'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className={`font-bold ${duJour.length > 0 ? 'text-accent-700' : 'text-nuit-800'}`}>
                  {duJour.length > 0
                    ? `Carte du jour · ${duJour.length} article${duJour.length > 1 ? 's' : ''}`
                    : 'Aucune carte du jour'}
                </p>
                <p className="mt-1 text-sm text-nuit-700">
                  {duJour.length > 0 ? (
                    <>
                      L’assistante ne proposera <strong>que ces articles</strong> à vos clients.
                      Le reste de votre catalogue reste en ligne sur votre vitrine, mais elle
                      ne le citera pas.
                      {duJourDisponibles.length === 0 && (
                        <>
                          {' '}
                          <strong className="text-bissap-700">
                            Aucun n’est disponible : l’assistante n’aura rien à proposer.
                          </strong>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      L’assistante propose tout votre catalogue disponible. Choisissez des
                      articles ci-dessous pour composer une carte du jour — elle ne citera
                      alors plus qu’eux.
                    </>
                  )}
                </p>
                {msgJour && <p className="mt-2 text-sm font-semibold text-bissap-700">{msgJour}</p>}
              </div>
              {duJour.length > 0 && (
                <Bouton variante="voile" onClick={viderSelection}>
                  Tout remettre au catalogue
                </Bouton>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {cats.map(c => (
              <button key={c} onClick={() => setCat(c)}
                className={` px-4 py-2 text-sm font-semibold capitalize transition ${
                  cat === c ? 'bg-nuit-900 text-chaux-50' : 'bg-chaux-100 text-nuit-700 hover:bg-chaux-200'
                }`}>
                {c}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtrés.map(p => {
              const st = statutStock(p);
              return (
                <div key={p.id || p.nom} className={`overflow-hidden border bg-white soft-shadow ${p.disponible ? 'border-[var(--hairline)]' : 'border-bissap-200 opacity-70'}`}>
                  {p.image ? (
                    <img src={p.image} alt={p.nom} className="h-40 w-full object-cover" />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center bg-mangue-100">
                      <UtensilsCrossed className="h-10 w-10 text-mangue-400" />
                    </div>
                  )}
                  <div className="space-y-2 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-bold text-nuit-900">{p.nom}</h2>
                      <span className={`shrink-0 px-2.5 py-1 text-xs font-semibold ${p.disponible ? 'bg-accent-100 text-accent-700' : 'bg-bissap-100 text-bissap-700'}`}>
                        {p.disponible ? 'Disponible' : 'Épuisé'}
                      </span>
                    </div>
                    <p className="text-xs text-chaux-600">{p.description}</p>

                    {/* La caracteristique, telle que le marchand l'a nommee.
                        Elle ne s'affiche que si elle existe : un plat n'a pas
                        de pointure, et lui en inventer une serait pire que de
                        n'en montrer aucune. */}
                    {p.attribut_valeurs.length > 0 && (
                      <p className="text-xs text-nuit-700">
                        <span className="font-semibold">{p.attribut_nom}</span>{' '}
                        <span className="text-chaux-600">{p.attribut_valeurs.join(' · ')}</span>
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className=" bg-mangue-100 px-2.5 py-1 text-xs font-semibold text-mangue-700">{p.categorie}</span>
                      <p className="font-black text-mangue-700">{p.prix.toLocaleString('fr-FR')} F</p>
                    </div>

                    {/* METTRE A LA CARTE DU JOUR, EN UN CLIC.
                        La colonne existait depuis longtemps et l'assistante la
                        respectait deja — mais aucun ecran ne permettait de la
                        remplir. Le travail etait fait partout sauf a l'endroit
                        ou quelqu'un devait s'en servir.

                        Le bouton dit son ETAT, pas son action : « Au menu du
                        jour » allume signifie que l'article y est. Un bouton
                        qui annonce l'action inverse de ce qu'on voit se lit de
                        travers une fois sur deux. */}
                    <button
                      onClick={() => basculerDuJour(p)}
                      aria-pressed={p.menu_du_jour}
                      className={`flex min-h-11 w-full items-center justify-center gap-2 px-3 text-sm font-semibold transition ${
                        p.menu_du_jour
                          ? 'bg-accent-600 text-white hover:bg-accent-700'
                          : 'bg-chaux-100 text-nuit-700 hover:bg-chaux-200'
                      }`}
                    >
                      <UtensilsCrossed className="h-4 w-4" aria-hidden />
                      {p.menu_du_jour ? 'Au menu du jour' : 'Mettre au menu du jour'}
                    </button>
                    <div className="flex items-center justify-between gap-2 border-t pt-2">
                      <span className={` px-2.5 py-1 text-xs font-semibold ${st.color}`}>
                        {st.label}
                      </span>
                      <div className="flex items-center gap-2">
                        {/* Le marchand pouvait creer un produit et regler son
                            stock, jamais corriger son nom, son prix ni sa
                            photo. Une faute de frappe etait definitive — et
                            elle ne fait pas que deparer : les rapports
                            rattachent prix et photo au produit PAR SON NOM. */}
                        <button
                          onClick={() => ouvrirFiche(p)}
                          className=" flex min-h-11 items-center justify-center bg-nuit-50 px-3 text-sm font-semibold text-nuit-700 transition hover:bg-nuit-100"
                        >
                          <Pencil className="mr-1 inline h-3 w-3" />
                          Modifier
                        </button>
                        <button
                          onClick={() => ouvrirStock(p)}
                          className=" flex min-h-11 items-center justify-center bg-chaux-100 px-3 text-sm font-semibold text-nuit-700 transition hover:bg-chaux-200"
                        >
                          Stock
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filtrés.length === 0 && (
            <div className=" border border-dashed bg-white p-10 text-center text-chaux-600">
              Aucun produit dans cette catégorie.
            </div>
          )}
        </main>
      </div>

      {/* Modal d'ajout */}
      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto bg-white p-6 soft-shadow">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-nuit-900">Nouveau produit</h2>
              <button onClick={() => setOuvert(false)} className=" p-2 hover:bg-chaux-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input className=" border p-2" placeholder="Nom de l’article *" value={fNom} onChange={e => setFNom(e.target.value)} />
              <input className=" border p-2" placeholder="Catégorie (ex : Burger)" value={fCat} onChange={e => setFCat(e.target.value)} />
              <input className=" border p-2" placeholder="Prix (FCFA) *" type="number" value={fPrix} onChange={e => setFPrix(e.target.value)} />
              <input className=" border p-2" placeholder="Description" value={fDesc} onChange={e => setFDesc(e.target.value)} />
            </div>

            {/* LA CARACTERISTIQUE, NOMMEE PAR LE MARCHAND.
                Un client qui regarde une paire de chaussures veut savoir si
                elle existe a sa pointure. Il devait ecrire pour le demander,
                et le marchand repondre a la main — a chaque client, pour
                chaque article.

                LE NOM EST UN CHAMP, PAS UNE LISTE FIGEE. L'exemple contient
                deja deux mots pour la meme idee : on dit POINTURE pour une
                chaussure et TAILLE pour un vetement. Figer le mot forcerait le
                vendeur de chaussures a ranger sa pointure sous un terme qui
                n'est pas le sien, et la pharmacie sa contenance sous
                « taille ». Cette plateforme sert des metiers qu'on ne connait
                pas d'avance. */}
            <div className="border border-chaux-200 bg-chaux-50 p-3">
              <p className="font-semibold text-nuit-900">
                Cet article se décline en tailles, pointures… ?
              </p>
              <p className="mt-0.5 text-sm text-chaux-600">
                Facultatif. Vos clients le verront sur la vitrine, et l’assistante
                pourra le dire sans que vous ayez à répondre.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr]">
                <input
                  className="border p-2"
                  placeholder="Pointure"
                  value={fAttrNom}
                  onChange={e => setFAttrNom(e.target.value)}
                  aria-label="Nom de la caractéristique, par exemple Pointure ou Taille"
                />
                <input
                  className="border p-2"
                  placeholder="38, 39, 40, 41"
                  value={fAttrValeurs}
                  onChange={e => setFAttrValeurs(e.target.value)}
                  aria-label="Valeurs disponibles, séparées par des virgules"
                />
              </div>
            </div>

            {/* LES COLORIS, SAISIS EN UNE SEULE FOIS.
                Le marchand rouvrait le formulaire pour chaque couleur, en
                retapant le nom, la categorie, le prix et la description a
                l'identique — quatre fois pour quatre coloris, avec quatre
                occasions de se tromper d'un caractere et de casser le
                regroupement.

                Ce qui est COMMUN reste au-dessus ; ce qui DIFFERE se repete
                ici. Le bloc reste ferme tant qu'on ne l'ouvre pas : la plupart
                des marchands n'en auront jamais besoin. */}
            <div className="border border-chaux-200 bg-chaux-50 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-semibold text-nuit-900">
                    Cet article existe en plusieurs coloris ?
                  </p>
                  <p className="mt-0.5 text-sm text-chaux-600">
                    Facultatif. Chaque coloris garde son propre stock et sa
                    propre photo, sur une seule carte en vitrine.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFColoris(c => [...c, { couleur: '', stock: '', fichier: null }])}
                  className="border border-nuit-900 px-3 py-1.5 text-sm font-semibold text-nuit-900 transition hover:bg-nuit-900 hover:text-white"
                >
                  + Ajouter un coloris
                </button>
              </div>

              {fColoris.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {fColoris.map((c, i) => (
                    <div key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_7rem_auto_auto]">
                      <input
                        className="border p-2"
                        placeholder={`Coloris ${i + 1} (ex : bleu)`}
                        value={c.couleur}
                        onChange={e => setFColoris(l =>
                          l.map((x, j) => (j === i ? { ...x, couleur: e.target.value } : x)))}
                        aria-label={`Nom du coloris ${i + 1}`}
                      />
                      <input
                        className="border p-2"
                        type="number"
                        min="0"
                        placeholder="Stock"
                        value={c.stock}
                        onChange={e => setFColoris(l =>
                          l.map((x, j) => (j === i ? { ...x, stock: e.target.value } : x)))}
                        aria-label={`Stock du coloris ${i + 1}`}
                      />
                      {/* Une photo PAR coloris : c'est elle que le client
                          regarde pour choisir, bien avant le nom de la
                          couleur. Sans elle, la vignette montre la meme image
                          trois fois. */}
                      <label className="cursor-pointer border border-dashed border-chaux-300 px-3 py-2 text-sm text-chaux-600 hover:border-nuit-400">
                        {c.fichier ? '✓ photo choisie' : '📸 Photo'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => setFColoris(l =>
                            l.map((x, j) => (j === i ? { ...x, fichier: e.target.files?.[0] ?? null } : x)))}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setFColoris(l => l.filter((_, j) => j !== i))}
                        aria-label={`Retirer le coloris ${i + 1}`}
                        className="px-2 py-2 text-chaux-500 transition hover:text-bissap-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  <p className="mt-1 text-sm text-chaux-600">
                    Le nom de l’article et le prix ci-dessus valent pour tous les
                    coloris. Le stock saisi plus bas est ignoré : chaque coloris
                    a le sien.
                  </p>
                </div>
              )}
            </div>

            <div className="grid gap-3 border border-mangue-200 bg-mangue-50 p-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-mangue-700">Stock actuel</label>
                <input type="number" min="0" placeholder="ex : 12 (laisser vide = sans suivi)" value={fStock} onChange={e => setFStock(e.target.value)} className="w-full border border-mangue-300 bg-white p-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-mangue-700">Alerte à</label>
                <input type="number" min="0" placeholder="ex : 5" value={fSeuil} onChange={e => setFSeuil(e.target.value)} className="w-full border border-mangue-300 bg-white p-2 text-sm" />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-chaux-600">Photo de l’article</label>
              <input type="file" accept="image/*" onChange={e => setFFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-chaux-600 file:mr-3 file: file:border-0 file:bg-mangue-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-mangue-700 hover:file:bg-mangue-200" />
              <p className="mt-2 text-xs text-chaux-600">…ou colle un lien image :</p>
              <input className="mt-1 w-full border p-2" placeholder="https://…/photo.jpg" value={fUrl} onChange={e => setFUrl(e.target.value)} />
              {(fFile || fUrl) && (
                <img src={fFile ? URL.createObjectURL(fFile) : fUrl} alt="aperçu" className="mt-2 h-28 w-full object-cover" />
              )}
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold text-nuit-700">
              <input type="checkbox" checked={fDispo} onChange={e => setFDispo(e.target.checked)} className="h-4 w-4 accent-accent-600" />
              Disponible à la vente
            </label>

            {msg && <p className=" bg-bissap-50 p-3 text-sm text-bissap-700">{msg}</p>}

            <Bouton onClick={ajouter} chargement={envoi} className="w-full">
              {!envoi && <Plus className="h-5 w-5" />}
              {envoi ? 'Ajout en cours…' : 'Ajouter au menu'}
            </Bouton>
          </div>
        </div>
      )}

      {/* Modal de gestion de stock */}
      {fiche && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto bg-white p-6 soft-shadow">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-nuit-900">Modifier la fiche</h2>
                <p className="text-sm text-chaux-600">{fiche.nom}</p>
              </div>
              <button onClick={() => setFiche(null)} className=" p-2 hover:bg-chaux-100"><X className="h-5 w-5" /></button>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-nuit-700">Nom du produit</label>
              <input value={gNom} onChange={x => setGNom(x.target.value)} className="w-full border p-2" />
              {/* Le nom est la cle qui relie les ventes au catalogue : il vaut
                  la peine d'avertir avant qu'un renommage ne scinde un
                  historique. */}
              {gNom.trim() !== fiche.nom && (
                <p className="mt-1 text-xs text-mangue-700">
                  Renommer un produit sépare ses ventes passées des nouvelles dans les rapports.
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-nuit-700">Catégorie</label>
                <input value={gCat} onChange={x => setGCat(x.target.value)} className="w-full border p-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-nuit-700">Prix (FCFA)</label>
                <input type="number" min="0" value={gPrix} onChange={x => setGPrix(x.target.value)} className="w-full border p-2" />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-nuit-700">Description</label>
              <textarea rows={2} value={gDesc} onChange={x => setGDesc(x.target.value)} className="w-full border p-2" />
            </div>

            {/* La caracteristique se corrige comme le reste de la fiche : les
                pointures disponibles changent en cours de saison, et un
                marchand qui ne peut pas les mettre a jour cesse vite d'y
                croire. Vider les deux champs la retire. */}
            <div>
              <label className="mb-1 block text-sm font-semibold text-nuit-700">
                Tailles, pointures…
              </label>
              <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                <input
                  value={gAttrNom}
                  onChange={x => setGAttrNom(x.target.value)}
                  placeholder="Pointure"
                  className="border p-2"
                  aria-label="Nom de la caractéristique"
                />
                <input
                  value={gAttrValeurs}
                  onChange={x => setGAttrValeurs(x.target.value)}
                  placeholder="38, 39, 40, 41"
                  className="border p-2"
                  aria-label="Valeurs disponibles, séparées par des virgules"
                />
              </div>
              <p className="mt-1 text-xs text-chaux-600">
                Videz les deux champs pour retirer cette information.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-nuit-700">Remplacer la photo</label>
              <input type="file" accept="image/*" onChange={x => setGFile(x.target.files?.[0] ?? null)} className="w-full border p-2 text-sm" />
              <p className="mt-1 text-xs text-chaux-600">Laissez vide pour garder la photo actuelle.</p>
            </div>

            {gMsg && <p className="text-sm text-nuit-700">{gMsg}</p>}

            <div className="flex gap-2 pt-1">
              <Bouton variante="calme" onClick={() => setFiche(null)} className="flex-1">Annuler</Bouton>
              <Bouton onClick={sauvegarderFiche} chargement={gEnvoi} className="flex-1">Enregistrer</Bouton>
            </div>
          </div>
        </div>
      )}

      {editProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto bg-white p-6 soft-shadow">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-nuit-900">Gérer le stock</h2>
                <p className="text-sm text-chaux-600">{editProd.nom}</p>
              </div>
              <button onClick={() => setEditProd(null)} className=" p-2 hover:bg-chaux-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-nuit-700">Stock actuel</label>
                <input type="number" min="0" placeholder="ex : 12" value={eStock} onChange={x => setEStock(x.target.value)} className="w-full border p-2" />
                <p className="mt-1 text-xs text-chaux-600">Vide = pas de suivi</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-nuit-700">Seuil d’alerte</label>
                <input type="number" min="0" placeholder="ex : 5" value={eSeuil} onChange={x => setESeuil(x.target.value)} className="w-full border p-2" />
                <p className="mt-1 text-xs text-chaux-600">Alerte quand stock ≤ ce nombre</p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold text-nuit-700">
              <input type="checkbox" checked={eDispo} onChange={x => setEDispo(x.target.checked)} className="h-4 w-4 accent-accent-600" />
              Disponible à la vente
            </label>

            {eMsg && <p className=" bg-bissap-50 p-3 text-sm text-bissap-700">{eMsg}</p>}

            <div className="flex gap-2">
              <Bouton variante="calme" onClick={() => setEditProd(null)} className="flex-1">Annuler</Bouton>
              <Bouton onClick={sauvegarderStock} chargement={eEnvoi} className="flex-1">
                {eEnvoi ? 'Sauvegarde…' : 'Sauvegarder'}
              </Bouton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}