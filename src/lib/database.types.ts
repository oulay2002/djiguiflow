// Genere depuis le schema Supabase. Ne pas editer a la main.
// Regenerer avec : npm run types:db

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
      boutiques: {
        Row: {
          actif: boolean
          categorie: string | null
          description: string | null
          emoji: string | null
          groupe_livreurs: string | null
          id: string
          logo_url: string | null
          nom: string | null
          sheet_commandes: string | null
          sheet_document_id: string | null
          sheet_menu: string | null
          sheet_notes: string | null
          slug: string | null
          telegram_marchand: string | null
          telegram_secret_id: string | null
          telephone: string | null
          user_id: string
          wasender_secret_id: string | null
          wasender_session_hash: string | null
          zone: string | null
        }
        Insert: {
          actif?: boolean
          categorie?: string | null
          description?: string | null
          emoji?: string | null
          groupe_livreurs?: string | null
          id?: string
          logo_url?: string | null
          nom?: string | null
          sheet_commandes?: string | null
          sheet_document_id?: string | null
          sheet_menu?: string | null
          sheet_notes?: string | null
          slug?: string | null
          telegram_marchand?: string | null
          telegram_secret_id?: string | null
          telephone?: string | null
          user_id?: string
          wasender_secret_id?: string | null
          wasender_session_hash?: string | null
          zone?: string | null
        }
        Update: {
          actif?: boolean
          categorie?: string | null
          description?: string | null
          emoji?: string | null
          groupe_livreurs?: string | null
          id?: string
          logo_url?: string | null
          nom?: string | null
          sheet_commandes?: string | null
          sheet_document_id?: string | null
          sheet_menu?: string | null
          sheet_notes?: string | null
          slug?: string | null
          telegram_marchand?: string | null
          telegram_secret_id?: string | null
          telephone?: string | null
          user_id?: string
          wasender_secret_id?: string | null
          wasender_session_hash?: string | null
          zone?: string | null
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
        }
        Insert: {
          commande_id: string
          id?: string
          nom_produit: string
          prix_unitaire: number
          produit_id?: string | null
          quantite: number
        }
        Update: {
          commande_id?: string
          id?: string
          nom_produit?: string
          prix_unitaire?: number
          produit_id?: string | null
          quantite?: number
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
          chat_id: string | null
          client_adresse: string
          client_nom: string
          client_telephone: string
          created_at: string | null
          heure_livraison: string | null
          heure_prise_en_charge: string | null
          id: string
          instructions: string | null
          nom_livreur: string | null
          note_client: number | null
          position_livreur: string | null
          reference: string | null
          statut: string | null
          statut_livraison: string | null
          total: number
        }
        Insert: {
          boutique_id: string
          canal?: string | null
          chat_id?: string | null
          client_adresse: string
          client_nom: string
          client_telephone: string
          created_at?: string | null
          heure_livraison?: string | null
          heure_prise_en_charge?: string | null
          id?: string
          instructions?: string | null
          nom_livreur?: string | null
          note_client?: number | null
          position_livreur?: string | null
          reference?: string | null
          statut?: string | null
          statut_livraison?: string | null
          total: number
        }
        Update: {
          boutique_id?: string
          canal?: string | null
          chat_id?: string | null
          client_adresse?: string
          client_nom?: string
          client_telephone?: string
          created_at?: string | null
          heure_livraison?: string | null
          heure_prise_en_charge?: string | null
          id?: string
          instructions?: string | null
          nom_livreur?: string | null
          note_client?: number | null
          position_livreur?: string | null
          reference?: string | null
          statut?: string | null
          statut_livraison?: string | null
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
        ]
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
          created_at: string | null
          email: string | null
          gain_total: number | null
          id: string
          latitude: number | null
          longitude: number | null
          nom: string
          note_moyenne: number | null
          statut: string | null
          taux_commission: number | null
          telephone: string
          total_livraisons: number | null
          type: string
          user_id: string | null
          vehicule_immatriculation: string | null
          vehicule_type: string | null
        }
        Insert: {
          boutique_id?: string | null
          created_at?: string | null
          email?: string | null
          gain_total?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nom: string
          note_moyenne?: number | null
          statut?: string | null
          taux_commission?: number | null
          telephone: string
          total_livraisons?: number | null
          type: string
          user_id?: string | null
          vehicule_immatriculation?: string | null
          vehicule_type?: string | null
        }
        Update: {
          boutique_id?: string | null
          created_at?: string | null
          email?: string | null
          gain_total?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nom?: string
          note_moyenne?: number | null
          statut?: string | null
          taux_commission?: number | null
          telephone?: string
          total_livraisons?: number | null
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
      produits: {
        Row: {
          boutique_id: string
          categorie: string | null
          created_at: string | null
          description: string | null
          disponible: boolean | null
          id: string
          menu_du_jour: boolean
          nom: string | null
          photo_url: string | null
          prix: number | null
          reference: string | null
          seuil_alerte: number | null
          stock: number | null
          stock_initial: number | null
        }
        Insert: {
          boutique_id?: string
          categorie?: string | null
          created_at?: string | null
          description?: string | null
          disponible?: boolean | null
          id?: string
          menu_du_jour?: boolean
          nom?: string | null
          photo_url?: string | null
          prix?: number | null
          reference?: string | null
          seuil_alerte?: number | null
          stock?: number | null
          stock_initial?: number | null
        }
        Update: {
          boutique_id?: string
          categorie?: string | null
          created_at?: string | null
          description?: string | null
          disponible?: boolean | null
          id?: string
          menu_du_jour?: boolean
          nom?: string | null
          photo_url?: string | null
          prix?: number | null
          reference?: string | null
          seuil_alerte?: number | null
          stock?: number | null
          stock_initial?: number | null
        }
        Relationships: []
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
      bytea_to_text: { Args: { data: string }; Returns: string }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      text_to_bytea: { Args: { data: string }; Returns: string }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
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
