'use client';

import { useCallback, useEffect, useState } from 'react';
import { LienRetour, classesBouton } from '@/components/ui/Bouton';
import { TuileStat } from '@/components/ui/Etat';
import { supabase, utilisateurCourant } from '@/lib/supabase';
import { fetchDashboard } from '@/lib/apiClient';
import { useBoutique, uuidBoutiqueCourante } from '@/lib/boutique';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Truck,
  User,
  Phone,
  Mail,
  TrendingUp,
  Plus,
  Search,
  MoreVertical,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Bike,
  Car,
  Navigation,
  Link2,
  Copy,
  Check,
  type LucideIcon,
  X
} from 'lucide-react';
import Link from 'next/link';
import { VALEURS_LIVREE } from '@/lib/livraison';
import EcranDeChargement from '@/components/dashboard/EcranDeChargement';

const TYPE_CONFIG = {
  interne: { label: 'Interne', color: 'bg-nuit-100 text-nuit-700 border-nuit-200' },
  independant: { label: 'Indépendant', color: 'bg-chaux-100 text-chaux-600 border-chaux-200' },
};

const STATUT_CONFIG = {
  disponible: { label: 'Disponible', color: 'bg-accent-100 text-accent-700', icon: CheckCircle },
  en_livraison: { label: 'En livraison', color: 'bg-mangue-100 text-mangue-700', icon: Clock },
  indisponible: { label: 'Indisponible', color: 'bg-chaux-100 text-nuit-700', icon: XCircle },
};

const VEHICULE_ICONS = {
  moto: Bike,
  voiture: Car,
  velo: Bike,
};

type Livreur = {
  id: string;
  nom: string;
  telephone: string;
  email?: string;
  type: 'interne' | 'independant';
  statut: 'disponible' | 'en_livraison' | 'indisponible';
  vehicule_type?: string;
  vehicule_immatriculation?: string;
  latitude?: number;
  longitude?: number;
  /**
   * Compte Telegram du livreur, pose automatiquement quand il ouvre son lien
   * d'invitation. Jamais saisi a la main : Telegram n'identifie ses
   * utilisateurs que par ce numero interne, revele au moment du premier clic.
   */
  telegram_id?: string | null;
};

/**
 * Ce qu'on sait des courses d'un livreur — CALCULE, jamais stocke.
 *
 * `livreurs` portait `total_livraisons`, `gain_total` et `note_moyenne`.
 * Personne ne les ecrivait : mesure le 23 aout 2026, le seul livreur de la
 * plateforme y lisait « 0 Livraisons — 0F — ★ 0.0 » alors qu'il en avait fait
 * quinze. Un chiffre faux affiche avec assurance, pas une fonctionnalite
 * manquante.
 *
 * Ces trois colonnes ont ete supprimees. Le compte et les gains se lisent
 * desormais dans `commandes`, la source de verite : une somme ne peut pas
 * deriver d'elle-meme. La note, elle, n'est pas remplacee — voir la migration
 * `livreurs_note_moyenne_morte`.
 */
type Courses = {
  livraisons: number;
  /** Somme des frais de livraison encaisses par ce livreur. */
  gains: number;
};

/**
 * Le total qu'AUCUNE fiche ne revendique.
 *
 * Une livraison sans `livreur_id` veut dire « on ne sait pas qui l'a faite » —
 * un livreur du groupe Telegram qui n'a jamais ouvert son lien d'invitation, ou
 * une course anterieure a l'attribution. La taire ferait croire au marchand que
 * la somme des fiches est le total de ses livraisons ; l'annoncer lui dit
 * exactement ce qui lui echappe, et pourquoi.
 */
type Orphelines = { livraisons: number };

/** Ce que l'ecran sait du lien d'invitation d'un livreur, le temps de la visite. */
type Invitation = {
  chargement?: boolean;
  lien?: string;
  /**
   * Le code nu, pour composer « /start <code> » a la main.
   *
   * Necessaire des que le livreur a DEJA une conversation avec le bot :
   * Telegram n'affiche alors plus de bouton DEMARRER, et ouvrir le lien ne
   * transmet rien. Sans cette porte de secours, le rattachement est impossible
   * — constate le 17 aout par le gerant sur son propre compte.
   */
  code?: string;
  erreur?: string;
};

