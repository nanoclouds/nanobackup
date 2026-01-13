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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          created_at: string
          execution_id: string | null
          id: string
          job_id: string | null
          message: string | null
          read: boolean
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          execution_id?: string | null
          id?: string
          job_id?: string | null
          message?: string | null
          read?: boolean
          title: string
          type: string
        }
        Update: {
          created_at?: string
          execution_id?: string | null
          id?: string
          job_id?: string | null
          message?: string | null
          read?: boolean
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "backup_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "backup_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_executions: {
        Row: {
          checksum: string | null
          completed_at: string | null
          created_at: string
          duration: number | null
          error_message: string | null
          file_name: string | null
          file_size: number | null
          id: string
          job_id: string
          logs: string | null
          next_retry_at: string | null
          parent_execution_id: string | null
          retry_count: number
          started_at: string
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          checksum?: string | null
          completed_at?: string | null
          created_at?: string
          duration?: number | null
          error_message?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          job_id: string
          logs?: string | null
          next_retry_at?: string | null
          parent_execution_id?: string | null
          retry_count?: number
          started_at?: string
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          checksum?: string | null
          completed_at?: string | null
          created_at?: string
          duration?: number | null
          error_message?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          job_id?: string
          logs?: string | null
          next_retry_at?: string | null
          parent_execution_id?: string | null
          retry_count?: number
          started_at?: string
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "backup_executions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "backup_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_executions_parent_execution_id_fkey"
            columns: ["parent_execution_id"]
            isOneToOne: false
            referencedRelation: "backup_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_jobs: {
        Row: {
          compression: Database["public"]["Enums"]["compression_type"]
          created_at: string
          created_by: string | null
          destination_id: string
          enabled: boolean
          format: Database["public"]["Enums"]["backup_format"]
          id: string
          instance_id: string
          last_run: string | null
          max_retries: number
          name: string
          next_run: string | null
          retention_count: number | null
          retention_days: number | null
          retry_delay_minutes: number
          schedule: string
          status: Database["public"]["Enums"]["job_status"]
          timeout: number
          updated_at: string
        }
        Insert: {
          compression?: Database["public"]["Enums"]["compression_type"]
          created_at?: string
          created_by?: string | null
          destination_id: string
          enabled?: boolean
          format?: Database["public"]["Enums"]["backup_format"]
          id?: string
          instance_id: string
          last_run?: string | null
          max_retries?: number
          name: string
          next_run?: string | null
          retention_count?: number | null
          retention_days?: number | null
          retry_delay_minutes?: number
          schedule?: string
          status?: Database["public"]["Enums"]["job_status"]
          timeout?: number
          updated_at?: string
        }
        Update: {
          compression?: Database["public"]["Enums"]["compression_type"]
          created_at?: string
          created_by?: string | null
          destination_id?: string
          enabled?: boolean
          format?: Database["public"]["Enums"]["backup_format"]
          id?: string
          instance_id?: string
          last_run?: string | null
          max_retries?: number
          name?: string
          next_run?: string | null
          retention_count?: number | null
          retention_days?: number | null
          retry_delay_minutes?: number
          schedule?: string
          status?: Database["public"]["Enums"]["job_status"]
          timeout?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_jobs_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "ftp_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_jobs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "postgres_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_database_backups: {
        Row: {
          checksum: string | null
          completed_at: string | null
          created_at: string
          database_name: string
          duration: number | null
          error_message: string | null
          execution_id: string
          file_name: string | null
          file_size: number | null
          id: string
          logs: string | null
          started_at: string
          status: Database["public"]["Enums"]["job_status"]
          storage_path: string | null
        }
        Insert: {
          checksum?: string | null
          completed_at?: string | null
          created_at?: string
          database_name: string
          duration?: number | null
          error_message?: string | null
          execution_id: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          logs?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          storage_path?: string | null
        }
        Update: {
          checksum?: string | null
          completed_at?: string | null
          created_at?: string
          database_name?: string
          duration?: number | null
          error_message?: string | null
          execution_id?: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          logs?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_database_backups_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "backup_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      ftp_destinations: {
        Row: {
          base_directory: string
          created_at: string
          created_by: string | null
          host: string
          id: string
          last_tested: string | null
          name: string
          passive_mode: boolean | null
          password: string | null
          port: number
          protocol: Database["public"]["Enums"]["ftp_protocol"]
          ssh_key: string | null
          status: Database["public"]["Enums"]["connection_status"]
          updated_at: string
          username: string
        }
        Insert: {
          base_directory?: string
          created_at?: string
          created_by?: string | null
          host: string
          id?: string
          last_tested?: string | null
          name: string
          passive_mode?: boolean | null
          password?: string | null
          port?: number
          protocol?: Database["public"]["Enums"]["ftp_protocol"]
          ssh_key?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
          username: string
        }
        Update: {
          base_directory?: string
          created_at?: string
          created_by?: string | null
          host?: string
          id?: string
          last_tested?: string | null
          name?: string
          passive_mode?: boolean | null
          password?: string | null
          port?: number
          protocol?: Database["public"]["Enums"]["ftp_protocol"]
          ssh_key?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          created_at: string
          email_on_failure: boolean
          email_on_success: boolean
          id: string
          updated_at: string
          user_id: string
          webhook_on_failure: boolean
          webhook_on_success: boolean
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          email_on_failure?: boolean
          email_on_success?: boolean
          id?: string
          updated_at?: string
          user_id: string
          webhook_on_failure?: boolean
          webhook_on_success?: boolean
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          email_on_failure?: boolean
          email_on_success?: boolean
          id?: string
          updated_at?: string
          user_id?: string
          webhook_on_failure?: boolean
          webhook_on_success?: boolean
          webhook_url?: string | null
        }
        Relationships: []
      }
      postgres_instances: {
        Row: {
          client_tag: string | null
          created_at: string
          created_by: string | null
          criticality: Database["public"]["Enums"]["criticality_level"] | null
          database: string
          discovered_databases: Json | null
          environment: Database["public"]["Enums"]["environment_type"]
          host: string
          id: string
          last_checked: string | null
          name: string
          password: string
          pg_dump_format: string | null
          port: number
          ssl_enabled: boolean
          status: Database["public"]["Enums"]["connection_status"]
          updated_at: string
          username: string
          version: string | null
        }
        Insert: {
          client_tag?: string | null
          created_at?: string
          created_by?: string | null
          criticality?: Database["public"]["Enums"]["criticality_level"] | null
          database: string
          discovered_databases?: Json | null
          environment?: Database["public"]["Enums"]["environment_type"]
          host: string
          id?: string
          last_checked?: string | null
          name: string
          password: string
          pg_dump_format?: string | null
          port?: number
          ssl_enabled?: boolean
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
          username: string
          version?: string | null
        }
        Update: {
          client_tag?: string | null
          created_at?: string
          created_by?: string | null
          criticality?: Database["public"]["Enums"]["criticality_level"] | null
          database?: string
          discovered_databases?: Json | null
          environment?: Database["public"]["Enums"]["environment_type"]
          host?: string
          id?: string
          last_checked?: string | null
          name?: string
          password?: string
          pg_dump_format?: string | null
          port?: number
          ssl_enabled?: boolean
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
          username?: string
          version?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          environments: Database["public"]["Enums"]["environment_type"][] | null
          id: string
          last_login: string | null
          name: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          environments?:
            | Database["public"]["Enums"]["environment_type"][]
            | null
          id?: string
          last_login?: string | null
          name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          environments?:
            | Database["public"]["Enums"]["environment_type"][]
            | null
          id?: string
          last_login?: string | null
          name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_modify: { Args: { _user_id: string }; Returns: boolean }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      backup_format: "custom" | "sql"
      compression_type: "gzip" | "zstd" | "none"
      connection_status:
        | "online"
        | "offline"
        | "unknown"
        | "connected"
        | "disconnected"
      criticality_level: "low" | "medium" | "high" | "critical"
      environment_type: "production" | "staging" | "development"
      ftp_protocol: "ftp" | "ftps" | "sftp"
      job_status: "scheduled" | "running" | "success" | "failed" | "cancelled"
      user_role: "admin" | "operator" | "viewer"
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
      backup_format: ["custom", "sql"],
      compression_type: ["gzip", "zstd", "none"],
      connection_status: [
        "online",
        "offline",
        "unknown",
        "connected",
        "disconnected",
      ],
      criticality_level: ["low", "medium", "high", "critical"],
      environment_type: ["production", "staging", "development"],
      ftp_protocol: ["ftp", "ftps", "sftp"],
      job_status: ["scheduled", "running", "success", "failed", "cancelled"],
      user_role: ["admin", "operator", "viewer"],
    },
  },
} as const
