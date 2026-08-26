'use client';

import { useEffect, useState } from 'react';
import {
  lireHoraires,
  NOMS_JOURS,
  SEMAINE,
  type Creneau,
  type Horaires,
  type Jour,
} from '@/lib/horaires';
import { LienRetour, classesBouton } from '@/components/ui/Bouton';
import { supabase, utilisateurCourant } from '@/lib/supabase';
import { BUCKET_IMAGES, dossierMarchand, nomFichierSain } from '@/lib/storage';
import { useBoutique } from '@/lib/boutique';
import { genererSlug } from '@/lib/slug';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  Save, 
  Upload, 
  Store, 
  MapPin, 
  Phone, 
  Tag, 
  FileText,
  CheckCircle,
  AlertCircle
} from 'lucide-react';


/**
 * Ce qu'on propose quand le marchand active ses horaires pour la premiere fois.
 *
 * Sept jours ouverts de 8 h a 20 h : un point de depart plausible qu'il ajuste,
 * plutot qu'une grille vide ou tout serait ferme — ce qui fermerait sa boutique
 * a la seconde ou il coche la case.
 */
/**
 * Les secteurs proposes. « Commerce » ouvre la liste parce que c'est le defaut
 * neutre : une pharmacie ou un vendeur de vetements ne doit pas se retrouver
 * classe « Restaurant » faute d'avoir choisi.
 *
 * La liste n'est pas fermee pour autant : une categorie deja enregistree et
 * absente d'ici est conservee telle quelle (voir le selecteur).
 */
/**
 * Les moyens de paiement proposes.
 *
 * Ceux qui circulent reellement a Abidjan. La liste n'est qu'une COMMODITE de
 * saisie : la colonne est un tableau de texte libre, et rien en base ne s'y
 * adosse. Une liste fermee posee sur une donnee ouverte est un piege que ce
 * depot connait — la categorie de boutique l'a deja montre.
 */
const MOYENS_PAIEMENT = [
  'Espèces à la livraison', 'Wave', 'Orange Money', 'MTN Money', 'Moov Money',
];

const CATEGORIES = [
  'Commerce', 'Restaurant', 'Maquis', 'Électronique', 'Santé', 'Épicerie', 'Mode',
];

const HORAIRES_PAR_DEFAUT: Horaires = Object.fromEntries(
  SEMAINE.map((j) => [j, { ouvre: '08:00', ferme: '20:00' }]),
) as Horaires;

