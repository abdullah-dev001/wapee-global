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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      appointment_field_values: {
        Row: {
          appointment_id: string
          business_id: string
          created_at: string
          custom_field_id: string
          form_version_id: string
          id: string
          is_sensitive: boolean
          value: string | null
        }
        Insert: {
          appointment_id: string
          business_id: string
          created_at?: string
          custom_field_id: string
          form_version_id: string
          id?: string
          is_sensitive?: boolean
          value?: string | null
        }
        Update: {
          appointment_id?: string
          business_id?: string
          created_at?: string
          custom_field_id?: string
          form_version_id?: string
          id?: string
          is_sensitive?: boolean
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_field_values_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_field_values_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_field_values_custom_field_id_fkey"
            columns: ["custom_field_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_field_values_form_version_id_fkey"
            columns: ["form_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_status_transitions: {
        Row: {
          from_status: Database["public"]["Enums"]["appointment_status"]
          to_status: Database["public"]["Enums"]["appointment_status"]
        }
        Insert: {
          from_status: Database["public"]["Enums"]["appointment_status"]
          to_status: Database["public"]["Enums"]["appointment_status"]
        }
        Update: {
          from_status?: Database["public"]["Enums"]["appointment_status"]
          to_status?: Database["public"]["Enums"]["appointment_status"]
        }
        Relationships: []
      }
      appointments: {
        Row: {
          branch_id: string
          buffer_minutes: number
          business_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by_guest: boolean
          client_id: string
          client_notes: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_minutes: number
          ends_at: string
          form_version_id: string
          id: string
          internal_notes: string | null
          invoice_id: string | null
          is_exclusive: boolean
          price_minor: number | null
          resource_capacity_at_booking: number
          resource_id: string | null
          resource_is_exclusive: boolean | null
          service_id: string
          source: Database["public"]["Enums"]["booking_source"]
          staff_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          branch_id: string
          buffer_minutes?: number
          business_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_guest?: boolean
          client_id: string
          client_notes?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_minutes: number
          ends_at: string
          form_version_id: string
          id?: string
          internal_notes?: string | null
          invoice_id?: string | null
          is_exclusive?: boolean
          price_minor?: number | null
          resource_capacity_at_booking?: number
          resource_id?: string | null
          resource_is_exclusive?: boolean | null
          service_id: string
          source?: Database["public"]["Enums"]["booking_source"]
          staff_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string
          buffer_minutes?: number
          business_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_guest?: boolean
          client_id?: string
          client_notes?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_minutes?: number
          ends_at?: string
          form_version_id?: string
          id?: string
          internal_notes?: string | null
          invoice_id?: string | null
          is_exclusive?: boolean
          price_minor?: number | null
          resource_capacity_at_booking?: number
          resource_id?: string | null
          resource_is_exclusive?: boolean | null
          service_id?: string
          source?: Database["public"]["Enums"]["booking_source"]
          staff_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_form_version_id_fkey"
            columns: ["form_version_id"]
            isOneToOne: false
            referencedRelation: "form_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          business_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: number
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          business_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          business_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_manage_tokens: {
        Row: {
          appointment_id: string
          business_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          last_used_at: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          appointment_id: string
          business_id: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          appointment_id?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_manage_tokens_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_manage_tokens_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_manage_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_settings: {
        Row: {
          booking_window_days: number
          branch_id: string
          buffer_minutes: number
          business_id: string
          cancel_cutoff_hours: number
          confirmation: Database["public"]["Enums"]["booking_confirmation_mode"]
          created_at: string
          created_by: string | null
          customer_can_cancel: boolean
          deleted_at: string | null
          id: string
          minimum_notice_minutes: number
          online_booking_enabled: boolean
          people_per_slot: number
          require_client_email: boolean
          show_prices: boolean
          slot_display: Database["public"]["Enums"]["slot_display_mode"]
          slot_interval: Database["public"]["Enums"]["slot_interval_mode"]
          staff_choice: Database["public"]["Enums"]["staff_choice_mode"]
          updated_at: string
          use_resources: boolean
        }
        Insert: {
          booking_window_days?: number
          branch_id: string
          buffer_minutes?: number
          business_id: string
          cancel_cutoff_hours?: number
          confirmation?: Database["public"]["Enums"]["booking_confirmation_mode"]
          created_at?: string
          created_by?: string | null
          customer_can_cancel?: boolean
          deleted_at?: string | null
          id?: string
          minimum_notice_minutes?: number
          online_booking_enabled?: boolean
          people_per_slot?: number
          require_client_email?: boolean
          show_prices?: boolean
          slot_display?: Database["public"]["Enums"]["slot_display_mode"]
          slot_interval?: Database["public"]["Enums"]["slot_interval_mode"]
          staff_choice?: Database["public"]["Enums"]["staff_choice_mode"]
          updated_at?: string
          use_resources?: boolean
        }
        Update: {
          booking_window_days?: number
          branch_id?: string
          buffer_minutes?: number
          business_id?: string
          cancel_cutoff_hours?: number
          confirmation?: Database["public"]["Enums"]["booking_confirmation_mode"]
          created_at?: string
          created_by?: string | null
          customer_can_cancel?: boolean
          deleted_at?: string | null
          id?: string
          minimum_notice_minutes?: number
          online_booking_enabled?: boolean
          people_per_slot?: number
          require_client_email?: boolean
          show_prices?: boolean
          slot_display?: Database["public"]["Enums"]["slot_display_mode"]
          slot_interval?: Database["public"]["Enums"]["slot_interval_mode"]
          staff_choice?: Database["public"]["Enums"]["staff_choice_mode"]
          updated_at?: string
          use_resources?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "booking_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_closures: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          ends_on: string
          id: string
          name: string
          starts_on: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          ends_on: string
          id?: string
          name: string
          starts_on: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          ends_on?: string
          id?: string
          name?: string
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_closures_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_closures_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_hours: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          day_of_week: number
          end_minute: number
          id: string
          start_minute: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          day_of_week: number
          end_minute: number
          id?: string
          start_minute: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          day_of_week?: number
          end_minute?: number
          id?: string
          start_minute?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_hours_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_hours_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          business_id: string
          country_code: string
          created_at: string
          credit_note_next_no: number
          currency: string
          deleted_at: string | null
          google_review_url: string | null
          id: string
          invoice_next_no: number
          invoice_prefix: string
          is_primary: boolean
          name: string
          phone: string | null
          tax_number: string | null
          tax_rate_bp: number
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          country_code: string
          created_at?: string
          credit_note_next_no?: number
          currency: string
          deleted_at?: string | null
          google_review_url?: string | null
          id?: string
          invoice_next_no?: number
          invoice_prefix: string
          is_primary?: boolean
          name: string
          phone?: string | null
          tax_number?: string | null
          tax_rate_bp?: number
          timezone: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          country_code?: string
          created_at?: string
          credit_note_next_no?: number
          currency?: string
          deleted_at?: string | null
          google_review_url?: string | null
          id?: string
          invoice_next_no?: number
          invoice_prefix?: string
          is_primary?: boolean
          name?: string
          phone?: string | null
          tax_number?: string | null
          tax_rate_bp?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          deleted_at: string | null
          id: string
          invite_expires_at: string | null
          invite_token_hash: string | null
          invited_by: string | null
          invited_email: string | null
          joined_at: string | null
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          invited_by?: string | null
          invited_email?: string | null
          joined_at?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          invited_by?: string | null
          invited_email?: string | null
          joined_at?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          created_by: string | null
          default_country_code: string | null
          default_currency: string | null
          default_timezone: string | null
          deleted_at: string | null
          id: string
          industry: string | null
          language: string
          name: string
          plan: Database["public"]["Enums"]["business_plan"] | null
          plan_activated_at: string | null
          slug: string
          status: Database["public"]["Enums"]["business_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_country_code?: string | null
          default_currency?: string | null
          default_timezone?: string | null
          deleted_at?: string | null
          id?: string
          industry?: string | null
          language?: string
          name: string
          plan?: Database["public"]["Enums"]["business_plan"] | null
          plan_activated_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["business_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_country_code?: string | null
          default_currency?: string | null
          default_timezone?: string | null
          deleted_at?: string | null
          id?: string
          industry?: string | null
          language?: string
          name?: string
          plan?: Database["public"]["Enums"]["business_plan"] | null
          plan_activated_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["business_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          first_branch_id: string | null
          full_name: string
          id: string
          notes: string | null
          phone_e164: string
          source: Database["public"]["Enums"]["booking_source"]
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_branch_id?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone_e164: string
          source?: Database["public"]["Enums"]["booking_source"]
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_branch_id?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone_e164?: string
          source?: Database["public"]["Enums"]["booking_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_first_branch_id_fkey"
            columns: ["first_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          invoice_id: string
          issued_at: string
          net_minor: number
          number: string
          number_seq: number
          reason: string
          tax_minor: number
          tax_rate_bp: number
          total_minor: number
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          created_by?: string | null
          currency: string
          id?: string
          invoice_id: string
          issued_at?: string
          net_minor: number
          number: string
          number_seq: number
          reason: string
          tax_minor: number
          tax_rate_bp: number
          total_minor: number
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_id?: string
          issued_at?: string
          net_minor?: number
          number?: string
          number_seq?: number
          reason?: string
          tax_minor?: number
          tax_rate_bp?: number
          total_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_services: {
        Row: {
          business_id: string
          created_at: string
          custom_field_id: string
          service_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          custom_field_id: string
          service_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          custom_field_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_services_custom_field_id_fkey"
            columns: ["custom_field_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          applies_to_all_services: boolean
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          field_type: Database["public"]["Enums"]["custom_field_type"]
          help_text: string | null
          id: string
          is_active: boolean
          is_required: boolean
          is_sensitive: boolean
          label: string
          options: string[] | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          applies_to_all_services?: boolean
          business_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          field_type: Database["public"]["Enums"]["custom_field_type"]
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          is_sensitive?: boolean
          label: string
          options?: string[] | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          applies_to_all_services?: boolean
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          field_type?: Database["public"]["Enums"]["custom_field_type"]
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          is_sensitive?: boolean
          label?: string
          options?: string[] | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_fields_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      form_versions: {
        Row: {
          business_id: string
          created_at: string
          fields: Json
          fields_hash: string
          id: string
          version: number
        }
        Insert: {
          business_id: string
          created_at?: string
          fields: Json
          fields_hash: string
          id?: string
          version: number
        }
        Update: {
          business_id?: string
          created_at?: string
          fields?: Json
          fields_hash?: string
          id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_versions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_accept_attempts: {
        Row: {
          attempts: number
          first_attempt_at: string
          last_attempt_at: string
          token_hash: string
        }
        Insert: {
          attempts?: number
          first_attempt_at?: string
          last_attempt_at?: string
          token_hash: string
        }
        Update: {
          attempts?: number
          first_attempt_at?: string
          last_attempt_at?: string
          token_hash?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          description: string
          discount_minor: number
          discount_reason: string | null
          id: string
          invoice_id: string
          line_net_minor: number | null
          quantity: number
          service_id: string | null
          sort_order: number
          unit_price_minor: number
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          description: string
          discount_minor?: number
          discount_reason?: string | null
          id?: string
          invoice_id: string
          line_net_minor?: number | null
          quantity: number
          service_id?: string | null
          sort_order?: number
          unit_price_minor: number
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          description?: string
          discount_minor?: number
          discount_reason?: string | null
          id?: string
          invoice_id?: string
          line_net_minor?: number | null
          quantity?: number
          service_id?: string | null
          sort_order?: number
          unit_price_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount_minor: number
          branch_id: string
          business_id: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          invoice_id: string
          kind: Database["public"]["Enums"]["invoice_payment_kind"]
          method: Database["public"]["Enums"]["invoice_payment_method"]
          note: string | null
          paid_at: string
          reason: string | null
          reverses_payment_id: string | null
        }
        Insert: {
          amount_minor: number
          branch_id: string
          business_id: string
          created_at?: string
          created_by?: string | null
          currency: string
          id?: string
          invoice_id: string
          kind: Database["public"]["Enums"]["invoice_payment_kind"]
          method: Database["public"]["Enums"]["invoice_payment_method"]
          note?: string | null
          paid_at?: string
          reason?: string | null
          reverses_payment_id?: string | null
        }
        Update: {
          amount_minor?: number
          branch_id?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_id?: string
          kind?: Database["public"]["Enums"]["invoice_payment_kind"]
          method?: Database["public"]["Enums"]["invoice_payment_method"]
          note?: string | null
          paid_at?: string
          reason?: string | null
          reverses_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_reverses_payment_id_fkey"
            columns: ["reverses_payment_id"]
            isOneToOne: false
            referencedRelation: "invoice_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          appointment_id: string | null
          bill_to_name: string | null
          branch_id: string
          business_id: string
          client_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          discount_minor: number
          id: string
          issued_at: string | null
          issued_by: string | null
          net_minor: number
          notes: string | null
          number: string | null
          number_seq: number | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_minor: number
          tax_minor: number
          tax_number: string | null
          tax_rate_bp: number
          total_minor: number
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          bill_to_name?: string | null
          branch_id: string
          business_id: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          deleted_at?: string | null
          discount_minor?: number
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          net_minor?: number
          notes?: string | null
          number?: string | null
          number_seq?: number | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_minor?: number
          tax_minor?: number
          tax_number?: string | null
          tax_rate_bp?: number
          total_minor?: number
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          bill_to_name?: string | null
          branch_id?: string
          business_id?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          discount_minor?: number
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          net_minor?: number
          notes?: string | null
          number?: string | null
          number_seq?: number | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_minor?: number
          tax_minor?: number
          tax_number?: string | null
          tax_rate_bp?: number
          total_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      member_role_assignments: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          member_id: string
          role_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          member_id: string
          role_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          member_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_role_assignments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_role_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_role_assignments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          addon: string | null
          area: string
          key: string
          min_plan: Database["public"]["Enums"]["business_plan"] | null
        }
        Insert: {
          addon?: string | null
          area: string
          key: string
          min_plan?: Database["public"]["Enums"]["business_plan"] | null
        }
        Update: {
          addon?: string | null
          area?: string
          key?: string
          min_plan?: Database["public"]["Enums"]["business_plan"] | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_business_id: string | null
          deleted_at: string | null
          email: string
          full_name: string | null
          id: string
          is_super_admin: boolean
          locale: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_business_id?: string | null
          deleted_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_super_admin?: boolean
          locale?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_business_id?: string | null
          deleted_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_super_admin?: boolean
          locale?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_business_fk"
            columns: ["default_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      public_request_attempts: {
        Row: {
          created_at: string
          endpoint: string
          id: number
          ip_hash: string | null
          key_hash: string | null
          outcome: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: never
          ip_hash?: string | null
          key_hash?: string | null
          outcome?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: never
          ip_hash?: string | null
          key_hash?: string | null
          outcome?: string
        }
        Relationships: []
      }
      rate_limit_rules: {
        Row: {
          endpoint: string
          max_attempts: number
          note: string | null
          scope: string
          updated_at: string
          window_seconds: number
        }
        Insert: {
          endpoint: string
          max_attempts: number
          note?: string | null
          scope: string
          updated_at?: string
          window_seconds: number
        }
        Update: {
          endpoint?: string
          max_attempts?: number
          note?: string | null
          scope?: string
          updated_at?: string
          window_seconds?: number
        }
        Relationships: []
      }
      reserved_slugs: {
        Row: {
          slug: string
        }
        Insert: {
          slug: string
        }
        Update: {
          slug?: string
        }
        Relationships: []
      }
      resources: {
        Row: {
          branch_id: string
          business_id: string
          capacity: number
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          capacity?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          capacity?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      review_requests: {
        Row: {
          appointment_id: string
          branch_id: string
          business_id: string
          client_id: string | null
          created_at: string
          deleted_at: string | null
          expires_at: string
          id: string
          sent_at: string | null
          token_hash: string
          updated_at: string
          used_at: string | null
        }
        Insert: {
          appointment_id: string
          branch_id: string
          business_id: string
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          expires_at: string
          id?: string
          sent_at?: string | null
          token_hash: string
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          appointment_id?: string
          branch_id?: string
          business_id?: string
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          expires_at?: string
          id?: string
          sent_at?: string | null
          token_hash?: string
          updated_at?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          appointment_id: string
          branch_id: string
          business_id: string
          client_id: string | null
          comment: string | null
          created_at: string
          deleted_at: string | null
          featured_at: string | null
          featured_on_website: boolean
          id: string
          owner_reply: string | null
          rating: number
          replied_at: string | null
          replied_by: string | null
          review_request_id: string
          reviewer_first_name: string
          staff_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          branch_id: string
          business_id: string
          client_id?: string | null
          comment?: string | null
          created_at?: string
          deleted_at?: string | null
          featured_at?: string | null
          featured_on_website?: boolean
          id?: string
          owner_reply?: string | null
          rating: number
          replied_at?: string | null
          replied_by?: string | null
          review_request_id: string
          reviewer_first_name: string
          staff_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          branch_id?: string
          business_id?: string
          client_id?: string | null
          comment?: string | null
          created_at?: string
          deleted_at?: string | null
          featured_at?: string | null
          featured_on_website?: boolean
          id?: string
          owner_reply?: string | null
          rating?: number
          replied_at?: string | null
          replied_by?: string | null
          review_request_id?: string
          reviewer_first_name?: string
          staff_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_replied_by_fkey"
            columns: ["replied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_review_request_id_fkey"
            columns: ["review_request_id"]
            isOneToOne: true
            referencedRelation: "review_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission: string
          role_id: string
          scope: Database["public"]["Enums"]["permission_scope"]
        }
        Insert: {
          permission: string
          role_id: string
          scope?: Database["public"]["Enums"]["permission_scope"]
        }
        Update: {
          permission?: string
          role_id?: string
          scope?: Database["public"]["Enums"]["permission_scope"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          business_id: string | null
          created_at: string
          id: string
          is_system: boolean
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          id?: string
          is_system?: boolean
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      service_branches: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          enabled: boolean
          id: string
          price_minor: number
          service_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          price_minor: number
          service_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          price_minor?: number
          service_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_branches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_branches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_branches_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_resources: {
        Row: {
          business_id: string
          created_at: string
          resource_id: string
          service_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          resource_id: string
          service_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          resource_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_resources_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_resources_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_resources_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_staff: {
        Row: {
          business_id: string
          created_at: string
          service_id: string
          staff_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          service_id: string
          staff_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          service_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_staff_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_staff_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_staff_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          buffer_minutes: number
          business_id: string
          category_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          is_bookable_online: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          buffer_minutes?: number
          business_id: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          duration_minutes: number
          id?: string
          is_active?: boolean
          is_bookable_online?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          buffer_minutes?: number
          business_id?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          is_bookable_online?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_branches: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          staff_id: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          staff_id: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_branches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_branches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_branches_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_breaks: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          day_of_week: number
          end_minute: number
          id: string
          label: string | null
          staff_id: string
          start_minute: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          day_of_week: number
          end_minute: number
          id?: string
          label?: string | null
          staff_id: string
          start_minute: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          day_of_week?: number
          end_minute?: number
          id?: string
          label?: string | null
          staff_id?: string
          start_minute?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_breaks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_breaks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_breaks_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          display_name: string
          email: string | null
          id: string
          is_active: boolean
          is_bookable_online: boolean
          job_title: string | null
          member_id: string | null
          phone: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_name: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_bookable_online?: boolean
          job_title?: string | null
          member_id?: string | null
          phone?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_name?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_bookable_online?: boolean
          job_title?: string | null
          member_id?: string | null
          phone?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_profiles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_time_off: {
        Row: {
          branch_id: string | null
          business_id: string
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          is_all_day: boolean
          reason: string | null
          staff_id: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          is_all_day?: boolean
          reason?: string | null
          staff_id: string
          starts_at: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          is_all_day?: boolean
          reason?: string | null
          staff_id?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_time_off_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_off_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_off_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_off_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_working_hours: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          day_of_week: number
          end_minute: number
          id: string
          staff_id: string
          start_minute: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          day_of_week: number
          end_minute: number
          id?: string
          staff_id: string
          start_minute: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          day_of_week?: number
          end_minute?: number
          id?: string
          staff_id?: string
          start_minute?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_working_hours_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_working_hours_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_working_hours_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      website_sections: {
        Row: {
          business_id: string
          content: Json
          created_at: string
          deleted_at: string | null
          id: string
          is_visible: boolean
          section_type: string
          sort_order: number
          updated_at: string
          website_id: string
        }
        Insert: {
          business_id: string
          content?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_visible?: boolean
          section_type: string
          sort_order: number
          updated_at?: string
          website_id: string
        }
        Update: {
          business_id?: string
          content?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_visible?: boolean
          section_type?: string
          sort_order?: number
          updated_at?: string
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_sections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_sections_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      websites: {
        Row: {
          branch_id: string
          brand_color: string | null
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          font_key: string | null
          hero_image_path: string | null
          id: string
          is_published: boolean
          logo_path: string | null
          published_at: string | null
          radius_key: string | null
          seo_description: string | null
          seo_title: string | null
          template_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          branch_id: string
          brand_color?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          font_key?: string | null
          hero_image_path?: string | null
          id?: string
          is_published?: boolean
          logo_path?: string | null
          published_at?: string | null
          radius_key?: string | null
          seo_description?: string | null
          seo_title?: string | null
          template_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          branch_id?: string
          brand_color?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          font_key?: string | null
          hero_image_path?: string | null
          id?: string
          is_published?: boolean
          logo_path?: string | null
          published_at?: string | null
          radius_key?: string | null
          seo_description?: string | null
          seo_title?: string | null
          template_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "websites_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "websites_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "websites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "websites_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_keys: {
        Row: {
          allowed_domains: string[]
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          public_key: string
          updated_at: string
        }
        Insert: {
          allowed_domains?: string[]
          business_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          public_key: string
          updated_at?: string
        }
        Update: {
          allowed_domains?: string[]
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          public_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "widget_keys_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "widget_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: string }
      add_payment: {
        Args: {
          p_amount_minor: number
          p_invoice_id: string
          p_method: string
          p_note?: string
          p_paid_at?: string
        }
        Returns: Json
      }
      approve_appointment: { Args: { p_appointment_id: string }; Returns: Json }
      branch_is_bookable: { Args: { p_branch_id: string }; Returns: Json }
      build_form_fields_snapshot: {
        Args: { p_business_id: string }
        Returns: Json
      }
      business_is_active: { Args: { p_business_id: string }; Returns: boolean }
      can: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_permission: string
        }
        Returns: boolean
      }
      cancel_appointment: {
        Args: { p_appointment_id: string; p_reason?: string }
        Returns: Json
      }
      cancel_booking: {
        Args: { p_reason?: string; p_token: string }
        Returns: Json
      }
      check_appointment_collision: {
        Args: {
          p_branch_id: string
          p_buffer_minutes: number
          p_ends_at: string
          p_exclude_appointment_id?: string
          p_people_per_slot: number
          p_service_id: string
          p_staff_id: string
          p_starts_at: string
          p_use_resources: boolean
        }
        Returns: string
      }
      check_appointment_collision_v2: {
        Args: {
          p_branch_id: string
          p_buffer_minutes: number
          p_ends_at: string
          p_exclude_appointment_id?: string
          p_people_per_slot: number
          p_service_id: string
          p_staff_id: string
          p_starts_at: string
          p_use_resources: boolean
        }
        Returns: Database["public"]["CompositeTypes"]["appointment_collision_result"]
        SetofOptions: {
          from: "*"
          to: "appointment_collision_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_rate_limit: {
        Args: {
          p_business_id?: string
          p_endpoint: string
          p_ip_hash?: string
          p_key_hash?: string
          p_outcome?: string
        }
        Returns: Json
      }
      cleanup_public_request_attempts: {
        Args: { p_older_than?: string }
        Returns: number
      }
      create_appointment: {
        Args: {
          p_auto_confirm?: boolean
          p_branch_id: string
          p_client_email?: string
          p_client_id?: string
          p_client_name?: string
          p_client_notes?: string
          p_client_phone?: string
          p_internal_notes?: string
          p_service_id: string
          p_source?: Database["public"]["Enums"]["booking_source"]
          p_staff_id?: string
          p_starts_at: string
        }
        Returns: Json
      }
      create_booking: {
        Args: {
          p_answers?: Json
          p_branch_id: string
          p_client_email?: string
          p_client_name: string
          p_client_notes?: string
          p_client_phone: string
          p_manage_token?: string
          p_service_id: string
          p_staff_id: string
          p_starts_at: string
        }
        Returns: Json
      }
      create_business_with_owner: {
        Args: {
          p_branch_name?: string
          p_country_code: string
          p_currency: string
          p_industry?: string
          p_language?: string
          p_name: string
          p_slug: string
          p_timezone: string
        }
        Returns: string
      }
      create_credit_note: {
        Args: { p_invoice_id: string; p_net_minor?: number; p_reason: string }
        Returns: Json
      }
      create_invoice_draft: {
        Args: {
          p_appointment_id?: string
          p_branch_id?: string
          p_client_id?: string
          p_items?: Json
          p_notes?: string
        }
        Returns: Json
      }
      create_review_request_internal: {
        Args: { p_appointment_id: string }
        Returns: Json
      }
      discard_invoice_draft: { Args: { p_invoice_id: string }; Returns: Json }
      ensure_form_version: { Args: { p_business_id: string }; Returns: string }
      ensure_website: { Args: { p_business_id: string }; Returns: Json }
      ensure_widget_key: { Args: { p_business_id: string }; Returns: Json }
      format_document_number: {
        Args: { p_credit: boolean; p_prefix: string; p_seq: number }
        Returns: string
      }
      get_basic_report: {
        Args: { p_branch_id?: string; p_business_id: string }
        Returns: Json
      }
      get_booking: { Args: { p_token: string }; Returns: Json }
      get_booking_page_catalogue: {
        Args: { p_branch_id: string }
        Returns: Json
      }
      get_booking_reschedule_slots: {
        Args: { p_from_date?: string; p_to_date?: string; p_token: string }
        Returns: Json
      }
      get_calendar_appointments: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_from_date: string
          p_staff_ids?: string[]
          p_to_date: string
        }
        Returns: Json
      }
      get_free_slots: {
        Args: {
          p_branch_id: string
          p_from_date?: string
          p_ignore_notice?: boolean
          p_include_booked?: boolean
          p_service_id: string
          p_staff_id?: string
          p_to_date?: string
        }
        Returns: Database["public"]["CompositeTypes"]["free_slot"][]
        SetofOptions: {
          from: "*"
          to: "free_slot"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_invoice_print_data: { Args: { p_invoice_id: string }; Returns: Json }
      get_review_request: { Args: { p_token: string }; Returns: Json }
      get_website_public: { Args: { p_slug: string }; Returns: Json }
      get_widget_frame_ancestors: {
        Args: { p_slug: string }
        Returns: string[]
      }
      has_permission: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_permission: string
        }
        Returns: boolean
      }
      has_permission_at_branch_scope: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_permission: string
        }
        Returns: boolean
      }
      insert_invoice_items: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_invoice_id: string
          p_items: Json
        }
        Returns: undefined
      }
      invite_member: {
        Args: {
          p_branch_id?: string
          p_business_id: string
          p_email: string
          p_role_id: string
        }
        Returns: {
          out_expires_at: string
          out_member_id: string
          out_token: string
        }[]
      }
      invite_preview: {
        Args: { p_token: string }
        Returns: {
          business_name: string
          expires_at: string
          invited_email: string
        }[]
      }
      invoice_access: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_permission: string
        }
        Returns: boolean
      }
      invoice_money: { Args: { p_invoice_id: string }; Returns: Json }
      invoice_totals: {
        Args: { p_invoice_id: string; p_rate_bp: number }
        Returns: {
          discount: number
          net: number
          subtotal: number
          tax: number
          total: number
        }[]
      }
      is_allowed_appointment_transition: {
        Args: {
          p_from: Database["public"]["Enums"]["appointment_status"]
          p_to: Database["public"]["Enums"]["appointment_status"]
        }
        Returns: boolean
      }
      is_member: { Args: { p_business_id: string }; Returns: boolean }
      is_own_staff_profile: { Args: { p_staff_id: string }; Returns: boolean }
      is_owner_or_manager: {
        Args: { p_branch_id?: string; p_business_id: string }
        Returns: boolean
      }
      is_slug_available: { Args: { p_slug: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      issue_invoice: { Args: { p_invoice_id: string }; Returns: Json }
      list_appointments: {
        Args: {
          p_branch_id?: string
          p_business_id: string
          p_client_id?: string
          p_cursor_id?: string
          p_cursor_starts_at?: string
          p_from_date?: string
          p_limit?: number
          p_search?: string
          p_service_id?: string
          p_staff_id?: string
          p_status?: Database["public"]["Enums"]["appointment_status"]
          p_to_date?: string
        }
        Returns: Json
      }
      list_invoices: {
        Args: {
          p_branch_id?: string
          p_business_id: string
          p_client_id?: string
          p_cursor_at?: string
          p_cursor_id?: string
          p_from_date?: string
          p_limit?: number
          p_payment_status?: string
          p_search?: string
          p_status?: Database["public"]["Enums"]["invoice_status"]
          p_to_date?: string
        }
        Returns: Json
      }
      list_reviews: {
        Args: {
          p_branch_id?: string
          p_business_id: string
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_featured?: boolean
          p_has_reply?: boolean
          p_limit?: number
          p_rating?: number
        }
        Returns: Json
      }
      mark_completed: { Args: { p_appointment_id: string }; Returns: Json }
      mark_no_show: { Args: { p_appointment_id: string }; Returns: Json }
      member_branch_ids: { Args: { p_business_id: string }; Returns: string[] }
      my_grants: {
        Args: { p_business_id: string }
        Returns: {
          branch_id: string
          permission: string
          scope: Database["public"]["Enums"]["permission_scope"]
        }[]
      }
      my_staff_profile_id: { Args: { p_business_id: string }; Returns: string }
      normalise_invoice_items: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_items: Json
          p_may_discount: boolean
        }
        Returns: Json
      }
      normalise_phone_e164: {
        Args: { p_default_dial_code?: string; p_input: string }
        Returns: string
      }
      pick_staff_for_slot: {
        Args: {
          p_branch_id: string
          p_ends_at: string
          p_service_id: string
          p_starts_at: string
        }
        Returns: string
      }
      reissue_review_request: {
        Args: { p_appointment_id: string }
        Returns: Json
      }
      reopen_appointment: { Args: { p_appointment_id: string }; Returns: Json }
      reorder_website_sections: {
        Args: { p_business_id: string; p_order: string[] }
        Returns: Json
      }
      replace_branch_hours: {
        Args: { p_branch_id: string; p_intervals: Json }
        Returns: number
      }
      replace_staff_breaks: {
        Args: { p_branch_id: string; p_intervals: Json; p_staff_id: string }
        Returns: number
      }
      replace_staff_working_hours: {
        Args: { p_branch_id: string; p_intervals: Json; p_staff_id: string }
        Returns: number
      }
      reply_to_review: {
        Args: { p_reply: string; p_review_id: string }
        Returns: Json
      }
      report_basic_at: {
        Args: { p_as_of?: string; p_branch_id?: string; p_business_id: string }
        Returns: Json
      }
      report_windows: {
        Args: { p_as_of: string; p_branch_id: string; p_business_id: string }
        Returns: {
          branch_id: string
          branch_name: string
          can_basic: boolean
          can_rev: boolean
          currency: string
          period: string
          tz: string
          w_end: string
          w_start: string
        }[]
      }
      reschedule_booking: {
        Args: { p_staff_id?: string; p_starts_at: string; p_token: string }
        Returns: Json
      }
      resend_manage_link: {
        Args: { p_appointment_id: string; p_new_token: string }
        Returns: Json
      }
      resolve_manage_token: { Args: { p_token: string }; Returns: string }
      reverse_payment: {
        Args: {
          p_amount_minor?: number
          p_payment_id: string
          p_reason: string
        }
        Returns: Json
      }
      rotate_widget_key: { Args: { p_business_id: string }; Returns: Json }
      save_booking_settings: {
        Args: { p_branch_id: string; p_settings: Json }
        Returns: Json
      }
      save_website_section: {
        Args: {
          p_business_id: string
          p_content?: Json
          p_is_visible?: boolean
          p_section_type: string
        }
        Returns: Json
      }
      save_website_settings: {
        Args: { p_business_id: string; p_settings: Json }
        Returns: Json
      }
      save_widget_domains: {
        Args: { p_business_id: string; p_domains: string[] }
        Returns: Json
      }
      set_review_featured: {
        Args: { p_featured: boolean; p_review_id: string }
        Returns: Json
      }
      set_website_published: {
        Args: { p_business_id: string; p_published: boolean }
        Returns: Json
      }
      set_widget_active: {
        Args: { p_active: boolean; p_business_id: string }
        Returns: Json
      }
      submit_review: {
        Args: { p_comment?: string; p_rating: number; p_token: string }
        Returns: Json
      }
      suggest_invoice_prefix: {
        Args: { p_business_id: string; p_name: string }
        Returns: string
      }
      touch_manage_token: { Args: { p_token: string }; Returns: undefined }
      update_appointment: {
        Args: {
          p_appointment_id: string
          p_clear_client_notes?: boolean
          p_clear_internal_notes?: boolean
          p_client_notes?: string
          p_internal_notes?: string
          p_staff_id?: string
          p_starts_at?: string
        }
        Returns: Json
      }
      update_invoice_draft: {
        Args: {
          p_clear_client?: boolean
          p_clear_notes?: boolean
          p_client_id?: string
          p_invoice_id: string
          p_items?: Json
          p_notes?: string
        }
        Returns: Json
      }
      validate_widget_origin: {
        Args: { p_origin: string; p_public_key: string }
        Returns: Json
      }
      website_asset_path_ok: { Args: { p: string }; Returns: boolean }
      website_section_content_error: {
        Args: { p_content: Json; p_type: string }
        Returns: string
      }
      website_section_paths_error: {
        Args: { p_business_id: string; p_content: Json; p_type: string }
        Returns: string
      }
      website_str_err: {
        Args: { k: string; p: Json; p_max: number }
        Returns: string
      }
      website_template_defaults: { Args: { p_template: string }; Returns: Json }
      website_url_err: { Args: { k: string; p: Json }; Returns: string }
      widget_domains_ok: { Args: { p_domains: string[] }; Returns: boolean }
      widget_feature_enabled: {
        Args: { p_business_id: string }
        Returns: boolean
      }
      write_audit_log: {
        Args: {
          p_action: string
          p_after?: Json
          p_before?: Json
          p_business_id: string
          p_entity_id?: string
          p_entity_type?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      appointment_status:
        | "pending"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      booking_confirmation_mode: "auto" | "manual"
      booking_source: "online" | "dashboard" | "walk_in" | "portal"
      business_plan: "solo" | "team" | "business"
      business_status: "trialing" | "active" | "inactive" | "suspended"
      custom_field_type:
        | "short_text"
        | "long_text"
        | "dropdown"
        | "yes_no"
        | "number"
      invoice_payment_kind: "payment" | "reversal"
      invoice_payment_method: "cash" | "card" | "bank_transfer"
      invoice_status: "draft" | "issued"
      member_status: "invited" | "active" | "disabled"
      permission_scope: "own" | "branch" | "all"
      slot_display_mode: "only_available" | "all_greyed"
      slot_interval_mode: "min_15" | "min_30" | "min_60" | "service_length"
      staff_choice_mode: "hidden" | "optional" | "required"
    }
    CompositeTypes: {
      appointment_collision_result: {
        code: string | null
        resource_id: string | null
        resource_capacity: number | null
      }
      free_slot: {
        starts_at: string | null
        ends_at: string | null
        local_date: string | null
        local_minute: number | null
        staff_id: string | null
        resource_id: string | null
        seats_left: number | null
        available: boolean | null
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      appointment_status: [
        "pending",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      booking_confirmation_mode: ["auto", "manual"],
      booking_source: ["online", "dashboard", "walk_in", "portal"],
      business_plan: ["solo", "team", "business"],
      business_status: ["trialing", "active", "inactive", "suspended"],
      custom_field_type: [
        "short_text",
        "long_text",
        "dropdown",
        "yes_no",
        "number",
      ],
      invoice_payment_kind: ["payment", "reversal"],
      invoice_payment_method: ["cash", "card", "bank_transfer"],
      invoice_status: ["draft", "issued"],
      member_status: ["invited", "active", "disabled"],
      permission_scope: ["own", "branch", "all"],
      slot_display_mode: ["only_available", "all_greyed"],
      slot_interval_mode: ["min_15", "min_30", "min_60", "service_length"],
      staff_choice_mode: ["hidden", "optional", "required"],
    },
  },
} as const