export default function LivreursPage() {
  const router = useRouter();
  const { boutiqueId } = useBoutique();
  const [loading, setLoading] = useState(true);
  const [livreurs, setLivreurs] = useState<Livreur[]>([]);
  const [filter, setFilter] = useState<'tous' | 'interne' | 'independant'>('tous');
  const [statutFilter] = useState<'tous' | 'disponible' | 'en_livraison' | 'indisponible'>('tous');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [invitations, setInvitations] = useState<Record<string, Invitation>>({});
  const [courses, setCourses] = useState<Record<string, Courses>>({});
  const [orphelines, setOrphelines] = useState<Orphelines>({ livraisons: 0 });
  /**
   * La lecture des courses a-t-elle abouti ?
   *
   * Sans ce drapeau, un livreur sans aucune course et une lecture en echec se
   * ressemblent : les deux rendent une entree absente. Le premier vaut « 0 »,
   * le second « on ne sait pas », et les confondre est exactement le defaut
   * qu'on vient de fermer.
   */
  const [coursesLues, setCoursesLues] = useState(false);
  const [copie, setCopie] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nom: '',
    telephone: '',
    email: '',
    type: 'interne' as 'interne' | 'independant',
    vehicule_type: 'moto',
    vehicule_immatriculation: '',
  });

  const loadLivreurs = useCallback(async () => {
    const user = await utilisateurCourant();
    if (!user) {
      router.push('/login');
      return;
    }

    const uuid = await uuidBoutiqueCourante(boutiqueId);
    if (!uuid) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('livreurs')
      .select('*')
      .eq('boutique_id', uuid)
      .order('created_at', { ascending: false });

    if (data) {
      setLivreurs(data as Livreur[]);
    }

    /**
     * Les courses se comptent DANS `commandes`, a chaque affichage.
     *
     * Pas de route serveur ici : le marchand a deja le droit de lire ses
     * propres commandes — la politique « Voir ses propres commandes » les
     * cadre sur `boutiques.user_id = auth.uid()`. Passer par une API n'aurait
     * rien protege de plus et aurait ajoute une surface a garder.
     *
     * Une lecture qui echoue laisse les compteurs vides plutot que de les
     * mettre a zero : l'ecran affiche alors « — », pas « 0 ». C'est toute la
     * difference entre « aucune course » et « on ne sait pas ».
     */
    const { data: livrees, error: errCourses } = await supabase
      .from('commandes')
      .select('livreur_id, frais_livraison')
      .eq('boutique_id', uuid)
      .in('statut_livraison', [...VALEURS_LIVREE]);

    if (errCourses) {
      console.error('Livreurs — courses illisibles :', errCourses.message);
      setCoursesLues(false);
    } else {
      const parLivreur: Record<string, Courses> = {};
      let sansFiche = 0;

      for (const c of livrees ?? []) {
        const id = c.livreur_id ? String(c.livreur_id) : '';
        if (!id) {
          sansFiche += 1;
          continue;
        }
        const cumul = parLivreur[id] ?? { livraisons: 0, gains: 0 };
        cumul.livraisons += 1;
        // NULL ne veut pas dire gratuit : c'est « le livreur n'a pas annonce
        // ses frais ». On ne l'ajoute pas, et la course reste comptee.
        cumul.gains += Number(c.frais_livraison ?? 0);
        parLivreur[id] = cumul;
      }

      setCourses(parLivreur);
      setOrphelines({ livraisons: sansFiche });
      setCoursesLues(true);
    }

    setLoading(false);
  }, [router, boutiqueId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadLivreurs();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadLivreurs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const user = await utilisateurCourant();
    if (!user) return;

    const uuid = await uuidBoutiqueCourante(boutiqueId);
    if (!uuid) return;

    const { error } = await supabase
      .from('livreurs')
      .insert({
        boutique_id: uuid,
        ...formData,
      });

    if (!error) {
      setShowModal(false);
      setFormData({ nom: '', telephone: '', email: '', type: 'interne', vehicule_type: 'moto', vehicule_immatriculation: '' });
      loadLivreurs();
    }
  };

  const deleteLivreur = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce livreur ?')) return;
    
    await supabase.from('livreurs').delete().eq('id', id);
    loadLivreurs();
  };

  const toggleStatut = async (livreur: Livreur) => {
    const newStatut = livreur.statut === 'disponible' ? 'indisponible' : 'disponible';
    await supabase.from('livreurs').update({ statut: newStatut }).eq('id', livreur.id);
    loadLivreurs();
  };

  /**
   * Lien a envoyer au livreur pour qu'il rattache son compte Telegram.
   *
   * Le code est fabrique par le serveur, jamais ici : le presenter suffit a se
   * declarer livreur de cette boutique. `regenerer` sert quand le livreur change
   * de telephone — il detache le compte actuel et invalide l'ancien lien, qui a
   * pu etre transfere entre-temps.
   */
  const obtenirLien = async (livreur: Livreur, regenerer = false) => {
    setInvitations((etat) => ({ ...etat, [livreur.id]: { chargement: true } }));
    try {
      const res = await fetchDashboard('/api/dashboard/livreurs/invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ livreur_id: livreur.id, boutique: boutiqueId, regenerer }),
      });
      const rep = await res.json();

      if (!res.ok || !rep.ok) {
        setInvitations((etat) => ({
          ...etat,
          [livreur.id]: { erreur: rep.raison || rep.error || 'Lien indisponible.' },
        }));
        return;
      }

      setInvitations((etat) => ({
        ...etat,
        [livreur.id]: { lien: rep.lien, code: rep.code },
      }));
      // Un lien regenere detache le compte : la fiche affichee doit suivre,
      // sinon l'ecran continue d'annoncer un rattachement qui n'existe plus.
      if (regenerer) loadLivreurs();
    } catch (e) {
      setInvitations((etat) => ({
        ...etat,
        [livreur.id]: { erreur: e instanceof Error ? e.message : 'Lien indisponible.' },
      }));
    }
  };

  const copier = async (id: string, lien: string) => {
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(id);
      window.setTimeout(() => setCopie(null), 2000);
    } catch {
      // Le presse-papiers est refuse hors HTTPS et sur certains navigateurs.
      // Le lien reste selectionnable a la main : ne rien casser pour si peu.
    }
  };

  const filteredLivreurs = livreurs.filter(l => {
    const matchType = filter === 'tous' || l.type === filter;
    const matchStatut = statutFilter === 'tous' || l.statut === statutFilter;
    const matchSearch = search === '' || 
      l.nom.toLowerCase().includes(search.toLowerCase()) ||
      l.telephone.includes(search);
    return matchType && matchStatut && matchSearch;
  });

  const stats = {
    total: livreurs.length,
    disponibles: livreurs.filter(l => l.statut === 'disponible').length,
    en_livraison: livreurs.filter(l => l.statut === 'en_livraison').length,
    internes: livreurs.filter(l => l.type === 'interne').length,
    independants: livreurs.filter(l => l.type === 'independant').length,
  };

  if (loading) {
    return (
      <EcranDeChargement annonce="Chargement de vos livreurs…" />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] p-6 lg:p-8">
            {/* Header */}
      <div className="mb-8">
        <LienRetour href="/dashboard">Retour au tableau de bord</LienRetour>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-nuit-900">Livreurs</h1>
            <p className="text-chaux-600 mt-1">Vos livreurs internes et les indépendants qui prennent vos courses.</p>
          </div>
          
          {/* BOUTON ASSIGNATIONS - AJOUTEZ CECI */}
          <Link 
            href="/dashboard/livreurs/assignations"
            className={classesBouton('calme')}
          >
            <Navigation className="w-4 h-4" />
            Assignations
          </Link>
          
          <button
            onClick={() => setShowModal(true)}
            className={classesBouton('action')}
          >
            <Plus className="w-5 h-5" />
            Ajouter un livreur
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {/* Total et répartition sont neutres : ce sont des comptages, pas
            des états. Seuls « Disponibles » et « En livraison » en portent un. */}
        <TuileStat icone={Truck} intitule="Total livreurs" valeur={stats.total} ton="neutre" />
        <TuileStat icone={CheckCircle} intitule="Disponibles" valeur={stats.disponibles} ton="fait" />
        <TuileStat icone={Clock} intitule="En livraison" valeur={stats.en_livraison} ton="encours" />
        <TuileStat icone={User} intitule="Internes" valeur={stats.internes} ton="neutre" />
        <TuileStat icone={TrendingUp} intitule="Indépendants" valeur={stats.independants} ton="eteint" />
      </div>

      {/* CE QUI ECHAPPE AU COMPTE SE DIT, IL NE SE TAIT PAS.
          Sans cette ligne, un marchand additionnerait les courses de ses fiches
          et croirait tenir le total de ses livraisons. Une course sans fiche
          vient d'un livreur present dans le groupe Telegram mais qui n'a jamais
          ouvert son lien d'invitation — et le geste pour y remedier est juste
          en dessous, sur sa fiche. */}
      {coursesLues && orphelines.livraisons > 0 && (
        <div className="mb-6 rounded-xl border border-mangue-300 bg-mangue-50 px-4 py-3">
          <p className="text-sm text-nuit-900">
            <span className="font-bold">
              {orphelines.livraisons} livraison{orphelines.livraisons > 1 ? 's' : ''}
            </span>{' '}
            {orphelines.livraisons > 1 ? 'ne sont rattachées' : "n'est rattachée"} à aucune fiche.
          </p>
          <p className="text-sm text-chaux-600 mt-1">
            Elles ont bien été faites, mais on ignore par qui : le livreur a pris la course
            depuis le groupe sans avoir ouvert son lien d’invitation. Envoyez-lui son lien
            ci-dessous, et ses prochaines courses seront comptées.
          </p>
        </div>
      )}

      {/* Filtres et recherche */}
      <div className="bg-white border border-chaux-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-chaux-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom ou téléphone..."
              className="w-full pl-10 pr-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['tous', 'interne', 'independant'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-4 py-2 text-sm font-medium transition ${
                  filter === type ? 'bg-nuit-700 text-white' : 'bg-chaux-50 text-nuit-700 hover:bg-chaux-100'
                }`}
              >
                {type === 'tous' ? 'Tous' : type === 'interne' ? 'Internes' : 'Indépendants'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Liste des livreurs */}
      {filteredLivreurs.length === 0 ? (
        <div className="text-center py-16 bg-white border border-chaux-200 border-dashed">
          <Truck className="w-16 h-16 text-chaux-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-nuit-900">Aucun livreur</h3>
          <p className="text-chaux-600 mt-1">Commencez par ajouter votre premier livreur.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLivreurs.map((livreur) => {
            const typeConfig = TYPE_CONFIG[livreur.type];
            const statutConfig = STATUT_CONFIG[livreur.statut];
            const VehiculeIcon = VEHICULE_ICONS[livreur.vehicule_type as keyof typeof VEHICULE_ICONS] || Bike;
            
            return (
              <motion.div
                key={livreur.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white soft-shadow border border-chaux-200 overflow-hidden hover:soft-shadow transition"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-nuit-700 flex items-center justify-center text-white font-bold text-lg">
                        {livreur.nom.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-nuit-900">{livreur.nom}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 text-xs font-semibold border ${typeConfig.color}`}>
                            {typeConfig.label}
                          </span>
                          <span className={`flex items-center gap-1 px-2 py-0.5 text-xs font-semibold ${statutConfig.color}`}>
                            <statutConfig.icon className="w-3 h-3" />
                            {statutConfig.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm text-chaux-600">
                      <Phone className="w-4 h-4 text-chaux-400" />
                      {livreur.telephone}
                    </div>
                    {livreur.email && (
                      <div className="flex items-center gap-2 text-sm text-chaux-600">
                        <Mail className="w-4 h-4 text-chaux-400" />
                        {livreur.email}
                      </div>
                    )}
                    {livreur.vehicule_type && (
                      <div className="flex items-center gap-2 text-sm text-chaux-600">
                        <VehiculeIcon className="w-4 h-4 text-chaux-400" />
                        {livreur.vehicule_type.charAt(0).toUpperCase() + livreur.vehicule_type.slice(1)}
                        {livreur.vehicule_immatriculation && ` • ${livreur.vehicule_immatriculation}`}
                      </div>
                    )}
                  </div>

                  {/* Deux chiffres, plus trois.
                      L'etoile a disparu : elle valait 0 pour tout le monde,
                      et « ★ 0.0 » ne se lit pas « pas encore note » mais
                      « mauvais livreur ». Voir la migration
                      `livreurs_note_moyenne_morte`. */}
                  <div className="grid grid-cols-2 gap-3 mb-4 pt-4 border-t border-chaux-200">
                    <div className="text-center">
                      <p className="font-bold text-nuit-900">
                        {coursesLues ? (courses[livreur.id]?.livraisons ?? 0) : '—'}
                      </p>
                      <p className="text-xs text-chaux-600 mt-1">Livraisons</p>
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-nuit-900">
                        {coursesLues
                          ? `${(courses[livreur.id]?.gains ?? 0).toLocaleString()}F`
                          : '—'}
                      </p>
                      <p className="text-xs text-chaux-600 mt-1">Frais encaissés</p>
                    </div>
                  </div>

                  {/* Rattachement Telegram. Sans lui, le livreur reste anonyme
                      pour la plateforme : le client apprend qu'une commande
                      part, mais pas qui la lui apporte ni comment le joindre. */}
                  <div className="mb-4 pb-4 border-b border-chaux-200">
                    {livreur.telegram_id ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-accent-700">
                          <Check className="w-3.5 h-3.5" />
                          Compte Telegram rattaché
                        </span>
                        <button
                          onClick={() => obtenirLien(livreur, true)}
                          className="text-xs text-chaux-600 hover:text-nuit-900 underline"
                        >
                          Changer de compte
                        </button>
                      </div>
                    ) : invitations[livreur.id]?.lien ? (
                      <div className="space-y-2">
                        <p className="text-xs text-chaux-600">
                          Envoyez ce lien à {livreur.nom}. Il l’ouvre une fois, et c’est réglé.
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            readOnly
                            value={invitations[livreur.id].lien}
                            onFocus={(e) => e.currentTarget.select()}
                            className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-chaux-50 border border-chaux-200 text-nuit-700"
                          />
                          <button
                            onClick={() => copier(`${livreur.id}:lien`, invitations[livreur.id].lien!)}
                            title="Copier le lien"
                            className="p-2 text-nuit-600 hover:bg-nuit-50 transition shrink-0"
                          >
                            {copie === `${livreur.id}:lien`
                              ? <Check className="w-4 h-4 text-accent-600" />
                              : <Copy className="w-4 h-4" />}
                          </button>
                        </div>

                        {/* Porte de secours. Si le livreur a deja discute avec
                            le bot, Telegram n'affiche plus de bouton DEMARRER :
                            ouvrir le lien n'envoie alors rien du tout, et le
                            rattachement devient impossible sans cette commande
                            toute prete. */}
                        {invitations[livreur.id].code && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-chaux-600 hover:text-nuit-900">
                              Le lien n’affiche pas de bouton « DÉMARRER » ?
                            </summary>
                            <p className="mt-2 text-chaux-600">
                              C’est qu’une conversation existe déjà avec le bot. Collez plutôt
                              cette commande dans la discussion :
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                readOnly
                                value={`/start ${invitations[livreur.id].code}`}
                                onFocus={(e) => e.currentTarget.select()}
                                className="flex-1 min-w-0 px-2 py-1.5 font-mono bg-chaux-50 border border-chaux-200 text-nuit-700"
                              />
                              <button
                                onClick={() => copier(`${livreur.id}:cmd`, `/start ${invitations[livreur.id].code}`)}
                                title="Copier la commande"
                                className="p-2 text-nuit-600 hover:bg-nuit-50 transition shrink-0"
                              >
                                {copie === `${livreur.id}:cmd`
                                  ? <Check className="w-4 h-4 text-accent-600" />
                                  : <Copy className="w-4 h-4" />}
                              </button>
                            </div>
                          </details>
                        )}
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => obtenirLien(livreur)}
                          disabled={invitations[livreur.id]?.chargement}
                          className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold bg-nuit-50 text-nuit-700 hover:bg-nuit-100 transition disabled:opacity-60"
                        >
                          {invitations[livreur.id]?.chargement
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Link2 className="w-4 h-4" />}
                          Lien d’invitation Telegram
                        </button>
                        {invitations[livreur.id]?.erreur && (
                          <p className="mt-2 text-xs text-bissap-600">
                            {invitations[livreur.id].erreur}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => toggleStatut(livreur)}
                      className={`flex-1 py-2 text-xs font-semibold transition ${
                        livreur.statut === 'disponible'
                          ? 'bg-mangue-50 text-mangue-700 hover:bg-mangue-100'
                          : 'bg-accent-50 text-accent-700 hover:bg-accent-100'
                      }`}
                    >
                      {livreur.statut === 'disponible' ? 'Rendre indisponible' : 'Rendre disponible'}
                    </button>
                    <button
                      onClick={() => deleteLivreur(livreur.id)}
                      className="p-2 text-bissap-600 hover:bg-bissap-50 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal Ajout Livreur */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto soft-shadow"
            >
              <div className="p-6 border-b border-chaux-200 flex justify-between items-center">
                <h2 className="text-xl font-bold text-nuit-900">Ajouter un livreur</h2>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-chaux-100">
                  <X className="w-5 h-5 text-chaux-600" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-nuit-700 mb-1">Type de livreur *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'interne' })}
                      className={`py-3 border-2 font-semibold transition ${
                        formData.type === 'interne'
                          ? 'border-nuit-500 bg-nuit-50 text-nuit-700'
                          : 'border-chaux-200 text-nuit-700 hover:border-chaux-300'
                      }`}
                    >
                      Interne
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'independant' })}
                      className={`py-3 border-2 font-semibold transition ${
                        formData.type === 'independant'
                          ? 'border-nuit-500 bg-nuit-50 text-nuit-700'
                          : 'border-chaux-200 text-nuit-700 hover:border-chaux-300'
                      }`}
                    >
                      Indépendant
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-nuit-700 mb-1">Nom complet *</label>
                  <input
                    type="text"
                    required
                    value={formData.nom}
                    onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                    className="w-full px-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200"
                    placeholder="Ex: Kouamé Jean"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-nuit-700 mb-1">Téléphone *</label>
                  <input
                    type="tel"
                    required
                    value={formData.telephone}
                    onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                    className="w-full px-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200"
                    placeholder="Ex: 0709123456"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-nuit-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200"
                    placeholder="Ex: jean@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-nuit-700 mb-1">Type de véhicule *</label>
                  <select
                    value={formData.vehicule_type}
                    onChange={(e) => setFormData({ ...formData, vehicule_type: e.target.value })}
                    className="w-full px-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200"
                  >
                    <option value="moto">Moto</option>
                    <option value="voiture">Voiture</option>
                    <option value="velo">Vélo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-nuit-700 mb-1">Immatriculation</label>
                  <input
                    type="text"
                    value={formData.vehicule_immatriculation}
                    onChange={(e) => setFormData({ ...formData, vehicule_immatriculation: e.target.value })}
                    className="w-full px-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200"
                    placeholder="Ex: AB-123-CD"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-3 border border-chaux-200 text-nuit-700 font-medium hover:bg-chaux-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className={`${classesBouton('action')} flex-1`}
                  >
                    Ajouter
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

