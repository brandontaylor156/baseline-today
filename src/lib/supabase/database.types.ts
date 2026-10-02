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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      favorites: {
        Row: {
          created_at: string
          player_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          player_id: number
          user_id?: string
        }
        Update: {
          created_at?: string
          player_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_images: {
        Row: {
          author: string
          fetched_at: string
          image_url: string
          license: string
          license_url: string | null
          player_id: number
          source_url: string
        }
        Insert: {
          author: string
          fetched_at?: string
          image_url: string
          license: string
          license_url?: string | null
          player_id: number
          source_url: string
        }
        Update: {
          author?: string
          fetched_at?: string
          image_url?: string
          license?: string
          license_url?: string | null
          player_id?: number
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_images_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          birth_date: string | null
          birth_place: string | null
          country_code: string | null
          country_name: string | null
          created_at: string
          first_name: string | null
          full_name: string
          height_cm: number | null
          id: number
          image_checked_at: string | null
          last_name: string | null
          plays: string | null
          profile_refreshed_at: string | null
          provider: string
          provider_id: number
          search_name: string | null
          tour: string
          turned_pro: number | null
          updated_at: string
          weight_kg: number | null
          wikidata_id: string | null
        }
        Insert: {
          birth_date?: string | null
          birth_place?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          first_name?: string | null
          full_name: string
          height_cm?: number | null
          id?: never
          image_checked_at?: string | null
          last_name?: string | null
          plays?: string | null
          profile_refreshed_at?: string | null
          provider?: string
          provider_id: number
          search_name?: string | null
          tour: string
          turned_pro?: number | null
          updated_at?: string
          weight_kg?: number | null
          wikidata_id?: string | null
        }
        Update: {
          birth_date?: string | null
          birth_place?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          first_name?: string | null
          full_name?: string
          height_cm?: number | null
          id?: never
          image_checked_at?: string | null
          last_name?: string | null
          plays?: string | null
          profile_refreshed_at?: string | null
          provider?: string
          provider_id?: number
          search_name?: string | null
          tour?: string
          turned_pro?: number | null
          updated_at?: string
          weight_kg?: number | null
          wikidata_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      rankings: {
        Row: {
          movement: number | null
          player_id: number
          points: number | null
          rank: number
          ranking_date: string
          tour: string
        }
        Insert: {
          movement?: number | null
          player_id: number
          points?: number | null
          rank: number
          ranking_date: string
          tour: string
        }
        Update: {
          movement?: number | null
          player_id?: number
          points?: number | null
          rank?: number
          ranking_date?: string
          tour?: string
        }
        Relationships: [
          {
            foreignKeyName: "rankings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_state: {
        Row: {
          details: Json | null
          key: string
          last_refreshed_at: string | null
          locked_until: string | null
          status: string | null
        }
        Insert: {
          details?: Json | null
          key: string
          last_refreshed_at?: string | null
          locked_until?: string | null
          status?: string | null
        }
        Update: {
          details?: Json | null
          key?: string
          last_refreshed_at?: string | null
          locked_until?: string | null
          status?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      immutable_unaccent: { Args: { value: string }; Returns: string }
      player_favorite_count: { Args: { p_player_id: number }; Returns: number }
      ranking_dates: { Args: { p_tour: string }; Returns: string[] }
      search_normalize: { Args: { value: string }; Returns: string }
      search_players: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          country_code: string
          current_rank: number
          full_name: string
          id: number
          tour: string
        }[]
      }
      try_acquire_sync_lock: {
        Args: { p_key: string; p_ttl_seconds: number }
        Returns: boolean
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
