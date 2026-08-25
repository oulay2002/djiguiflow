export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      anomalies_signalees: {
        Row: {
          boutique: string | null
          reference: string
          signale_le: string
          type: string
        }
        Insert: {
          boutique?: string | null
          reference: string
          signale_le?: string
          type: string
        }
        Update: {
          boutique?: string | null
          reference?: string
          signale_le?: string
          type?: string
        }
        Relationships: []
      }
      boutiques: {
        Row: {
          actif: boolean
          banc_telegram_id: string | null
          categorie: string | null
          commande_minimum: number | null
          delai_livraison: string | null
          description: string | null
          emoji: string | null
          essai: boolean
          groupe_livreurs: string | null
          horaires: Json | null
          id: string
          logo_url: string | null
          nom: string | null
          paiements_acceptes: string[] | null
          pause_jusqua: string | null
          sheet_commandes: string | null
          sheet_document_id: string | null
          sheet_menu: string | null
          sheet_notes: string | null
          slug: string | null
          telegram_bot_username: string | null
          telegram_marchand: string | null
          telegram_secret_id: string | null
          telegram_webhook_secret_hash: string | null
          telephone: string | null
          user_id: string
          wasender_secret_id: string | null
          wasender_session_hash: string | null
          webhook_secret_hash: string | null
          zone: string | null
          zones_livrees: string | null
        }
        Insert: {
          actif?: boolean
          banc_telegram_id?: string | null
          categorie?: string | null
          commande_minimum?: number | null
          delai_livraison?: string | null
          description?: string | null
          emoji?: string | null
          essai?: boolean
          groupe_livreurs?: string | null
          horaires?: Json | null
          id?: string
          logo_url?: string | null
          nom?: string | null
          paiements_acceptes?: string[] | null
          pause_jusqua?: string | null
          sheet_commandes?: string | null
          sheet_document_id?: string | null
          sheet_menu?: string | null
          sheet_notes?: string | null
          slug?: string | null
          telegram_bot_username?: string | null
          telegram_marchand?: string | null
          telegram_secret_id?: string | null
          telegram_webhook_secret_hash?: string | null
          telephone?: string | null
          user_id?: string
          wasender_secret_id?: string | null
          wasender_session_hash?: string | null
          webhook_secret_hash?: string | null
          zone?: string | null
          zones_livrees?: string | null
        }
        Update: {
          actif?: boolean
          banc_telegram_id?: string | null
          categorie?: string | null
          commande_minimum?: number | null
          delai_livraison?: string | null
          description?: string | null
          emoji?: string | null
          essai?: boolean
          groupe_livreurs?: string | null
          horaires?: Json | null
          id?: string
          logo_url?: string | null
          nom?: string | null
          paiements_acceptes?: string[] | null
          pause_jusqua?: string | null
          sheet_commandes?: string | null
          sheet_document_id?: string | null
          sheet_menu?: string | null
          sheet_notes?: string | null
          slug?: string | null
          telegram_bot_username?: string | null
          telegram_marchand?: string | null
          telegram_secret_id?: string | null
          telegram_webhook_secret_hash?: string | null
          telephone?: string | null
          user_id?: string
          wasender_secret_id?: string | null
          wasender_session_hash?: string | null
          webhook_secret_hash?: string | null
          zone?: string | null
          zones_livrees?: string | null
        }
        Relationships: []
      }
      commande_items: {
        Row: {
          commande_id: string
          id: string
          nom_produit: string
          prix_unitaire: number
          produit_id: string | null
          quantite: number
          variante: string | null
        }
        Insert: {
          commande_id: string
          id?: string
          nom_produit: string
          prix_unitaire: number
          produit_id?: string | null
          quantite: number
          variante?: string | null
        }
        Update: {
          commande_id?: string
          id?: string
          nom_produit?: string
          prix_unitaire?: number
          produit_id?: string | null
          quantite?: number
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commande_items_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commande_items_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      commandes: {
        Row: {
          boutique_id: string
          canal: string | null
          chat_cle: string | null
          chat_id: string | null
          client_adresse: string
          client_nom: string
          client_prevenu_le: string | null
          client_telephone: string
          confirmation_heure: string | null
          confirmation_statut: string | null
          created_at: string | null
          frais_annonces_le: string | null
          frais_livraison: number | null
          heure_livraison: string | null
          heure_prise_en_charge: string | null
          id: string
          instructions: string | null
          jeton_suivi: string
          latitude: number | null
          livreur_id: string | null
          longitude: number | null
          nom_livreur: string | null
          note_client: number | null
          note_heure: string | null
          position_livreur: string | null
          position_recue_le: string | null
          reference: string | null
          relance_le: string | null
          statut: string | null
          statut_livraison: string | null
          stock_decremente_le: string | null
          total: number
        }
        Insert: {
          boutique_id: string
          canal?: string | null
          chat_cle?: string | null
          chat_id?: string | null
          client_adresse: string
          client_nom: string
          client_prevenu_le?: string | null
          client_telephone: string
          confirmation_heure?: string | null
          confirmation_statut?: string | null
          created_at?: string | null
          frais_annonces_le?: string | null
          frais_livraison?: number | null
          heure_livraison?: string | null
          heure_prise_en_charge?: string | null
          id?: string
          instructions?: string | null
          jeton_suivi?: string
          latitude?: number | null
          livreur_id?: string | null
          longitude?: number | null
          nom_livreur?: string | null
          note_client?: number | null
          note_heure?: string | null
          position_livreur?: string | null
          position_recue_le?: string | null
          reference?: string | null
          relance_le?: string | null
          statut?: string | null
          statut_livraison?: string | null
          stock_decremente_le?: string | null
          total: number
        }
        Update: {
          boutique_id?: string
          canal?: string | null
          chat_cle?: string | null
          chat_id?: string | null
          client_adresse?: string
          client_nom?: string
          client_prevenu_le?: string | null
          client_telephone?: string
          confirmation_heure?: string | null
          confirmation_statut?: string | null
          created_at?: string | null
          frais_annonces_le?: string | null
          frais_livraison?: number | null
          heure_livraison?: string | null
          heure_prise_en_charge?: string | null
          id?: string
          instructions?: string | null
          jeton_suivi?: string
          latitude?: number | null
          livreur_id?: string | null
          longitude?: number | null
          nom_livreur?: string | null
          note_client?: number | null
          note_heure?: string | null
          position_livreur?: string | null
          position_recue_le?: string | null
          reference?: string | null
          relance_le?: string | null
          statut?: string | null
          statut_livraison?: string | null
          stock_decremente_le?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "commandes_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_livreur_id_fkey"
            columns: ["livreur_id"]
            isOneToOne: false
            referencedRelation: "livreurs"
            referencedColumns: ["id"]
          },
        ]
      }
      compteurs_fenetre: {
        Row: {
          cle: string
          fenetre: string
          valeur: number
        }
        Insert: {
          cle: string
          fenetre: string
          valeur?: number
        }
        Update: {
          cle?: string
          fenetre?: string
          valeur?: number
        }
        Relationships: []
      }
      compteurs_journaliers: {
        Row: {
          cle: string
          jour: string
          valeur: number
        }
        Insert: {
          cle: string
          jour: string
          valeur?: number
        }
        Update: {
          cle?: string
          jour?: string
          valeur?: number
        }
        Relationships: []
      }
      livraisons: {
        Row: {
          commande_id: string | null
          commentaire_client: string | null
          created_at: string | null
          date_assignation: string | null
          date_livraison: string | null
          date_prise_en_charge: string | null
          distance_km: number | null
          gain_livreur: number | null
          id: string
          livreur_id: string | null
          note_client: number | null
          statut: string | null
        }
        Insert: {
          commande_id?: string | null
          commentaire_client?: string | null
          created_at?: string | null
          date_assignation?: string | null
          date_livraison?: string | null
          date_prise_en_charge?: string | null
          distance_km?: number | null
          gain_livreur?: number | null
          id?: string
          livreur_id?: string | null
          note_client?: number | null
          statut?: string | null
        }
        Update: {
          commande_id?: string | null
          commentaire_client?: string | null
          created_at?: string | null
          date_assignation?: string | null
          date_livraison?: string | null
          date_prise_en_charge?: string | null
          distance_km?: number | null
          gain_livreur?: number | null
          id?: string
          livreur_id?: string | null
          note_client?: number | null
          statut?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "livraisons_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "livraisons_livreur_id_fkey"
            columns: ["livreur_id"]
            isOneToOne: false
            referencedRelation: "livreurs"
            referencedColumns: ["id"]
          },
        ]
      }
      livreurs: {
        Row: {
          boutique_id: string | null
          code_invitation: string | null
          created_at: string | null
          email: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nom: string
          rattache_le: string | null
          statut: string | null
          taux_commission: number | null
          telegram_id: string | null
          telephone: string
          type: string
          user_id: string | null
          vehicule_immatriculation: string | null
          vehicule_type: string | null
        }
        Insert: {
          boutique_id?: string | null
          code_invitation?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nom: string
          rattache_le?: string | null
          statut?: string | null
          taux_commission?: number | null
          telegram_id?: string | null
          telephone: string
          type: string
          user_id?: string | null
          vehicule_immatriculation?: string | null
          vehicule_type?: string | null
        }
        Update: {
          boutique_id?: string | null
          code_invitation?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nom?: string
          rattache_le?: string | null
          statut?: string | null
          taux_commission?: number | null
          telegram_id?: string | null
          telephone?: string
          type?: string
          user_id?: string | null
          vehicule_immatriculation?: string | null
          vehicule_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "livreurs_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          boutique_id: string | null
          created_at: string | null
          id: string
          notif_assignation_livreur: boolean | null
          notif_nouvelle_commande: boolean | null
          notif_rapport_quotidien: boolean | null
          notif_statut_livraison: boolean | null
          notif_stock_faible: boolean | null
          telegram_actif: boolean | null
          telegram_chat_id: string | null
          updated_at: string | null
          whatsapp_actif: boolean | null
          whatsapp_numero: string | null
        }
        Insert: {
          boutique_id?: string | null
          created_at?: string | null
          id?: string
          notif_assignation_livreur?: boolean | null
          notif_nouvelle_commande?: boolean | null
          notif_rapport_quotidien?: boolean | null
          notif_statut_livraison?: boolean | null
          notif_stock_faible?: boolean | null
          telegram_actif?: boolean | null
          telegram_chat_id?: string | null
          updated_at?: string | null
          whatsapp_actif?: boolean | null
          whatsapp_numero?: string | null
        }
        Update: {
          boutique_id?: string | null
          created_at?: string | null
          id?: string
          notif_assignation_livreur?: boolean | null
          notif_nouvelle_commande?: boolean | null
          notif_rapport_quotidien?: boolean | null
          notif_statut_livraison?: boolean | null
          notif_stock_faible?: boolean | null
          telegram_actif?: boolean | null
          telegram_chat_id?: string | null
          updated_at?: string | null
          whatsapp_actif?: boolean | null
          whatsapp_numero?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: true
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
        ]
      }
      paiements: {
        Row: {
          alerte_envoyee_le: string | null
          created_at: string
          jeton_prestataire: string | null
          mois: number
          montant_fcfa: number
          operateur: string | null
          paye_le: string | null
          plan_key: string
          reference: string
          statut: string
          user_id: string
        }
        Insert: {
          alerte_envoyee_le?: string | null
          created_at?: string
          jeton_prestataire?: string | null
          mois: number
          montant_fcfa: number
          operateur?: string | null
          paye_le?: string | null
          plan_key: string
          reference: string
          statut?: string
          user_id: string
        }
        Update: {
          alerte_envoyee_le?: string | null
          created_at?: string
          jeton_prestataire?: string | null
          mois?: number
          montant_fcfa?: number
          operateur?: string | null
          paye_le?: string | null
          plan_key?: string
          reference?: string
          statut?: string
          user_id?: string
        }
        Relationships: []
      }
      paniers: {
        Row: {
          articles: number
          boutique_id: string
          commande_id: string | null
          converti_le: string | null
          cree_le: string
          id: string
          lignes: Json
          maj_le: string
          nom: string | null
          telephone: string
          total: number
        }
        Insert: {
          articles?: number
          boutique_id: string
          commande_id?: string | null
          converti_le?: string | null
          cree_le?: string
          id?: string
          lignes?: Json
          maj_le?: string
          nom?: string | null
          telephone: string
          total?: number
        }
        Update: {
          articles?: number
          boutique_id?: string
          commande_id?: string | null
          converti_le?: string | null
          cree_le?: string
          id?: string
          lignes?: Json
          maj_le?: string
          nom?: string | null
          telephone?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "paniers_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paniers_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes"
            referencedColumns: ["id"]
          },
        ]
      }
      produits: {
        Row: {
          attribut_nom: string | null
          attribut_valeurs: string[] | null
          boutique_id: string
          categorie: string | null
          couleur: string | null
          created_at: string | null
          description: string | null
          disponible: boolean | null
          groupe: string | null
          id: string
          menu_du_jour: boolean
          nom: string | null
          photo_url: string | null
          prix: number | null
          quantite_stock: number | null
          reference: string | null
          seuil_alerte: number | null
          stock: number | null
          stock_initial: number | null
        }
        Insert: {
          attribut_nom?: string | null
          attribut_valeurs?: string[] | null
          boutique_id?: string
          categorie?: string | null
          couleur?: string | null
          created_at?: string | null
          description?: string | null
          disponible?: boolean | null
          groupe?: string | null
          id?: string
          menu_du_jour?: boolean
          nom?: string | null
          photo_url?: string | null
          prix?: number | null
          quantite_stock?: number | null
          reference?: string | null
          seuil_alerte?: number | null
          stock?: number | null
          stock_initial?: number | null
        }
        Update: {
          attribut_nom?: string | null
          attribut_valeurs?: string[] | null
          boutique_id?: string
          categorie?: string | null
          couleur?: string | null
          created_at?: string | null
          description?: string | null
          disponible?: boolean | null
          groupe?: string | null
          id?: string
          menu_du_jour?: boolean
          nom?: string | null
          photo_url?: string | null
          prix?: number | null
          quantite_stock?: number | null
          reference?: string | null
          seuil_alerte?: number | null
          stock?: number | null
          stock_initial?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "produits_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_secret: string
          boutique_id: string
          created_at: string
          endpoint: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_secret: string
          boutique_id: string
          created_at?: string
          endpoint: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_secret?: string
          boutique_id?: string
          created_at?: string
          endpoint?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
        ]
      }
      relances_envoyees: {
        Row: {
          boutique: string
          canal: string
          envoye_le: string
          id: string
          motif: string | null
          telephone: string
        }
        Insert: {
          boutique: string
          canal?: string
          envoye_le?: string
          id?: string
          motif?: string | null
          telephone: string
        }
        Update: {
          boutique?: string
          canal?: string
          envoye_le?: string
          id?: string
          motif?: string | null
          telephone?: string
        }
        Relationships: [
          {
            foreignKeyName: "relances_envoyees_boutique_fkey"
            columns: ["boutique"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["slug"]
          },
        ]
      }
      relances_stop: {
        Row: {
          boutique: string
          cree_le: string
          motif: string | null
          telephone: string
        }
        Insert: {
          boutique: string
          cree_le?: string
          motif?: string | null
          telephone: string
        }
        Update: {
          boutique?: string
          cree_le?: string
          motif?: string | null
          telephone?: string
        }
        Relationships: [
          {
            foreignKeyName: "relances_stop_boutique_fkey"
            columns: ["boutique"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["slug"]
          },
        ]
      }
      subscriptions: {
        Row: {
          current_period_end: string | null
          current_period_start: string | null
          last_checkout_session_id: string
          plan_key: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          current_period_end?: string | null
          current_period_start?: string | null
          last_checkout_session_id: string
          plan_key: string
          status: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          current_period_end?: string | null
          current_period_start?: string | null
          last_checkout_session_id?: string
          plan_key?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      borne_periode: { Args: { p_periode: string }; Returns: string }
      canaux_par_commande: {
        Args: { p_commande: string }
        Returns: {
          boutique_id: string
          groupe_livreurs: string
          nom: string
          sheet_commandes: string
          sheet_menu: string
          slug: string
          telegram_marchand: string
          telephone: string
        }[]
      }
      canaux_par_session: {
        Args: { p_session_id: string }
        Returns: {
          boutique_id: string
          groupe_livreurs: string
          nom: string
          sheet_commandes: string
          sheet_menu: string
          slug: string
          telegram_marchand: string
          telephone: string
        }[]
      }
      canaux_par_slug: {
        Args: { p_slug: string }
        Returns: {
          boutique_id: string
          groupe_livreurs: string
          nom: string
          sheet_commandes: string
          sheet_menu: string
          slug: string
          telegram_marchand: string
          telephone: string
        }[]
      }
      decrementer_stock: {
        Args: { p_produit: string; p_quantite: number }
        Returns: number
      }
      definir_jeton_canal: {
        Args: { p_canal: string; p_jeton: string; p_slug: string }
        Returns: undefined
      }
      definir_secret_webhook: {
        Args: { p_secret: string; p_slug: string }
        Returns: undefined
      }
      definir_secret_webhook_telegram: {
        Args: { p_secret: string; p_slug: string }
        Returns: undefined
      }
      definir_session_wasender: {
        Args: { p_slug: string; p_token: string }
        Returns: undefined
      }
      empreinte_session: { Args: { p_valeur: string }; Returns: string }
      incrementer_compteur: {
        Args: { p_cle: string; p_plafond: number }
        Returns: {
          autorise: boolean
          valeur: number
        }[]
      }
      jeton_canal: {
        Args: { p_boutique: string; p_canal: string }
        Returns: string
      }
      prolonger_acces: {
        Args: {
          p_mois: number
          p_plan_key: string
          p_reference: string
          p_user_id: string
        }
        Returns: string
      }
      rapport_activite: {
        Args: { p_periode?: string }
        Returns: {
          annulees: number
          avis: number
          boutique_nom: string
          ca: number
          commandes: number
          livrees: number
          note_moyenne: number
          panier_moyen: number
          slug: string
        }[]
      }
      rapport_clients: {
        Args: { p_periode?: string }
        Returns: {
          boutique_nom: string
          client: string
          commandes: number
          slug: string
          telephone: string
          total: number
        }[]
      }
      rapport_retards: {
        Args: never
        Returns: {
          boutique_nom: string
          client_adresse: string
          client_nom: string
          client_telephone: string
          minutes: number
          nom_livreur: string
          order_id: string
          slug: string
          statut: string
          statut_livraison: string
        }[]
      }
      rapport_stocks: {
        Args: never
        Returns: {
          boutique_nom: string
          niveau: string
          produit: string
          restant: number
          seuil: number
          slug: string
          stock_initial: number
          vendus: number
        }[]
      }
      rapport_top_plats: {
        Args: { p_periode?: string }
        Returns: {
          boutique_nom: string
          produit: string
          quantite: number
          slug: string
        }[]
      }
      reserver_fenetre: {
        Args: { p_cle: string; p_plafond: number; p_secondes?: number }
        Returns: {
          autorise: boolean
          valeur: number
        }[]
      }
      reserver_relance: {
        Args: {
          p_boutique: string
          p_jours?: number
          p_motif?: string
          p_plafond_jour?: number
          p_telephone: string
        }
        Returns: Json
      }
      secret_webhook_n8n: { Args: never; Returns: string }
      vitrine_boutique: {
        Args: { p_ref: string }
        Returns: {
          categorie: string
          commande_minimum: number
          delai_livraison: string
          description: string
          emoji: string
          id: string
          logo_url: string
          nom: string
          paiements_acceptes: string[]
          slug: string
          telephone: string
          zone: string
          zones_livrees: string
        }[]
      }
      vitrine_boutiques: {
        Args: never
        Returns: {
          apercus: string[]
          articles: number
          avis: number
          categorie: string
          description: string
          horaires: Json
          id: string
          logo_url: string
          nom: string
          note_moyenne: number
          palier_livraisons: number
          pause_jusqua: string
          prix_min: number
          slug: string
          vedette: string
          vedette_commandes: number
          zone: string
        }[]
      }
      vitrine_produits: {
        Args: { p_ref: string }
        Returns: {
          attribut_nom: string
          attribut_valeurs: string[]
          categorie: string
          description: string
          id: string
          menu_du_jour: boolean
          nom: string
          photo_url: string
          prix: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
