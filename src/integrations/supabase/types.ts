export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      league_teams: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          league_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          league_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          league_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_teams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          country: string | null
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          season: string | null
          short_name: string | null
          slug: string
          sport: Database["public"]["Enums"]["sport"]
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          season?: string | null
          short_name?: string | null
          slug: string
          sport: Database["public"]["Enums"]["sport"]
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          season?: string | null
          short_name?: string | null
          slug?: string
          sport?: Database["public"]["Enums"]["sport"]
          updated_at?: string
        }
        Relationships: []
      }
      pick_follows: {
        Row: {
          created_at: string
          id: string
          pick_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pick_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pick_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pick_follows_pick_id_fkey"
            columns: ["pick_id"]
            isOneToOne: false
            referencedRelation: "picks"
            referencedColumns: ["id"]
          },
        ]
      }
      pick_predictions: {
        Row: {
          confidence: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["prediction_kind"]
          line: number | null
          market_type: Database["public"]["Enums"]["pick_type"] | null
          odds: number | null
          pick_id: string
          predicted_away_score: number | null
          predicted_home_score: number | null
          result: Database["public"]["Enums"]["pick_status"]
          risk: Database["public"]["Enums"]["risk_level"] | null
          selection: string | null
          updated_at: string
        }
        Insert: {
          confidence: number
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["prediction_kind"]
          line?: number | null
          market_type?: Database["public"]["Enums"]["pick_type"] | null
          odds?: number | null
          pick_id: string
          predicted_away_score?: number | null
          predicted_home_score?: number | null
          result?: Database["public"]["Enums"]["pick_status"]
          risk?: Database["public"]["Enums"]["risk_level"] | null
          selection?: string | null
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["prediction_kind"]
          line?: number | null
          market_type?: Database["public"]["Enums"]["pick_type"] | null
          odds?: number | null
          pick_id?: string
          predicted_away_score?: number | null
          predicted_home_score?: number | null
          result?: Database["public"]["Enums"]["pick_status"]
          risk?: Database["public"]["Enums"]["risk_level"] | null
          selection?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pick_predictions_pick_id_fkey"
            columns: ["pick_id"]
            isOneToOne: false
            referencedRelation: "picks"
            referencedColumns: ["id"]
          },
        ]
      }
      pick_premium: {
        Row: {
          advanced_analysis: string
          alternatives: string | null
          created_at: string
          key_factors: string[]
          pick_id: string
          recommended_odds: string | null
        }
        Insert: {
          advanced_analysis: string
          alternatives?: string | null
          created_at?: string
          key_factors?: string[]
          pick_id: string
          recommended_odds?: string | null
        }
        Update: {
          advanced_analysis?: string
          alternatives?: string | null
          created_at?: string
          key_factors?: string[]
          pick_id?: string
          recommended_odds?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pick_premium_pick_id_fkey"
            columns: ["pick_id"]
            isOneToOne: true
            referencedRelation: "picks"
            referencedColumns: ["id"]
          },
        ]
      }
      pick_purchases: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          pick_id: string
          provider_ref: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          id?: string
          pick_id: string
          provider_ref?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          pick_id?: string
          provider_ref?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pick_purchases_pick_id_fkey"
            columns: ["pick_id"]
            isOneToOne: false
            referencedRelation: "picks"
            referencedColumns: ["id"]
          },
        ]
      }
      pick_views: {
        Row: {
          id: string
          pick_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          pick_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          pick_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pick_views_pick_id_fkey"
            columns: ["pick_id"]
            isOneToOne: false
            referencedRelation: "picks"
            referencedColumns: ["id"]
          },
        ]
      }
      picks: {
        Row: {
          away_score: number | null
          away_team_id: string | null
          basic_analysis: string | null
          confidence: number
          created_at: string
          edit_log: Json
          event_at: string
          event_state: string
          extra_tabs: Json
          factors: Json
          featured: boolean
          final_result: string | null
          home_score: number | null
          home_team_id: string | null
          id: string
          is_published: boolean
          league: string
          league_id: string | null
          min_plan_tier: number
          odds: number | null
          pick_type: Database["public"]["Enums"]["pick_type"]
          price_cents: number
          prob_away: number | null
          prob_draw: number | null
          prob_home: number | null
          published_at: string | null
          recommended: boolean
          risk: Database["public"]["Enums"]["risk_level"]
          score_primary: string | null
          score_primary_confidence: number | null
          score_secondary: string | null
          score_secondary_confidence: number | null
          secondary_confidence: number | null
          secondary_odds: number | null
          secondary_pick_type: Database["public"]["Enums"]["pick_type"] | null
          secondary_risk: Database["public"]["Enums"]["risk_level"] | null
          secondary_selection: string | null
          selection: string
          short_description: string
          sport: Database["public"]["Enums"]["sport"]
          status: Database["public"]["Enums"]["pick_status"]
          tags: string[]
          teams: string
          updated_at: string
          visibility: Database["public"]["Enums"]["visibility"]
        }
        Insert: {
          away_score?: number | null
          away_team_id?: string | null
          basic_analysis?: string | null
          confidence?: number
          created_at?: string
          edit_log?: Json
          event_at: string
          event_state?: string
          extra_tabs?: Json
          factors?: Json
          featured?: boolean
          final_result?: string | null
          home_score?: number | null
          home_team_id?: string | null
          id?: string
          is_published?: boolean
          league: string
          league_id?: string | null
          min_plan_tier?: number
          odds?: number | null
          pick_type: Database["public"]["Enums"]["pick_type"]
          price_cents?: number
          prob_away?: number | null
          prob_draw?: number | null
          prob_home?: number | null
          published_at?: string | null
          recommended?: boolean
          risk?: Database["public"]["Enums"]["risk_level"]
          score_primary?: string | null
          score_primary_confidence?: number | null
          score_secondary?: string | null
          score_secondary_confidence?: number | null
          secondary_confidence?: number | null
          secondary_odds?: number | null
          secondary_pick_type?: Database["public"]["Enums"]["pick_type"] | null
          secondary_risk?: Database["public"]["Enums"]["risk_level"] | null
          secondary_selection?: string | null
          selection: string
          short_description: string
          sport: Database["public"]["Enums"]["sport"]
          status?: Database["public"]["Enums"]["pick_status"]
          tags?: string[]
          teams: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Update: {
          away_score?: number | null
          away_team_id?: string | null
          basic_analysis?: string | null
          confidence?: number
          created_at?: string
          edit_log?: Json
          event_at?: string
          event_state?: string
          extra_tabs?: Json
          factors?: Json
          featured?: boolean
          final_result?: string | null
          home_score?: number | null
          home_team_id?: string | null
          id?: string
          is_published?: boolean
          league?: string
          league_id?: string | null
          min_plan_tier?: number
          odds?: number | null
          pick_type?: Database["public"]["Enums"]["pick_type"]
          price_cents?: number
          prob_away?: number | null
          prob_draw?: number | null
          prob_home?: number | null
          published_at?: string | null
          recommended?: boolean
          risk?: Database["public"]["Enums"]["risk_level"]
          score_primary?: string | null
          score_primary_confidence?: number | null
          score_secondary?: string | null
          score_secondary_confidence?: number | null
          secondary_confidence?: number | null
          secondary_odds?: number | null
          secondary_pick_type?: Database["public"]["Enums"]["pick_type"] | null
          secondary_risk?: Database["public"]["Enums"]["risk_level"] | null
          secondary_selection?: string | null
          selection?: string
          short_description?: string
          sport?: Database["public"]["Enums"]["sport"]
          status?: Database["public"]["Enums"]["pick_status"]
          tags?: string[]
          teams?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "picks_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picks_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picks_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          features: Json
          id: string
          interval: string
          is_active: boolean
          name: string
          price_cents: number
          slug: string
          tier: number
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          name: string
          price_cents?: number
          slug: string
          tier?: number
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          slug?: string
          tier?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_adult: boolean
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_adult?: boolean
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_adult?: boolean
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          plan_id: string | null
          provider_ref: string | null
          sport_scope: Database["public"]["Enums"]["sport"] | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_id?: string | null
          provider_ref?: string | null
          sport_scope?: Database["public"]["Enums"]["sport"] | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_id?: string | null
          provider_ref?: string | null
          sport_scope?: Database["public"]["Enums"]["sport"] | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          country: string | null
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          short_name: string | null
          slug: string
          sport: Database["public"]["Enums"]["sport"]
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          short_name?: string | null
          slug: string
          sport: Database["public"]["Enums"]["sport"]
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          short_name?: string | null
          slug?: string
          sport?: Database["public"]["Enums"]["sport"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_pick_access: {
        Args: { _pick_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      save_structured_pick: {
        Args: {
          p_pick: Json
          p_predictions: Json
          p_pick_id?: string | null
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user"
      pick_status: "pending" | "won" | "lost" | "void"
      pick_type:
        | "1x2"
        | "over_under"
        | "handicap"
        | "marcador_exacto"
        | "parlay"
        | "prop"
      prediction_kind: "primary" | "secondary" | "primary_score" | "alt_score"
      risk_level: "bajo" | "medio" | "alto"
      sport: "soccer" | "mlb"
      visibility: "free" | "premium"
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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends { Row: infer R }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Insert: infer I }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Update: infer U }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      pick_status: ["pending", "won", "lost", "void"],
      pick_type: ["1x2", "over_under", "handicap", "marcador_exacto", "parlay", "prop"],
      prediction_kind: ["primary", "secondary", "primary_score", "alt_score"],
      risk_level: ["bajo", "medio", "alto"],
      sport: ["soccer", "mlb"],
      visibility: ["free", "premium"],
    },
  },
} as const