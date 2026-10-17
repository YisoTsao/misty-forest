// 由 Supabase 產生的資料表型別（任務 11L-1）。資料表變更後重新產生，不要手動修改欄位。
// 產生方式：Supabase MCP 的 generate_typescript_types，或 `npx supabase gen types typescript --project-id dnnlmunlmmhiqpgkjbvr`。
// 只保留 Database 與常用的 Tables / TablesInsert / TablesUpdate 輔助型別。

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          detail: Json | null;
          id: number;
          target_id: string | null;
          target_table: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          detail?: Json | null;
          id?: never;
          target_id?: string | null;
          target_table: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          detail?: Json | null;
          id?: never;
          target_id?: string | null;
          target_table?: string;
        };
        Relationships: [];
      };
      announcements: {
        Row: {
          body: string;
          created_at: string;
          created_by: string | null;
          ends_at: string | null;
          id: string;
          kind: string;
          pinned: boolean;
          published: boolean;
          starts_at: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          body?: string;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          id?: string;
          kind?: string;
          pinned?: boolean;
          published?: boolean;
          starts_at?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          id?: string;
          kind?: string;
          pinned?: boolean;
          published?: boolean;
          starts_at?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      characters: {
        Row: {
          created_at: string;
          id: string;
          play_time: number;
          revision: number;
          save: Json;
          save_version: number;
          saved_at: string;
          slot: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          play_time?: number;
          revision?: number;
          save: Json;
          save_version: number;
          saved_at: string;
          slot?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          play_time?: number;
          revision?: number;
          save?: Json;
          save_version?: number;
          saved_at?: string;
          slot?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      chat_reports: {
        Row: {
          channel: string | null;
          created_at: string;
          detail: string | null;
          handled_at: string | null;
          handled_by: string | null;
          id: string;
          message_text: string | null;
          reason: string;
          reported_name: string;
          reported_user_id: string | null;
          reporter_id: string;
          resolution_note: string | null;
          status: string;
        };
        Insert: {
          channel?: string | null;
          created_at?: string;
          detail?: string | null;
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          message_text?: string | null;
          reason: string;
          reported_name: string;
          reported_user_id?: string | null;
          reporter_id?: string;
          resolution_note?: string | null;
          status?: string;
        };
        Update: {
          channel?: string | null;
          created_at?: string;
          detail?: string | null;
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          message_text?: string | null;
          reason?: string;
          reported_name?: string;
          reported_user_id?: string | null;
          reporter_id?: string;
          resolution_note?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      game_config: {
        Row: {
          id: boolean;
          maintenance: boolean;
          maintenance_message: string | null;
          min_client_version: string | null;
          motd: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: boolean;
          maintenance?: boolean;
          maintenance_message?: string | null;
          min_client_version?: string | null;
          motd?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: boolean;
          maintenance?: boolean;
          maintenance_message?: string | null;
          min_client_version?: string | null;
          motd?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      mail: {
        Row: {
          attachments: Json;
          body: string;
          claimed_at: string | null;
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          id: string;
          read_at: string | null;
          sender: string;
          title: string;
          user_id: string;
        };
        Insert: {
          attachments?: Json;
          body?: string;
          claimed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          read_at?: string | null;
          sender?: string;
          title: string;
          user_id: string;
        };
        Update: {
          attachments?: Json;
          body?: string;
          claimed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          read_at?: string | null;
          sender?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      moderation_actions: {
        Row: {
          action: string;
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          id: string;
          reason: string;
          report_id: string | null;
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          reason: string;
          report_id?: string | null;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          reason?: string;
          report_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_actions_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'chat_reports';
            referencedColumns: ['id'];
          },
        ];
      };
      player_sessions: {
        Row: {
          app_version: string | null;
          client: string;
          ended_at: string | null;
          id: number;
          last_seen_at: string;
          started_at: string;
          user_id: string;
        };
        Insert: {
          app_version?: string | null;
          client: string;
          ended_at?: string | null;
          id?: never;
          last_seen_at?: string;
          started_at?: string;
          user_id?: string;
        };
        Update: {
          app_version?: string | null;
          client?: string;
          ended_at?: string | null;
          id?: never;
          last_seen_at?: string;
          started_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          ban_reason: string | null;
          banned_until: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          last_seen_at: string | null;
          muted_until: string | null;
          role: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          ban_reason?: string | null;
          banned_until?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          last_seen_at?: string | null;
          muted_until?: string | null;
          role?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          ban_reason?: string | null;
          banned_until?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          last_seen_at?: string | null;
          muted_until?: string | null;
          role?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      saves: {
        Row: {
          data: Json;
          saved_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          data: Json;
          saved_at: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          data?: Json;
          saved_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_mail: { Args: { p_mail_id: string }; Returns: Json };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicTables = Database['public']['Tables'];

export type Tables<T extends keyof PublicTables> = PublicTables[T]['Row'];
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]['Insert'];
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]['Update'];
