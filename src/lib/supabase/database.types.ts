// Hand-written to match supabase/migrations until `pnpm db:types` regenerates it from the
// linked project (the generated file has the same shape and replaces this one).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      forms: Table<
        {
          id: string;
          owner_id: string | null;
          slug: string;
          title: string;
          draft_schema: Json;
          published_version_id: string | null;
          is_demo: boolean;
          created_at: string;
          updated_at: string;
        },
        { slug: string; title: string; draft_schema: Json },
        { slug?: string; title?: string; draft_schema?: Json }
      >;
      form_versions: Table<
        { id: string; form_id: string; version: number; schema: Json; published_at: string },
        never,
        never
      >;
      responses: Table<
        {
          id: string;
          form_id: string;
          version_id: string;
          respondent_id: string | null;
          status: "draft" | "submitted";
          answers: Json;
          last_step_id: string | null;
          furthest_step_index: number;
          started_at: string;
          updated_at: string;
          submitted_at: string | null;
        },
        { version_id: string; answers?: Json; last_step_id?: string | null; furthest_step_index?: number },
        { answers?: Json; last_step_id?: string | null; furthest_step_index?: number; status?: "draft" | "submitted"; submitted_at?: string | null }
      >;
      ai_requests: Table<
        { id: string; user_id: string; is_anonymous: boolean; kind: "generate" | "edit"; model: string | null; latency_ms: number | null; valid: boolean | null; created_at: string },
        never,
        never
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      open_public_form: { Args: { p_slug: string }; Returns: Json };
      publish_form: { Args: { p_form_id: string }; Returns: Json };
      unpublish_form: { Args: { p_form_id: string }; Returns: undefined };
      issue_resume_token: { Args: { p_response_id: string }; Returns: string };
      claim_response: { Args: { p_token: string }; Returns: Json };
      consume_ai_quota: { Args: { p_kind: string }; Returns: Json };
      finish_ai_request: { Args: { p_request_id: string; p_latency_ms: number; p_valid: boolean; p_model: string }; Returns: undefined };
      get_demo_responses: { Args: Record<string, never>; Returns: Json };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

/**
 * Columns clients may select from responses (column grants exclude the resume token hash),
 * so `select('*')` is intentionally not allowed.
 */
export const RESPONSE_COLUMNS = "id, form_id, version_id, respondent_id, status, answers, last_step_id, furthest_step_index, started_at, updated_at, submitted_at" as const;
