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
      ai_requests: {
        Row: {
          created_at: string
          id: string
          is_anonymous: boolean
          kind: string
          latency_ms: number | null
          model: string | null
          user_id: string
          valid: boolean | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_anonymous: boolean
          kind: string
          latency_ms?: number | null
          model?: string | null
          user_id: string
          valid?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          is_anonymous?: boolean
          kind?: string
          latency_ms?: number | null
          model?: string | null
          user_id?: string
          valid?: boolean | null
        }
        Relationships: []
      }
      form_versions: {
        Row: {
          form_id: string
          id: string
          published_at: string
          schema: Json
          version: number
        }
        Insert: {
          form_id: string
          id?: string
          published_at?: string
          schema: Json
          version: number
        }
        Update: {
          form_id?: string
          id?: string
          published_at?: string
          schema?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_versions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          created_at: string
          draft_schema: Json
          id: string
          is_demo: boolean
          owner_id: string | null
          published_version_id: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          draft_schema: Json
          id?: string
          is_demo?: boolean
          owner_id?: string | null
          published_version_id?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          draft_schema?: Json
          id?: string
          is_demo?: boolean
          owner_id?: string | null
          published_version_id?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_published_version_fk"
            columns: ["published_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      responses: {
        Row: {
          answers: Json
          form_id: string
          furthest_step_index: number
          id: string
          last_step_id: string | null
          respondent_id: string | null
          resume_token_expires_at: string | null
          resume_token_hash: string | null
          started_at: string
          status: string
          submitted_at: string | null
          updated_at: string
          version_id: string
        }
        Insert: {
          answers?: Json
          form_id: string
          furthest_step_index?: number
          id?: string
          last_step_id?: string | null
          respondent_id?: string | null
          resume_token_expires_at?: string | null
          resume_token_hash?: string | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version_id: string
        }
        Update: {
          answers?: Json
          form_id?: string
          furthest_step_index?: number
          id?: string
          last_step_id?: string | null
          respondent_id?: string | null
          resume_token_expires_at?: string | null
          resume_token_hash?: string | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "responses_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_response: { Args: { p_token: string }; Returns: Json }
      consume_ai_quota: { Args: { p_kind: string }; Returns: Json }
      finish_ai_request: {
        Args: {
          p_latency_ms: number
          p_model: string
          p_request_id: string
          p_valid: boolean
        }
        Returns: undefined
      }
      get_demo_responses: { Args: never; Returns: Json }
      issue_resume_token: { Args: { p_response_id: string }; Returns: string }
      open_public_form: { Args: { p_slug: string }; Returns: Json }
      publish_form: { Args: { p_form_id: string }; Returns: Json }
      unpublish_form: { Args: { p_form_id: string }; Returns: undefined }
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
