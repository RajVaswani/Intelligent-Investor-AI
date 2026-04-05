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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_analyses: {
        Row: {
          company_name: string
          confidence_score: number | null
          controversy_scanner: string | null
          created_at: string
          etf: string
          financial_highlights: string | null
          geopolitical_analysis: string | null
          id: string
          macro_economic_factors: string | null
          media_manipulation_check: string | null
          news_digest: string | null
          overall_score: number
          prediction_reasoning: string | null
          price_target_1m: number | null
          price_target_1w: number | null
          price_target_1y: number | null
          price_target_3m: number | null
          raw_scraped_data: Json | null
          recommendation: string | null
          regional_sentiment: string | null
          risks: string[] | null
          sector: string
          sector_tailwinds_headwinds: string | null
          sentiment: string
          strengths: string[] | null
          summary: string
          symbol: string
          updated_at: string
          website_insights: string | null
        }
        Insert: {
          company_name: string
          confidence_score?: number | null
          controversy_scanner?: string | null
          created_at?: string
          etf: string
          financial_highlights?: string | null
          geopolitical_analysis?: string | null
          id?: string
          macro_economic_factors?: string | null
          media_manipulation_check?: string | null
          news_digest?: string | null
          overall_score: number
          prediction_reasoning?: string | null
          price_target_1m?: number | null
          price_target_1w?: number | null
          price_target_1y?: number | null
          price_target_3m?: number | null
          raw_scraped_data?: Json | null
          recommendation?: string | null
          regional_sentiment?: string | null
          risks?: string[] | null
          sector: string
          sector_tailwinds_headwinds?: string | null
          sentiment: string
          strengths?: string[] | null
          summary: string
          symbol: string
          updated_at?: string
          website_insights?: string | null
        }
        Update: {
          company_name?: string
          confidence_score?: number | null
          controversy_scanner?: string | null
          created_at?: string
          etf?: string
          financial_highlights?: string | null
          geopolitical_analysis?: string | null
          id?: string
          macro_economic_factors?: string | null
          media_manipulation_check?: string | null
          news_digest?: string | null
          overall_score?: number
          prediction_reasoning?: string | null
          price_target_1m?: number | null
          price_target_1w?: number | null
          price_target_1y?: number | null
          price_target_3m?: number | null
          raw_scraped_data?: Json | null
          recommendation?: string | null
          regional_sentiment?: string | null
          risks?: string[] | null
          sector?: string
          sector_tailwinds_headwinds?: string | null
          sentiment?: string
          strengths?: string[] | null
          summary?: string
          symbol?: string
          updated_at?: string
          website_insights?: string | null
        }
        Relationships: []
      }
      user_portfolios: {
        Row: {
          avg_price: number
          company_name: string
          created_at: string
          currency: string | null
          exchange: string | null
          id: string
          quantity: number
          sector: string | null
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_price?: number
          company_name: string
          created_at?: string
          currency?: string | null
          exchange?: string | null
          id?: string
          quantity?: number
          sector?: string | null
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_price?: number
          company_name?: string
          created_at?: string
          currency?: string | null
          exchange?: string | null
          id?: string
          quantity?: number
          sector?: string | null
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_secrets: {
        Row: {
          created_at: string
          ibkr_flex_token: string | null
          ibkr_gateway_url: string | null
          ibkr_query_id: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ibkr_flex_token?: string | null
          ibkr_gateway_url?: string | null
          ibkr_query_id?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ibkr_flex_token?: string | null
          ibkr_gateway_url?: string | null
          ibkr_query_id?: string | null
          id?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