export default function MaBoutiquePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Boutique effectivement editee. Un compte peut en posseder plusieurs :
  // sans cet identifiant, la sauvegarde ecrirait dans toutes a la fois.
  const [boutiqueEditee, setBoutiqueEditee] = useState<string | null>(null);
  const [nbBoutiques, setNbBoutiques] = useState(0);

  // Slug choisi dans le selecteur du dashboard.
  const { boutiqueId: slugSelectionne, pret } = useBoutique();

  const [formData, setFormData] = useState({
    nom: '',
    description: '',
    zone: '',
    categorie: 'Commerce',
    telephone: '',
    logo_url: '',
    // CE QUE LE CLIENT DEVAIT DEMANDER. Quatre questions qu'il se pose avant
    // de commander et auxquelles la page ne repondait pas : combien de temps,
    // chez moi est-ce livre, comment je paie, y a-t-il un minimum. Beaucoup
    // n'ecrivent pas pour les poser — ils partent.
    delai_livraison: '',
    zones_livrees: '',
    commande_minimum: '',
    /**
     * COMMENT LE CLIENT RECUPERE SA COMMANDE.
     *
     * `livraison` par defaut, comme en base : ce champ decide si la plateforme
     * exige un groupe de livreurs, et une boutique deja en service ne doit rien
     * changer en ouvrant cette page.
     */
    mode_recuperation: 'livraison',
    /** Minutes de preparation, pour annoncer une heure de retrait credible. */
    delai_preparation_min: '',
  });

  /**
   * LA GRATUITE DE LA LIVRAISON TIENT DANS UNE SEULE COLONNE, ET TROIS ETATS.
   *
   *     NULL   le livreur annonce ses frais et les encaisse  (comportement actuel)
   *     0      toujours offerte
   *     N > 0  offerte a partir de N FCFA
   *
   * A l'ecran, ces trois etats deviennent un choix explicite plus un montant.
   * Un simple champ nombre ne saurait pas les distinguer : vide voudrait dire
   * a la fois « le livreur annonce » et « toujours offerte », et zero ne se
   * lirait plus comme un seuil.
   */
  const [gratuite, setGratuite] = useState<'livreur' | 'toujours' | 'seuil'>('livreur');
  const [gratuiteSeuil, setGratuiteSeuil] = useState('');

  /**
   * Les moyens de paiement acceptes.
   *
   * VIDE VEUT DIRE « NON RENSEIGNE », JAMAIS « aucun ». La vitrine se tait
   * alors, au lieu d'annoncer au client qu'il ne peut pas payer.
   */
  const [paiements, setPaiements] = useState<string[]>([]);
  /**
   * Horaires en cours d'edition. `null` signifie TOUJOURS OUVERT, et c'est
   * l'etat de toutes les boutiques deja en service : la case reste decochee
   * tant que le marchand n'a rien decide.
   */
  const [horaires, setHoraires] = useState<Horaires | null>(null);

  const majJour = (jour: Jour, creneau: Creneau | null) =>
    setHoraires((h) => ({ ...(h ?? {}), [jour]: creneau }));

  // La plupart des commerces ouvrent pareil tous les jours : recopier le lundi
  // evite quatorze champs a remplir a la main sur un telephone.
  const appliquerLundiPartout = () =>
    setHoraires((h) => {
      const lundi = h?.lun ?? null;
      return Object.fromEntries(SEMAINE.map((j) => [j, lundi])) as Horaires;
    });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');

  useEffect(() => {
    const checkAuthAndLoadBoutique = async () => {
      const user = await utilisateurCourant();
      if (!user) {
        router.push('/login');
        return;
      }
      setUserId(user.id);

      // .single() levait une erreur des que le compte possedait plus d'une
      // boutique, ce qui laissait la page vide. On lit la liste, puis on
      // retient celle du selecteur (a defaut, la premiere).
      const { data: boutiques } = await supabase
        .from('boutiques')
        .select('*')
        .eq('user_id', user.id)
        .order('nom', { ascending: true });

      const possedees = boutiques ?? [];
      setNbBoutiques(possedees.length);

      const data =
        (slugSelectionne ? possedees.find(b => b.slug === slugSelectionne) : null) ??
        possedees[0] ??
        null;

      if (data) {
        setBoutiqueEditee(data.id);
        setFormData({
          nom: data.nom || '',
          description: data.description || '',
          zone: data.zone || '',
          delai_livraison: data.delai_livraison || '',
          zones_livrees: data.zones_livrees || '',
          // `null` devient une chaine vide a l'ecran, et redeviendra `null` a
          // l'enregistrement : un minimum a zero se lirait comme un minimum
          // reel de zero franc.
          commande_minimum:
            data.commande_minimum === null || data.commande_minimum === undefined
              ? ''
              : String(data.commande_minimum),
          // Neutre par defaut : la plateforme sert aussi des pharmacies et
          // des boutiques de vetements.
          categorie: data.categorie || 'Commerce',
          telephone: data.telephone || '',
          logo_url: data.logo_url || '',
          // Une valeur absente se lit « livraison » : c'est le defaut de la
          // colonne, et le comportement de toutes les boutiques en service.
          mode_recuperation: data.mode_recuperation || 'livraison',
          delai_preparation_min:
            data.delai_preparation_min === null || data.delai_preparation_min === undefined
              ? ''
              : String(data.delai_preparation_min),
        });
        // LES TROIS ETATS SE RELISENT ICI, ET ZERO N'EST PAS UN TROU. Sans ce
        // test explicite sur `null`, « toujours offerte » (0) serait retombe
        // sur « le livreur annonce » a chaque ouverture de la page, puis
        // reenregistre tel quel : le marchand aurait perdu son reglage sans
        // toucher a ce champ.
        {
          const offerte = data.livraison_offerte_des;
          const absent = offerte === null || offerte === undefined;
          setGratuite(absent ? 'livreur' : offerte === 0 ? 'toujours' : 'seuil');
          setGratuiteSeuil(!absent && offerte > 0 ? String(offerte) : '');
        }
        // SANS CETTE LIGNE, ROUVRIR LA PAGE EFFACAIT LES PAIEMENTS.
        // `paiements` vit hors de `formData` ; il serait reste a vide, et le
        // premier enregistrement suivant aurait ecrit `null` par-dessus le
        // choix du marchand — sans qu'il touche a ce champ, et sans rien dire.
        setPaiements(
          Array.isArray(data.paiements_acceptes)
            ? data.paiements_acceptes.map((v: unknown) => String(v ?? '').trim()).filter(Boolean)
            : [],
        );
        setLogoPreview(data.logo_url || '');
        setHoraires(lireHoraires(data.horaires));
      } else {
        // Aucune boutique : formulaire vierge de creation.
        setBoutiqueEditee(null);
        setFormData({
          nom: '', description: '', zone: '', categorie: 'Commerce',
          telephone: '', logo_url: '',
          delai_livraison: '', zones_livrees: '', commande_minimum: '',
          mode_recuperation: 'livraison', delai_preparation_min: '',
        });
        setGratuite('livreur');
        setGratuiteSeuil('');
        setPaiements([]);
        setLogoPreview('');
        setHoraires(null);
      }
      setLoading(false);
    };

    // Attendre le registre : sans lui, slugSelectionne est encore vide et on
    // chargerait la mauvaise boutique avant de la recharger aussitot.
    if (pret) checkAuthAndLoadBoutique();
  }, [router, pret, slugSelectionne]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    /**
     * UN SEUIL ANNONCE ET LAISSE VIDE SE REFUSE, IL NE SE DEVINE PAS.
     *
     * Sans ce refus, un champ vide serait retombe sur `null` — c'est-a-dire
     * « le livreur annonce ses frais », l'exact CONTRAIRE de ce que le marchand
     * venait de cocher. Il aurait lu « enregistrée ! » et ses clients auraient
     * paye la livraison qu'il croyait offerte.
     */
    const seuilSaisi = Number(gratuiteSeuil);
    if (
      formData.mode_recuperation !== 'retrait'
      && gratuite === 'seuil'
      && !(Number.isFinite(seuilSaisi) && seuilSaisi > 0)
    ) {
      setMessage({
        type: 'error',
        text: 'Indiquez à partir de quel montant la livraison devient offerte.',
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    let finalLogoUrl = formData.logo_url;

    if (logoFile) {
      try {
        // Dossier impose par les policies Storage : la boutique EDITEE si
        // elle existe deja, sinon le user_id (premiere creation, aucune
        // boutique en base).
        const dossier = boutiqueEditee ?? (await dossierMarchand());
        const filePath = `${dossier}/logos/${Date.now()}-${nomFichierSain(logoFile.name)}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET_IMAGES)
          .upload(filePath, logoFile, {
            cacheControl: '3600',
            contentType: logoFile.type || 'application/octet-stream',
            upsert: false,
          });

        if (uploadError) {
          setMessage({ type: 'error', text: `Erreur upload logo — ${uploadError.message}` });
          setSaving(false);
          return;
        }

        const { data: { publicUrl } } = supabase.storage
          .from(BUCKET_IMAGES)
          .getPublicUrl(filePath);
        
        finalLogoUrl = publicUrl;
      } catch {
        setMessage({ type: 'error', text: 'Erreur upload logo' });
        setSaving(false);
        return;
      }
    }

    const champs = {
      nom: formData.nom,
      description: formData.description,
      zone: formData.zone,
      categorie: formData.categorie,
      telephone: formData.telephone,
      logo_url: finalLogoUrl,
      // `null` est enregistre tel quel : c'est ainsi que se dit « toujours
      // ouvert », et non par un objet vide qui se lirait « ferme partout ».
      horaires,

      // VIDE S'ENREGISTRE EN `null`, JAMAIS EN CHAINE VIDE NI EN ZERO.
      //
      // La vitrine ne montre une information que si elle existe. Une chaine
      // vide y passerait le test de presence et afficherait une ligne muette ;
      // un minimum a zero se lirait comme un vrai minimum de zero franc. C'est
      // le motif que cette plateforme a paye plusieurs fois : une valeur par
      // defaut qui masque une donnee manquante.
      delai_livraison: formData.delai_livraison.trim() || null,
      zones_livrees: formData.zones_livrees.trim() || null,
      paiements_acceptes: paiements.length ? paiements : null,
      commande_minimum: (() => {
        const n = Number(formData.commande_minimum);
        return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
      })(),

      // ---- COMMENT LE CLIENT RECUPERE SA COMMANDE ------------------------
      mode_recuperation: formData.mode_recuperation,
      delai_preparation_min: (() => {
        const n = Number(formData.delai_preparation_min);
        return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
      })(),
      /**
       * ZERO EST UN VRAI SEUIL ICI, PAS UN TROU : « offerte a partir de 0 F »
       * se lit exactement comme « toujours offerte ». C'est la seule place de
       * ce depot ou zero et `null` cohabitent sans ambiguite.
       *
       * Le reglage est CONSERVE quand la boutique passe au retrait seul, au
       * lieu d'etre efface : un marchand qui remet la livraison retrouve son
       * choix, et rien ne s'en sert entre-temps.
       */
      livraison_offerte_des:
        gratuite === 'toujours' ? 0
        : gratuite === 'seuil' && Number.isFinite(seuilSaisi) && seuilSaisi > 0
          ? Math.round(seuilSaisi)
          // Le seuil vide n'est refuse que si la boutique livre : en retrait
          // seul, il ne s'applique a rien et ne doit pas bloquer la page.
          : null,
    };

    let error;

    if (boutiqueEditee) {
      // Cible l'id, pas le user_id : filtrer sur user_id ecrasait d'un coup
      // TOUTES les boutiques du compte avec les memes valeurs.
      const { error: updateError } = await supabase
        .from('boutiques')
        .update(champs)
        .eq('id', boutiqueEditee);

      error = updateError;
    } else {
      /**
       * LE SLUG N ETAIT PAS ECRIT, ET RIEN NE LE POSAIT.
       *
       * La colonne est nullable et aucun declencheur ne la remplit. Une
       * deuxieme enseigne creee ici naissait donc sans slug -- et devenait
       * INVISIBLE PARTOUT : `listerMarchands` ecarte les boutiques sans slug,
       * elle n apparaissait ni dans la vitrine ni dans le selecteur, et
       * `/api/onboarding` refusait son jeton Telegram en 409 « Boutique sans
       * slug ». Le marchand lisait « sauvegardee ! » et elle n existait nulle
       * part.
       *
       * Le suffixe garantit l unicite sans aller-retour : deux enseignes
       * peuvent legitimement porter le meme nom, et une contrainte violee
       * ferait echouer la creation au lieu de la nommer.
       */
      const base = genererSlug(formData.nom) || 'boutique';
      const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;

      const { data: creee, error: insertError } = await supabase
        .from('boutiques')
        .insert({ user_id: userId, slug, ...champs })
        .select('id')
        .single();

      error = insertError;
      // Sans cela, un second enregistrement creerait une boutique de plus.
      if (creee) {
        setBoutiqueEditee(creee.id);
        setNbBoutiques(n => n + 1);
      }
    }

    if (error) {
      /**
       * UN REFUS DE REGLE N'EST PAS UNE PANNE, ET NE DOIT PAS SE LIRE COMME
       * TELLE.
       *
       * « Erreur sauvegarde » envoie le marchand chercher un probleme
       * technique, recommencer, puis nous ecrire. Or il n'y a rien de casse :
       * il a atteint une limite de son forfait, et il existe un geste pour en
       * sortir. Le dire coute une ligne et lui epargne un appel.
       *
       * Le verrou reste EN BASE — un declencheur sur `boutiques` — parce que
       * la creation part du navigateur : une garde posee ici seule se
       * contournerait en appelant l'API directement. Ceci n'est que la
       * traduction du refus, pas le refus lui-meme.
       */
      const limiteAtteinte = /Premium/i.test(error.message ?? '');

      setMessage({
        type: 'error',
        text: limiteAtteinte
          ? 'Votre forfait ne couvre qu’une seule boutique. Passez en Premium pour en ouvrir plusieurs sur ce compte.'
          : 'Erreur sauvegarde',
      });
    } else {
      setMessage({ type: 'success', text: 'Boutique sauvegardée !' });
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-nuit-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] p-6 lg:p-8">
      <div className="mb-8">
        <LienRetour href="/dashboard">Retour au tableau de bord</LienRetour>
        <h1 className="font-display text-3xl font-bold text-nuit-900">Ma boutique</h1>
        <p className="text-chaux-600 mt-1">Ce que vos clients voient : nom, quartier, numéro et horaires.</p>

        {nbBoutiques > 1 && (
          <p className="mt-3 inline-flex items-center gap-2 border border-mangue-200 bg-mangue-50 px-3 py-2 text-sm text-mangue-700">
            <Store className="h-4 w-4 shrink-0" />
            Vous gérez {nbBoutiques} boutiques. Vous modifiez{' '}
            <span className="font-bold">{formData.nom || 'sans nom'}</span> — changez de boutique
            avec le sélecteur en haut de page.
          </p>
        )}
      </div>

      {message && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }}
          className={`mb-6 p-4 flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-accent-50 text-accent-700 border border-accent-200'
              : 'bg-bissap-50 text-bissap-700 border border-bissap-200'
          }`}
        >
          {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="font-medium">{message.text}</span>
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white p-6 soft-shadow border border-chaux-200 sticky top-6">
              <h2 className="font-bold text-nuit-900 mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-nuit-500" />
                Logo de la boutique
              </h2>
              
              <div className="flex flex-col items-center">
                <div className="w-32 h-32 bg-chaux-100 flex items-center justify-center overflow-hidden border-4 border-white soft-shadow mb-4">
                  {logoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- aperçu data-URL / URL Supabase, next/image non configuré pour ces domaines
                    <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <Store className="w-12 h-12 text-chaux-400" />
                  )}
                </div>
                
                <label className={`${classesBouton('calme', 'sm')} cursor-pointer`}>
                  <Upload className="w-4 h-4" />
                  Choisir une image
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleLogoChange} 
                    className="hidden" 
                  />
                </label>
                <p className="text-xs text-chaux-600 mt-2 text-center">PNG, JPG ou GIF (max 2MB)</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 soft-shadow border border-chaux-200">
              <h2 className="font-bold text-nuit-900 mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5 text-nuit-500" />
                Informations générales
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-nuit-700 mb-1">Nom de la boutique *</label>
                  <input
                    type="text"
                    required
                    value={formData.nom}
                    onChange={(e) => setFormData({...formData, nom: e.target.value})}
                    className="w-full px-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300"
                    placeholder="Ex: Chez Aminata"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-nuit-700 mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300"
                    placeholder="Décrivez votre boutique..."
                  />
                </div>

                {/* COMMENT LE CLIENT RECUPERE SA COMMANDE.

                    CE QUE CE BLOC OUVRE. La plateforme exigeait un groupe de
                    livreurs pour vendre : un maquis qui ne fait que de
                    l'a-emporter n'etait pas mal servi, il etait EXCLU. Le
                    premier bouton ci-dessous est donc une porte d'entree, pas
                    un confort. */}
                <div className="border border-[var(--hairline)] bg-chaux-50 p-5">
                  <h3 className="font-display text-lg font-bold text-nuit-900">
                    Comment vos clients récupèrent leurs commandes
                  </h3>
                  <p className="mt-1 text-sm text-chaux-600">
                    Si vos clients viennent chercher eux-mêmes, vous n’avez besoin
                    d’aucun livreur pour vendre.
                  </p>

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {([
                      { valeur: 'livraison', titre: 'Je livre', detail: 'Un livreur porte la commande.' },
                      { valeur: 'retrait', titre: 'Retrait sur place', detail: 'Le client vient chercher.' },
                      { valeur: 'les_deux', titre: 'Les deux', detail: 'Le client choisit.' },
                    ] as const).map((choix) => {
                      const actif = formData.mode_recuperation === choix.valeur;
                      return (
                        <button
                          key={choix.valeur}
                          type="button"
                          aria-pressed={actif}
                          onClick={() =>
                            setFormData({ ...formData, mode_recuperation: choix.valeur })
                          }
                          className={`border p-3 text-left transition ${
                            actif
                              ? 'border-nuit-900 bg-nuit-900 text-chaux-50'
                              : 'border-chaux-200 bg-white text-nuit-800 hover:border-nuit-300'
                          }`}
                        >
                          <span className="block text-sm font-semibold">{choix.titre}</span>
                          <span
                            className={`mt-0.5 block text-xs ${actif ? 'text-chaux-200' : 'text-chaux-600'}`}
                          >
                            {choix.detail}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {formData.mode_recuperation !== 'livraison' && (
                    <div className="mt-4">
                      <label className="mb-1 block text-sm font-medium text-nuit-700">
                        Temps de préparation
                      </label>
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={formData.delai_preparation_min}
                        onChange={(e) =>
                          setFormData({ ...formData, delai_preparation_min: e.target.value })
                        }
                        className="w-full border border-chaux-200 px-4 py-2.5 focus:border-nuit-300 focus:ring-2 focus:ring-nuit-200 sm:w-48"
                        placeholder="Ex : 20"
                      />
                      <p className="mt-1 text-xs text-chaux-600">
                        En minutes. Sert à proposer une heure de retrait tenable.
                        Vide = aucune heure n’est annoncée.
                      </p>
                    </div>
                  )}

                  {/* LA GRATUITE NE CONCERNE QUE QUI LIVRE. En retrait seul,
                      il n'y a ni course ni frais : poser la question ferait
                      reglee une chose qui n'existe pas. */}
                  {formData.mode_recuperation !== 'retrait' && (
                    <div className="mt-5 border-t border-[var(--hairline)] pt-4">
                      <span className="mb-2 block text-sm font-medium text-nuit-700">
                        Frais de livraison
                      </span>
                      <div className="space-y-2">
                        {([
                          {
                            valeur: 'livreur',
                            titre: 'Le livreur annonce ses frais',
                            detail: 'Il les encaisse auprès du client. C’est le fonctionnement actuel.',
                          },
                          {
                            valeur: 'toujours',
                            titre: 'Livraison toujours offerte',
                            detail: 'Le client ne paie rien, c’est vous qui réglez le livreur.',
                          },
                          {
                            valeur: 'seuil',
                            titre: 'Offerte à partir d’un montant',
                            detail: 'En dessous, le livreur annonce ses frais comme d’habitude.',
                          },
                        ] as const).map((choix) => (
                          <label
                            key={choix.valeur}
                            className={`flex cursor-pointer items-start gap-3 border p-3 transition ${
                              gratuite === choix.valeur
                                ? 'border-nuit-900 bg-white'
                                : 'border-chaux-200 bg-white hover:border-nuit-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name="gratuite"
                              className="mt-1"
                              checked={gratuite === choix.valeur}
                              onChange={() => setGratuite(choix.valeur)}
                            />
                            <span>
                              <span className="block text-sm font-semibold text-nuit-800">
                                {choix.titre}
                              </span>
                              <span className="mt-0.5 block text-xs text-chaux-600">
                                {choix.detail}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>

                      {gratuite === 'seuil' && (
                        <div className="mt-3">
                          <input
                            type="number"
                            min="1"
                            inputMode="numeric"
                            value={gratuiteSeuil}
                            onChange={(e) => setGratuiteSeuil(e.target.value)}
                            className="w-full border border-chaux-200 px-4 py-2.5 focus:border-nuit-300 focus:ring-2 focus:ring-nuit-200 sm:w-56"
                            placeholder="Ex : 10000"
                          />
                          <p className="mt-1 text-xs text-chaux-600">
                            En FCFA. À partir de ce total, la livraison est offerte.
                          </p>
                        </div>
                      )}

                      {/* LA PHRASE QUI EVITE UNE DISPUTE SUR LE PAS DE LA PORTE.
                          Une livraison offerte veut dire que le livreur n'a rien
                          a encaisser : si le marchand ne sait pas qu'il le regle
                          lui-meme, c'est le client qui essuiera la demande. */}
                      {gratuite !== 'livreur' && (
                        <p className="mt-3 border-l-2 border-nuit-900 bg-white px-3 py-2 text-xs text-nuit-800">
                          Quand la livraison est offerte, le livreur n’encaisse rien
                          auprès du client : c’est vous qui le réglez. Il en sera
                          prévenu noir sur blanc à chaque course.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* CE QUE LE CLIENT DEVAIT VOUS DEMANDER.

                    Quatre questions qu'un client se pose AVANT de commander :
                    combien de temps, chez moi est-ce livre, comment je paie,
                    y a-t-il un minimum. Aucune ne trouvait de reponse sur la
                    page — il fallait ecrire au marchand, et beaucoup n'ecrivent
                    pas : ils partent.

                    RIEN N'EST OBLIGATOIRE, ET RIEN N'EST INVENTE. Un champ
                    laisse vide ne s'affiche pas du tout chez le client. Mieux
                    vaut le silence qu'une promesse approximative, qu'il faudra
                    tenir a chaque livraison. */}
                <div className="border border-[var(--hairline)] bg-chaux-50 p-5">
                  <h3 className="font-display text-lg font-bold text-nuit-900">
                    Ce que le client doit savoir
                  </h3>
                  <p className="mt-1 text-sm text-chaux-600">
                    Ces informations s’affichent sur votre boutique, avant le catalogue.
                    Laissez vide ce que vous ne voulez pas annoncer.
                  </p>

                  {/* ON NE VIDE RIEN A LA PLACE DU MARCHAND, ON LE LUI DIT.
                      Effacer ces deux champs au changement de mode lui ferait
                      perdre sa saisie sans un mot ; les cacher les laisserait
                      s'afficher chez le client sans qu'il puisse les corriger. */}
                  {formData.mode_recuperation === 'retrait' && (
                    <p className="mt-3 border-l-2 border-nuit-900 bg-white px-3 py-2 text-xs text-nuit-800">
                      Vous avez choisi le retrait seul. Les deux champs ci-dessous
                      parlent de livraison : videz-les s’ils ne s’appliquent plus,
                      sinon ils resteront affichés sur votre boutique.
                    </p>
                  )}

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-nuit-700">
                        Délai habituel de livraison
                      </label>
                      <input
                        type="text"
                        value={formData.delai_livraison}
                        onChange={(e) => setFormData({ ...formData, delai_livraison: e.target.value })}
                        className="w-full border border-chaux-200 px-4 py-2.5 focus:border-nuit-300 focus:ring-2 focus:ring-nuit-200"
                        placeholder="Ex : 30 à 45 min"
                      />
                      <p className="mt-1 text-xs text-chaux-600">
                        Annoncez large plutôt que juste : un client servi plus vite
                        que promis revient.
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-nuit-700">
                        Commande minimum
                      </label>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={formData.commande_minimum}
                        onChange={(e) => setFormData({ ...formData, commande_minimum: e.target.value })}
                        className="w-full border border-chaux-200 px-4 py-2.5 focus:border-nuit-300 focus:ring-2 focus:ring-nuit-200"
                        placeholder="Aucun minimum"
                      />
                      <p className="mt-1 text-xs text-chaux-600">En FCFA. Vide = pas de minimum.</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-1 block text-sm font-medium text-nuit-700">
                      Quartiers que vous livrez
                    </label>
                    <input
                      type="text"
                      value={formData.zones_livrees}
                      onChange={(e) => setFormData({ ...formData, zones_livrees: e.target.value })}
                      className="w-full border border-chaux-200 px-4 py-2.5 focus:border-nuit-300 focus:ring-2 focus:ring-nuit-200"
                      placeholder="Ex : Yopougon, Adjamé, Plateau"
                    />
                    <p className="mt-1 text-xs text-chaux-600">
                      Le client saura tout de suite s’il est concerné, au lieu de
                      composer un panier pour rien.
                    </p>
                  </div>

                  <div className="mt-4">
                    <span className="mb-2 block text-sm font-medium text-nuit-700">
                      Moyens de paiement acceptés
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {MOYENS_PAIEMENT.map((moyen) => {
                        const actif = paiements.includes(moyen);
                        return (
                          <button
                            key={moyen}
                            type="button"
                            aria-pressed={actif}
                            onClick={() =>
                              setPaiements((liste) =>
                                actif ? liste.filter((x) => x !== moyen) : [...liste, moyen],
                              )
                            }
                            className={`min-h-11 border px-3 text-sm font-semibold transition ${
                              actif
                                ? 'border-nuit-900 bg-nuit-900 text-chaux-50'
                                : 'border-chaux-200 bg-white text-nuit-700 hover:border-nuit-900'
                            }`}
                          >
                            {moyen}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-xs text-chaux-600">
                      Rien de coché = rien d’annoncé. Le client ne lira jamais que
                      vous refusez un moyen de paiement.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-nuit-700 mb-1 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-chaux-400" /> Zone de livraison *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.zone}
                      onChange={(e) => setFormData({...formData, zone: e.target.value})}
                      className="w-full px-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300"
                      placeholder="Ex: Cocody - Angré"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-nuit-700 mb-1 flex items-center gap-2">
                      <Tag className="w-4 h-4 text-chaux-400" /> Catégorie *
                    </label>
                    <select
                      value={formData.categorie}
                      onChange={(e) => setFormData({...formData, categorie: e.target.value})}
                      className="w-full px-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300 bg-white"
                    >
                      {/* LA CATEGORIE DU MARCHAND SURVIT MEME SI ELLE N'EST PAS
                          DANS LA LISTE.
                          « Rose Monde » est enregistree en « vetements et
                          accessoire », qui n'y figure pas : ouvrir cette page et
                          enregistrer lui aurait silencieusement change de secteur
                          pour la premiere option venue. Une liste fermee sur des
                          donnees ouvertes efface ce qu'elle ne connait pas. */}
                      {formData.categorie
                        && !CATEGORIES.includes(formData.categorie) && (
                        <option value={formData.categorie}>{formData.categorie}</option>
                      )}
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-nuit-700 mb-1 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-chaux-400" /> Téléphone / WhatsApp *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.telephone}
                    onChange={(e) => setFormData({...formData, telephone: e.target.value})}
                    className="w-full px-4 py-2.5 border border-chaux-200 focus:ring-2 focus:ring-nuit-200 focus:border-nuit-300"
                    placeholder="Ex: 0709123456"
                  />
                </div>
              </div>
            </div>

            {/* ---- Horaires d'ouverture.
                Tant que rien n'est defini, la boutique est TOUJOURS OUVERTE :
                c'est l'etat de toutes celles deja en service, et les fermer
                d'office ferait plus de degats que le probleme qu'on corrige.
                Le marchand ouvre ses horaires quand il le decide. */}
            <div className="bg-white border border-chaux-200 p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-bold text-nuit-900">Horaires d’ouverture</h2>
                  <p className="text-sm text-chaux-600 mt-1">
                    Hors de ces heures, la boutique refuse les commandes et le dit au client.
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-sm font-semibold text-nuit-700">
                  <input
                    type="checkbox"
                    checked={horaires !== null}
                    onChange={(e) => setHoraires(e.target.checked ? HORAIRES_PAR_DEFAUT : null)}
                    className="h-4 w-4"
                  />
                  Définir des horaires
                </label>
              </div>

              {horaires === null ? (
                <p className=" bg-chaux-50 px-4 py-3 text-sm text-chaux-600">
                  Aucun horaire défini : votre boutique accepte les commandes <strong>à toute heure</strong>.
                </p>
              ) : (
                <div className="space-y-2">
                  {SEMAINE.map((jour) => {
                    const c = horaires[jour] ?? null;
                    return (
                      <div key={jour} className="flex flex-wrap items-center gap-3 bg-chaux-50 px-3 py-2">
                        <label className="flex w-full items-center gap-2 text-sm font-semibold text-nuit-800 sm:w-40">
                          <input
                            type="checkbox"
                            checked={c !== null}
                            onChange={(e) =>
                              majJour(jour, e.target.checked ? { ouvre: '08:00', ferme: '20:00' } : null)
                            }
                            className="h-4 w-4"
                          />
                          {NOMS_JOURS[jour]}
                        </label>

                        {c ? (
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <input
                              type="time"
                              value={c.ouvre}
                              onChange={(e) => majJour(jour, { ...c, ouvre: e.target.value })}
                              className=" border border-chaux-200 px-2 py-1"
                            />
                            <span className="text-chaux-600">à</span>
                            <input
                              type="time"
                              value={c.ferme}
                              onChange={(e) => majJour(jour, { ...c, ferme: e.target.value })}
                              className=" border border-chaux-200 px-2 py-1"
                            />
                            {/* Un maquis ouvert jusqu'a 2 h du matin est le cas
                                courant, pas l'exception : on le dit plutot que
                                de laisser le marchand croire a une erreur. */}
                            {c.ferme <= c.ouvre && (
                              <span className="text-xs text-mangue-700">ferme le lendemain</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-chaux-500">Fermé</span>
                        )}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={appliquerLundiPartout}
                    className="text-sm font-semibold text-nuit-700 underline hover:text-nuit-900"
                  >
                    Appliquer les horaires du lundi à toute la semaine
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className={`${classesBouton('action')} w-full md:w-auto px-8`}
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Sauvegarde en cours...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Enregistrer ma boutique
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}