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
      addons: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          key: string
          name: string
          price_monthly_minor: number
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          key: string
          name: string
          price_monthly_minor: number
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          key?: string
          name?: string
          price_monthly_minor?: number
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addons_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          scheduled_at: string
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
          scheduled_at?: string
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
          scheduled_at?: string
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
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
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
      business_addons: {
        Row: {
          addon_key: string
          business_id: string
          created_at: string
          enabled: boolean
          enabled_by: string | null
          updated_at: string
        }
        Insert: {
          addon_key: string
          business_id: string
          created_at?: string
          enabled?: boolean
          enabled_by?: string | null
          updated_at?: string
        }
        Update: {
          addon_key?: string
          business_id?: string
          created_at?: string
          enabled?: boolean
          enabled_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_addons_addon_key_fkey"
            columns: ["addon_key"]
            isOneToOne: false
            referencedRelation: "addons"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "business_addons_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_addons_enabled_by_fkey"
            columns: ["enabled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          permissions_version: number
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
          permissions_version?: number
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
          permissions_version?: number
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
      business_subscriptions: {
        Row: {
          assigned_by: string | null
          business_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          notes: string | null
          plan: Database["public"]["Enums"]["business_plan"] | null
          status: Database["public"]["Enums"]["business_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          business_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          notes?: string | null
          plan?: Database["public"]["Enums"]["business_plan"] | null
          status?: Database["public"]["Enums"]["business_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          business_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          notes?: string | null
          plan?: Database["public"]["Enums"]["business_plan"] | null
          status?: Database["public"]["Enums"]["business_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_subscriptions_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
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
      client_consents: {
        Row: {
          business_id: string
          client_id: string
          photo_consent: boolean
          recorded_at: string
          recorded_by: string | null
        }
        Insert: {
          business_id: string
          client_id: string
          photo_consent?: boolean
          recorded_at?: string
          recorded_by?: string | null
        }
        Update: {
          business_id?: string
          client_id?: string
          photo_consent?: boolean
          recorded_at?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_consents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_consents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_consents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
        ]
      }
      client_package_cancellations: {
        Row: {
          business_id: string
          client_package_id: string
          created_at: string
          created_by: string | null
          credit_note_id: string
        }
        Insert: {
          business_id: string
          client_package_id: string
          created_at?: string
          created_by?: string | null
          credit_note_id: string
        }
        Update: {
          business_id?: string
          client_package_id?: string
          created_at?: string
          created_by?: string | null
          credit_note_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_package_cancellations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_package_cancellations_client_package_id_fkey"
            columns: ["client_package_id"]
            isOneToOne: true
            referencedRelation: "client_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_package_cancellations_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      client_package_services: {
        Row: {
          business_id: string
          client_package_id: string
          service_id: string
        }
        Insert: {
          business_id: string
          client_package_id: string
          service_id: string
        }
        Update: {
          business_id?: string
          client_package_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_package_services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_package_services_client_package_id_fkey"
            columns: ["client_package_id"]
            isOneToOne: false
            referencedRelation: "client_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_package_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      client_packages: {
        Row: {
          branch_id: string
          business_id: string
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          expires_at: string | null
          id: string
          invoice_id: string
          invoice_item_id: string
          name: string
          package_id: string | null
          price_minor: number
          sessions_bonus: number
          sessions_purchased: number
          sold_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          currency: string
          expires_at?: string | null
          id?: string
          invoice_id: string
          invoice_item_id: string
          name: string
          package_id?: string | null
          price_minor: number
          sessions_bonus?: number
          sessions_purchased: number
          sold_at: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          expires_at?: string | null
          id?: string
          invoice_id?: string
          invoice_item_id?: string
          name?: string
          package_id?: string | null
          price_minor?: number
          sessions_bonus?: number
          sessions_purchased?: number
          sold_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_packages_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_packages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_packages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_packages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_packages_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_packages_invoice_item_id_fkey"
            columns: ["invoice_item_id"]
            isOneToOne: true
            referencedRelation: "invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
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
          erased_at: string | null
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
          erased_at?: string | null
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
          erased_at?: string | null
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
      commission_entries: {
        Row: {
          amount_minor: number
          branch_id: string
          business_id: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          invoice_id: string
          invoice_item_id: string
          kind: Database["public"]["Enums"]["commission_entry_kind"]
          reason: string
          source_credit_note_id: string | null
          source_payment_id: string | null
          staff_id: string
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
          invoice_item_id: string
          kind: Database["public"]["Enums"]["commission_entry_kind"]
          reason: string
          source_credit_note_id?: string | null
          source_payment_id?: string | null
          staff_id: string
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
          invoice_item_id?: string
          kind?: Database["public"]["Enums"]["commission_entry_kind"]
          reason?: string
          source_credit_note_id?: string | null
          source_payment_id?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_invoice_item_id_fkey"
            columns: ["invoice_item_id"]
            isOneToOne: false
            referencedRelation: "invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_source_credit_note_id_fkey"
            columns: ["source_credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_source_payment_id_fkey"
            columns: ["source_payment_id"]
            isOneToOne: false
            referencedRelation: "invoice_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_lines: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          currency: string
          flat_minor: number | null
          full_commission_minor: number
          invoice_id: string
          invoice_item_id: string
          line_net_minor: number
          percent_bp: number | null
          quantity: number
          rule_id: string | null
          rule_kind: string
          staff_id: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          currency: string
          flat_minor?: number | null
          full_commission_minor: number
          invoice_id: string
          invoice_item_id: string
          line_net_minor: number
          percent_bp?: number | null
          quantity: number
          rule_id?: string | null
          rule_kind: string
          staff_id: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          currency?: string
          flat_minor?: number | null
          full_commission_minor?: number
          invoice_id?: string
          invoice_item_id?: string
          line_net_minor?: number
          percent_bp?: number | null
          quantity?: number
          rule_id?: string | null
          rule_kind?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_lines_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_lines_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_lines_invoice_item_id_fkey"
            columns: ["invoice_item_id"]
            isOneToOne: true
            referencedRelation: "invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_lines_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_lines_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          currency: string | null
          effective_from: string
          flat_minor: number | null
          id: string
          kind: Database["public"]["Enums"]["commission_rule_kind"]
          percent_bp: number | null
          service_id: string | null
          staff_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          effective_from: string
          flat_minor?: number | null
          id?: string
          kind: Database["public"]["Enums"]["commission_rule_kind"]
          percent_bp?: number | null
          service_id?: string | null
          staff_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          effective_from?: string
          flat_minor?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["commission_rule_kind"]
          percent_bp?: number | null
          service_id?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
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
      data_requests: {
        Row: {
          business_id: string
          created_at: string
          email_hash: string | null
          id: string
          kind: string
          requester_email: string | null
          resolved_at: string | null
          resolved_by: string | null
          source: string
          status: string
        }
        Insert: {
          business_id: string
          created_at?: string
          email_hash?: string | null
          id?: string
          kind: string
          requester_email?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          status?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          email_hash?: string | null
          id?: string
          kind?: string
          requester_email?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erasure_log: {
        Row: {
          business_id: string
          counts: Json
          erased_at: string
          id: string
          requested_by: string | null
        }
        Insert: {
          business_id: string
          counts?: Json
          erased_at?: string
          id?: string
          requested_by?: string | null
        }
        Update: {
          business_id?: string
          counts?: Json
          erased_at?: string
          id?: string
          requested_by?: string | null
        }
        Relationships: []
      }
      files: {
        Row: {
          appointment_id: string | null
          business_id: string
          category: string
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          kind: string
          mime_type: string
          original_name: string
          ready_at: string | null
          size_bytes: number
          status: string
          storage_path: string
        }
        Insert: {
          appointment_id?: string | null
          business_id: string
          category: string
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          kind: string
          mime_type: string
          original_name: string
          ready_at?: string | null
          size_bytes: number
          status?: string
          storage_path: string
        }
        Update: {
          appointment_id?: string | null
          business_id?: string
          category?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          kind?: string
          mime_type?: string
          original_name?: string
          ready_at?: string | null
          size_bytes?: number
          status?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
        ]
      }
      form_requests: {
        Row: {
          appointment_id: string | null
          branch_id: string
          business_id: string
          client_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          revoked_at: string | null
          template_version_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          branch_id: string
          business_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          revoked_at?: string | null
          template_version_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          branch_id?: string
          business_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          revoked_at?: string | null
          template_version_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_requests_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_requests_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "form_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_template_services: {
        Row: {
          business_id: string
          service_id: string
          template_id: string
        }
        Insert: {
          business_id: string
          service_id: string
          template_id: string
        }
        Update: {
          business_id?: string
          service_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_template_services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_template_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_template_services_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_template_versions: {
        Row: {
          body: Json
          business_id: string
          created_at: string
          created_by: string | null
          digest: string
          fields: Json
          id: string
          kind: string
          requires_signature: boolean
          template_id: string
          title: string
          version: number
        }
        Insert: {
          body?: Json
          business_id: string
          created_at?: string
          created_by?: string | null
          digest: string
          fields?: Json
          id?: string
          kind: string
          requires_signature?: boolean
          template_id: string
          title: string
          version: number
        }
        Update: {
          body?: Json
          business_id?: string
          created_at?: string
          created_by?: string | null
          digest?: string
          fields?: Json
          id?: string
          kind?: string
          requires_signature?: boolean
          template_id?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_template_versions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          kind: string
          title: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          kind: string
          title: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
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
      industry_presets: {
        Row: {
          active: boolean
          created_at: string
          key: string
          name: string
          sort_order: number
          starter_custom_fields: Json
          template_key: string
          terminology: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          key: string
          name: string
          sort_order?: number
          starter_custom_fields?: Json
          template_key?: string
          terminology?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          key?: string
          name?: string
          sort_order?: number
          starter_custom_fields?: Json
          template_key?: string
          terminology?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "industry_presets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_settings: {
        Row: {
          allow_negative_stock: boolean
          branch_id: string
          business_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_negative_stock?: boolean
          branch_id: string
          business_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_negative_stock?: boolean
          branch_id?: string
          business_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_settings_business_id_fkey"
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
          package_id: string | null
          product_id: string | null
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
          package_id?: string | null
          product_id?: string | null
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
          package_id?: string | null
          product_id?: string | null
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
            foreignKeyName: "invoice_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
      invoice_payment_state: {
        Row: {
          business_id: string
          invoice_id: string
          payment_status: string | null
        }
        Insert: {
          business_id: string
          invoice_id: string
          payment_status?: string | null
        }
        Update: {
          business_id?: string
          invoice_id?: string
          payment_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payment_state_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_state_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
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
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
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
      message_outbox: {
        Row: {
          appointment_id: string | null
          attempts: number
          branch_id: string
          business_id: string
          channel: string
          claimed_at: string | null
          client_id: string | null
          created_at: string
          deliver_after: string
          event: string
          finished_at: string | null
          id: string
          idem_suffix: number
          idempotency_key: string
          last_error: string | null
          locked_until: string | null
          max_attempts: number
          payload: Json
          provider_call_at: string | null
          review_request_id: string | null
          sealed: string | null
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          attempts?: number
          branch_id: string
          business_id: string
          channel: string
          claimed_at?: string | null
          client_id?: string | null
          created_at?: string
          deliver_after?: string
          event: string
          finished_at?: string | null
          id?: string
          idem_suffix?: number
          idempotency_key: string
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          payload?: Json
          provider_call_at?: string | null
          review_request_id?: string | null
          sealed?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          attempts?: number
          branch_id?: string
          business_id?: string
          channel?: string
          claimed_at?: string | null
          client_id?: string | null
          created_at?: string
          deliver_after?: string
          event?: string
          finished_at?: string | null
          id?: string
          idem_suffix?: number
          idempotency_key?: string
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          payload?: Json
          provider_call_at?: string | null
          review_request_id?: string | null
          sealed?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_outbox_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_review_request_id_fkey"
            columns: ["review_request_id"]
            isOneToOne: false
            referencedRelation: "review_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      message_suppressions: {
        Row: {
          business_id: string
          channel: string
          created_at: string
          id: string
          recipient_hash: string
          source: string
        }
        Insert: {
          business_id: string
          channel: string
          created_at?: string
          id?: string
          recipient_hash: string
          source: string
        }
        Update: {
          business_id?: string
          channel?: string
          created_at?: string
          id?: string
          recipient_hash?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_suppressions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          appointment_id: string | null
          branch_id: string | null
          business_id: string
          channel: string
          code: string | null
          created_at: string
          credits: number | null
          encoding: string | null
          error: string | null
          event: string
          id: number
          outbox_id: string | null
          provider: string | null
          provider_id: string | null
          recipient_hash: string | null
          recipient_masked: string | null
          segments: number | null
          status: string
        }
        Insert: {
          appointment_id?: string | null
          branch_id?: string | null
          business_id: string
          channel: string
          code?: string | null
          created_at?: string
          credits?: number | null
          encoding?: string | null
          error?: string | null
          event: string
          id?: never
          outbox_id?: string | null
          provider?: string | null
          provider_id?: string | null
          recipient_hash?: string | null
          recipient_masked?: string | null
          segments?: number | null
          status: string
        }
        Update: {
          appointment_id?: string | null
          branch_id?: string | null
          business_id?: string
          channel?: string
          code?: string | null
          created_at?: string
          credits?: number | null
          encoding?: string | null
          error?: string | null
          event?: string
          id?: never
          outbox_id?: string | null
          provider?: string | null
          provider_id?: string | null
          recipient_hash?: string | null
          recipient_masked?: string | null
          segments?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "message_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_limits: {
        Row: {
          key: string
          note: string | null
          value: number
        }
        Insert: {
          key: string
          note?: string | null
          value: number
        }
        Update: {
          key?: string
          note?: string | null
          value?: number
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          quiet_end_minute: number
          quiet_start_minute: number
          reminder_hours_before: number
          reminders_enabled: boolean
          review_requests_enabled: boolean
          sms_enabled: boolean
          updated_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          quiet_end_minute?: number
          quiet_start_minute?: number
          reminder_hours_before?: number
          reminders_enabled?: boolean
          review_requests_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          quiet_end_minute?: number
          quiet_start_minute?: number
          reminder_hours_before?: number
          reminders_enabled?: boolean
          review_requests_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      package_services: {
        Row: {
          business_id: string
          package_id: string
          service_id: string
        }
        Insert: {
          business_id: string
          package_id: string
          service_id: string
        }
        Update: {
          business_id?: string
          package_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_services_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          bonus_sessions: number
          branch_id: string
          business_id: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          description: string | null
          expiry_days: number | null
          id: string
          is_active: boolean
          name: string
          price_minor: number
          sessions: number
          updated_at: string
        }
        Insert: {
          bonus_sessions?: number
          branch_id: string
          business_id: string
          created_at?: string
          created_by?: string | null
          currency: string
          deleted_at?: string | null
          description?: string | null
          expiry_days?: number | null
          id?: string
          is_active?: boolean
          name: string
          price_minor: number
          sessions: number
          updated_at?: string
        }
        Update: {
          bonus_sessions?: number
          branch_id?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string | null
          expiry_days?: number | null
          id?: string
          is_active?: boolean
          name?: string
          price_minor?: number
          sessions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
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
      plans: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          features: Json
          key: Database["public"]["Enums"]["business_plan"]
          max_branches: number | null
          name: string
          price_annual_minor: number
          price_monthly_minor: number
          sort_order: number
          staff_cap: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          features?: Json
          key: Database["public"]["Enums"]["business_plan"]
          max_branches?: number | null
          name: string
          price_annual_minor: number
          price_monthly_minor: number
          sort_order?: number
          staff_cap?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          features?: Json
          key?: Database["public"]["Enums"]["business_plan"]
          max_branches?: number | null
          name?: string
          price_annual_minor?: number
          price_monthly_minor?: number
          sort_order?: number
          staff_cap?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_login_tokens: {
        Row: {
          business_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          revoked_at: string | null
          token_hash: string
          used_at: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          token_hash: string
          used_at?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_login_tokens_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_sessions: {
        Row: {
          business_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          ip_hash: string | null
          last_seen_at: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          business_id: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          ip_hash?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          ip_hash?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          id: string
          is_active: boolean
          low_stock_threshold: number | null
          name: string
          price_minor: number
          sku: string | null
          stock_qty: number
          unit: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          created_by?: string | null
          currency: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          low_stock_threshold?: number | null
          name: string
          price_minor?: number
          sku?: string | null
          stock_qty?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          low_stock_threshold?: number | null
          name?: string
          price_minor?: number
          sku?: string | null
          stock_qty?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
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
      push_preferences: {
        Row: {
          business_id: string
          cancelled: boolean
          new_booking: boolean
          pending_approval: boolean
          reminder: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          cancelled?: boolean
          new_booking?: boolean
          pending_approval?: boolean
          reminder?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          cancelled?: boolean
          new_booking?: boolean
          pending_approval?: boolean
          reminder?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_preferences_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
          web_keys: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
          web_keys?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
          web_keys?: Json | null
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
      report_schedules: {
        Row: {
          branch_id: string | null
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          frequency: string
          id: string
          is_enabled: boolean
          last_period_end: string | null
          send_hour: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          frequency: string
          id?: string
          is_enabled?: boolean
          last_period_end?: string | null
          send_hour?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          frequency?: string
          id?: string
          is_enabled?: boolean
          last_period_end?: string | null
          send_hour?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_schedules_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_schedules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "review_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
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
            foreignKeyName: "reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
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
          created_by: string | null
          deleted_at: string | null
          id: string
          is_system: boolean
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_system?: boolean
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
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
          {
            foreignKeyName: "roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      session_usages: {
        Row: {
          appointment_id: string | null
          branch_id: string
          business_id: string
          client_package_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["session_usage_kind"]
          reason: string | null
          reverses_usage_id: string | null
          service_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          branch_id: string
          business_id: string
          client_package_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["session_usage_kind"]
          reason?: string | null
          reverses_usage_id?: string | null
          service_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          branch_id?: string
          business_id?: string
          client_package_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["session_usage_kind"]
          reason?: string | null
          reverses_usage_id?: string | null
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_usages_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_usages_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_usages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_usages_client_package_id_fkey"
            columns: ["client_package_id"]
            isOneToOne: false
            referencedRelation: "client_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_usages_reverses_usage_id_fkey"
            columns: ["reverses_usage_id"]
            isOneToOne: false
            referencedRelation: "session_usages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_usages_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      signed_consent_voids: {
        Row: {
          business_id: string
          reason: string
          signed_consent_id: string
          voided_at: string
          voided_by: string | null
        }
        Insert: {
          business_id: string
          reason: string
          signed_consent_id: string
          voided_at?: string
          voided_by?: string | null
        }
        Update: {
          business_id?: string
          reason?: string
          signed_consent_id?: string
          voided_at?: string
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signed_consent_voids_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signed_consent_voids_signed_consent_id_fkey"
            columns: ["signed_consent_id"]
            isOneToOne: true
            referencedRelation: "signed_consents"
            referencedColumns: ["id"]
          },
        ]
      }
      signed_consents: {
        Row: {
          answers: Json
          appointment_id: string | null
          branch_id: string
          business_id: string
          captured_by: string | null
          client_id: string
          id: string
          ip_hash: string | null
          request_id: string | null
          signature: Json | null
          signed_at: string
          signed_via: string
          signer_name: string
          template_id: string
          template_version_id: string
        }
        Insert: {
          answers?: Json
          appointment_id?: string | null
          branch_id: string
          business_id: string
          captured_by?: string | null
          client_id: string
          id?: string
          ip_hash?: string | null
          request_id?: string | null
          signature?: Json | null
          signed_at?: string
          signed_via: string
          signer_name: string
          template_id: string
          template_version_id: string
        }
        Update: {
          answers?: Json
          appointment_id?: string | null
          branch_id?: string
          business_id?: string
          captured_by?: string | null
          client_id?: string
          id?: string
          ip_hash?: string | null
          request_id?: string | null
          signature?: Json | null
          signed_at?: string
          signed_via?: string
          signer_name?: string
          template_id?: string
          template_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signed_consents_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signed_consents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signed_consents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signed_consents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signed_consents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signed_consents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "form_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signed_consents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signed_consents_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "form_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_country_rates: {
        Row: {
          country_code: string
          credits_per_segment: number
          dial_code: string
          note: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          country_code: string
          credits_per_segment: number
          dial_code: string
          note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          country_code?: string
          credits_per_segment?: number
          dial_code?: string
          note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sms_credit_accounts: {
        Row: {
          balance: number
          business_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          business_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          business_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_credit_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_credit_ledger: {
        Row: {
          amount: number
          attempt: number | null
          balance_after: number
          business_id: string
          created_at: string
          created_by: string | null
          dial_code: string | null
          encoding: string | null
          id: number
          kind: string
          note: string | null
          outbox_id: string | null
          ref_ledger_id: number | null
          segments: number | null
        }
        Insert: {
          amount: number
          attempt?: number | null
          balance_after: number
          business_id: string
          created_at?: string
          created_by?: string | null
          dial_code?: string | null
          encoding?: string | null
          id?: never
          kind: string
          note?: string | null
          outbox_id?: string | null
          ref_ledger_id?: number | null
          segments?: number | null
        }
        Update: {
          amount?: number
          attempt?: number | null
          balance_after?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          dial_code?: string | null
          encoding?: string | null
          id?: never
          kind?: string
          note?: string | null
          outbox_id?: string | null
          ref_ledger_id?: number | null
          segments?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_credit_ledger_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_credit_ledger_ref_ledger_id_fkey"
            columns: ["ref_ledger_id"]
            isOneToOne: false
            referencedRelation: "sms_credit_ledger"
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
      stock_movements: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          created_by: string | null
          credit_note_id: string | null
          id: string
          invoice_id: string | null
          invoice_item_id: string | null
          kind: Database["public"]["Enums"]["stock_movement_kind"]
          product_id: string
          quantity: number
          reason: string | null
          stock_after: number
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          created_by?: string | null
          credit_note_id?: string | null
          id?: string
          invoice_id?: string | null
          invoice_item_id?: string | null
          kind: Database["public"]["Enums"]["stock_movement_kind"]
          product_id: string
          quantity: number
          reason?: string | null
          stock_after: number
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          credit_note_id?: string | null
          id?: string
          invoice_id?: string | null
          invoice_item_id?: string | null
          kind?: Database["public"]["Enums"]["stock_movement_kind"]
          product_id?: string
          quantity?: number
          reason?: string | null
          stock_after?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_invoice_item_id_fkey"
            columns: ["invoice_item_id"]
            isOneToOne: false
            referencedRelation: "invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_cleanup_queue: {
        Row: {
          bucket: string
          business_id: string
          client_id: string | null
          created_at: string
          done_at: string | null
          id: string
          path: string
        }
        Insert: {
          bucket: string
          business_id: string
          client_id?: string | null
          created_at?: string
          done_at?: string | null
          id?: string
          path: string
        }
        Update: {
          bucket?: string
          business_id?: string
          client_id?: string | null
          created_at?: string
          done_at?: string | null
          id?: string
          path?: string
        }
        Relationships: []
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
      clients_v: {
        Row: {
          business_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          email: string | null
          erased_at: string | null
          first_branch_id: string | null
          full_name: string | null
          id: string | null
          notes: string | null
          phone_e164: string | null
          source: Database["public"]["Enums"]["booking_source"] | null
          updated_at: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: never
          erased_at?: string | null
          first_branch_id?: string | null
          full_name?: string | null
          id?: string | null
          notes?: never
          phone_e164?: never
          source?: Database["public"]["Enums"]["booking_source"] | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: never
          erased_at?: string | null
          first_branch_id?: string | null
          full_name?: string | null
          id?: string | null
          notes?: never
          phone_e164?: never
          source?: Database["public"]["Enums"]["booking_source"] | null
          updated_at?: string | null
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
    }
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: string }
      account_delete_blockers: { Args: never; Returns: Json }
      account_delete_commit: { Args: { p_user_id: string }; Returns: Json }
      account_sole_owner_businesses: {
        Args: { p_user_id: string }
        Returns: Json
      }
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
      addon_access: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_permission: string
        }
        Returns: boolean
      }
      addon_read_access: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_feature: string
          p_permissions: string[]
        }
        Returns: boolean
      }
      adjust_stock: {
        Args: {
          p_kind: string
          p_product_id: string
          p_quantity: number
          p_reason?: string
        }
        Returns: Json
      }
      admin_add_sms_credits: {
        Args: { p_business: string; p_credits: number; p_note?: string }
        Returns: Json
      }
      admin_gate: { Args: never; Returns: string }
      admin_list_reviews: {
        Args: {
          p_business_id: string
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_limit?: number
        }
        Returns: Json
      }
      admin_set_sms_rate: {
        Args: {
          p_country: string
          p_credits: number
          p_dial: string
          p_note?: string
        }
        Returns: Json
      }
      adv_appointments: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_from: string
          p_service?: boolean
          p_to: string
        }
        Returns: Json
      }
      adv_branches: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_from: string
          p_service?: boolean
          p_to: string
        }
        Returns: Json
      }
      adv_clients: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_from: string
          p_prev_from?: string
          p_prev_to?: string
          p_service?: boolean
          p_to: string
        }
        Returns: Json
      }
      adv_revenue: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_from: string
          p_service?: boolean
          p_to: string
        }
        Returns: Json
      }
      adv_services: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_from: string
          p_service?: boolean
          p_to: string
        }
        Returns: Json
      }
      adv_staff: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_from: string
          p_service?: boolean
          p_to: string
        }
        Returns: Json
      }
      adv_visible_branches: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_from: string
          p_service?: boolean
          p_to: string
        }
        Returns: {
          archived: boolean
          branch_id: string
          can_comm: boolean
          can_rev: boolean
          currency: string
          name: string
          tz: string
          we: string
          ws: string
        }[]
      }
      appointment_forms: { Args: { p_appointment_id: string }; Returns: Json }
      approve_appointment: { Args: { p_appointment_id: string }; Returns: Json }
      archive_branch: { Args: { p_branch_id: string }; Returns: Json }
      assign_member_role: {
        Args: { p_branch_id?: string; p_member_id: string; p_role_id: string }
        Returns: Json
      }
      assign_plan: {
        Args: {
          p_business_id: string
          p_notes?: string
          p_period_end?: string
          p_plan: string
        }
        Returns: Json
      }
      bp_of: { Args: { p_part: number; p_whole: number }; Returns: number }
      branch_admin_gate: { Args: { p_business_id: string }; Returns: Json }
      branch_archive_blockers: { Args: { p_branch_id: string }; Returns: Json }
      branch_is_bookable: { Args: { p_branch_id: string }; Returns: Json }
      branch_metrics: {
        Args: {
          p_branch_id?: string
          p_business_id: string
          p_from: string
          p_to: string
        }
        Returns: {
          appt_cancelled: number
          appt_completed: number
          appt_confirmed: number
          appt_no_show: number
          appt_pending: number
          appt_total: number
          archived: boolean
          branch_id: string
          branch_name: string
          can_basic: boolean
          can_rev: boolean
          collected_minor: number
          country_code: string
          credited_minor: number
          currency: string
          invoice_count: number
          invoiced_minor: number
          net_revenue_minor: number
          tax_minor: number
          tz: string
          w_end: string
          w_start: string
        }[]
      }
      build_form_fields_snapshot: {
        Args: { p_business_id: string }
        Returns: Json
      }
      bump_role_members: { Args: { p_role_id: string }; Returns: undefined }
      business_has_feature: {
        Args: { p_business_id: string; p_key: string }
        Returns: boolean
      }
      business_is_active: { Args: { p_business_id: string }; Returns: boolean }
      business_plan_limits: { Args: { p_business_id: string }; Returns: Json }
      can: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_permission: string
        }
        Returns: boolean
      }
      can_define_at: {
        Args: {
          p_business_id: string
          p_permission: string
          p_scope: Database["public"]["Enums"]["permission_scope"]
        }
        Returns: boolean
      }
      can_grant_at: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_permission: string
          p_scope: Database["public"]["Enums"]["permission_scope"]
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
      check_staff_cap: {
        Args: { p_branch_id: string; p_business_id: string; p_extra: number }
        Returns: undefined
      }
      cleanup_public_request_attempts: {
        Args: { p_older_than?: string }
        Returns: number
      }
      client_access: {
        Args: {
          p_business_id: string
          p_client_id: string
          p_permission: string
        }
        Returns: boolean
      }
      client_has_live_appt: { Args: { p_client_id: string }; Returns: boolean }
      client_in_scope: {
        Args: {
          p_business_id: string
          p_client_id: string
          p_first_branch: string
          p_permission: string
        }
        Returns: boolean
      }
      client_package_used: {
        Args: { p_client_package_id: string }
        Returns: number
      }
      commission_can_see: {
        Args: { p_branch_id: string; p_business_id: string; p_staff_id: string }
        Returns: boolean
      }
      commission_sync: {
        Args: {
          p_credit_note_id?: string
          p_invoice_id: string
          p_payment_id?: string
        }
        Returns: undefined
      }
      commission_visible_branches: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_from: string
          p_to: string
        }
        Returns: {
          branch_id: string
          see_all: boolean
          tz: string
          w_end: string
          w_start: string
        }[]
      }
      contact_business_ids: { Args: never; Returns: string[] }
      covers_every_branch: {
        Args: { p_business_id: string; p_permission: string }
        Returns: boolean
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
      create_branch: {
        Args: {
          p_address?: string
          p_business_id: string
          p_copy_from_branch?: string
          p_country_code: string
          p_currency: string
          p_invoice_prefix?: string
          p_name: string
          p_phone?: string
          p_tax_number?: string
          p_tax_rate_bp?: number
          p_timezone: string
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
      create_custom_role: {
        Args: {
          p_business_id: string
          p_clone_from?: string
          p_name: string
          p_permissions?: Json
        }
        Returns: Json
      }
      create_form_request: {
        Args: {
          p_appointment_id: string
          p_client_id: string
          p_send?: boolean
          p_template_id: string
        }
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
      create_signed_consent: {
        Args: {
          p_answers: Json
          p_appointment_id: string
          p_by: string
          p_client_id: string
          p_ip_hash: string
          p_request_id: string
          p_signature: Json
          p_signer_name: string
          p_version_id: string
          p_via: string
        }
        Returns: Json
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      deduct_session: {
        Args: { p_appointment_id: string; p_client_package_id: string }
        Returns: Json
      }
      deduct_session_at: {
        Args: {
          p_appointment_id: string
          p_client_package_id: string
          p_now: string
        }
        Returns: Json
      }
      delete_custom_role: {
        Args: { p_replacement_role_id?: string; p_role_id: string }
        Returns: Json
      }
      delete_file: {
        Args: { p_file_id: string; p_reason?: string }
        Returns: Json
      }
      delete_form_template: { Args: { p_template_id: string }; Returns: Json }
      delete_package: { Args: { p_package_id: string }; Returns: Json }
      delete_product: { Args: { p_product_id: string }; Returns: Json }
      delete_report_schedule: { Args: { p_schedule_id: string }; Returns: Json }
      discard_invoice_draft: { Args: { p_invoice_id: string }; Returns: Json }
      enqueue_due_reminders: { Args: never; Returns: number }
      enqueue_due_reminders_at: { Args: { p_now: string }; Returns: number }
      enqueue_due_report_summaries: { Args: never; Returns: number }
      enqueue_due_report_summaries_at: {
        Args: { p_now: string }
        Returns: number
      }
      enqueue_low_stock: {
        Args: { p_movement_id: string; p_product_id: string; p_stock: number }
        Returns: undefined
      }
      ensure_form_version: { Args: { p_business_id: string }; Returns: string }
      ensure_website: { Args: { p_business_id: string }; Returns: Json }
      ensure_widget_key: { Args: { p_business_id: string }; Returns: Json }
      extend_trial: {
        Args: { p_business_id: string; p_days: number }
        Returns: Json
      }
      feature_gate_error: {
        Args: { p_business_id: string; p_key: string }
        Returns: Json
      }
      file_visible: {
        Args: { p_business_id: string; p_client_id: string }
        Returns: boolean
      }
      files_access: {
        Args: { p_file_ids: string[] }
        Returns: {
          file_id: string
          mime: string
          name: string
          path: string
        }[]
      }
      files_finalize: {
        Args: {
          p_detected_mime: string
          p_file_id: string
          p_size: number
          p_user_id: string
        }
        Returns: Json
      }
      files_prepare_upload: {
        Args: {
          p_appointment_id: string
          p_category: string
          p_client_id: string
          p_mime: string
          p_original_name: string
          p_size: number
        }
        Returns: Json
      }
      format_document_number: {
        Args: { p_credit: boolean; p_prefix: string; p_seq: number }
        Returns: string
      }
      forms_can_sign: {
        Args: { p_business_id: string; p_client_id: string }
        Returns: boolean
      }
      forms_read_access: { Args: { p_business_id: string }; Returns: boolean }
      gdpr_allowed: {
        Args: { p_business_id: string; p_permission: string }
        Returns: boolean
      }
      gdpr_business_erase_check: {
        Args: { p_business_id: string; p_confirm_name: string }
        Returns: Json
      }
      gdpr_erase_business_commit: {
        Args: { p_business_id: string; p_confirm_name: string }
        Returns: Json
      }
      gdpr_erase_client: { Args: { p_client_id: string }; Returns: Json }
      gdpr_erasing: { Args: never; Returns: boolean }
      gdpr_export_client: { Args: { p_client_id: string }; Returns: Json }
      gdpr_storage_done: { Args: { p_ids: string[] }; Returns: number }
      get_advanced_report: {
        Args: {
          p_anchor?: string
          p_branch_id?: string
          p_business_id: string
          p_from?: string
          p_period: string
          p_section: string
          p_to?: string
        }
        Returns: Json
      }
      get_appointment_messages: {
        Args: { p_appointment_id: string }
        Returns: Json
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
      get_business_detail: { Args: { p_business_id: string }; Returns: Json }
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
      get_client_files_state: { Args: { p_client_id: string }; Returns: Json }
      get_combined_overview: {
        Args: { p_business_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_commission_report: {
        Args: {
          p_branch_id?: string
          p_business_id: string
          p_from: string
          p_staff_id?: string
          p_to: string
        }
        Returns: Json
      }
      get_form_request: { Args: { p_token: string }; Returns: Json }
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
      get_signed_consent: { Args: { p_id: string }; Returns: Json }
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
      internal_secret: { Args: { p_name: string }; Returns: string }
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
      invoke_outbox_worker: { Args: never; Returns: number }
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
      list_business_member_names: {
        Args: { p_business_id: string }
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      list_businesses: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_limit?: number
          p_plan?: string
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      list_client_files: {
        Args: {
          p_appointment_id?: string
          p_before_at?: string
          p_before_id?: string
          p_client_id: string
          p_limit?: number
        }
        Returns: Json
      }
      list_client_packages: {
        Args: {
          p_client_id: string
          p_service_id?: string
          p_usable_only?: boolean
        }
        Returns: {
          branch_id: string
          currency: string
          expires_at: string
          id: string
          invoice_id: string
          is_cancelled: boolean
          is_expired: boolean
          name: string
          price_minor: number
          remaining: number
          service_ids: string[]
          sessions_bonus: number
          sessions_purchased: number
          sold_at: string
          used: number
        }[]
      }
      list_data_requests: {
        Args: { p_business_id: string; p_status?: string }
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
      list_my_branches: {
        Args: { p_business_id: string; p_include_archived?: boolean }
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
      list_roles: { Args: { p_business_id: string }; Returns: Json }
      list_signed_consents: {
        Args: { p_appointment_id?: string; p_client_id: string }
        Returns: Json
      }
      log_account_event: { Args: { p_event: string }; Returns: Json }
      low_stock_count: {
        Args: { p_branch_id?: string; p_business_id: string }
        Returns: number
      }
      low_stock_recipients: {
        Args: { p_branch_id: string; p_business_id: string }
        Returns: string[]
      }
      mark_completed: { Args: { p_appointment_id: string }; Returns: Json }
      mark_no_show: { Args: { p_appointment_id: string }; Returns: Json }
      mask_email: { Args: { p_email: string }; Returns: string }
      mask_phone: { Args: { p_phone: string }; Returns: string }
      member_branch_ids: { Args: { p_business_id: string }; Returns: string[] }
      member_business_ids: { Args: never; Returns: string[] }
      message_recipient_hash: { Args: { p_address: string }; Returns: string }
      my_access_state: { Args: never; Returns: Json }
      my_features: { Args: { p_business_id: string }; Returns: Json }
      my_grants: {
        Args: { p_business_id: string }
        Returns: {
          branch_id: string
          permission: string
          scope: Database["public"]["Enums"]["permission_scope"]
        }[]
      }
      my_permissions_version: {
        Args: { p_business_id: string }
        Returns: number
      }
      my_plan_usage: { Args: { p_business_id: string }; Returns: Json }
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
      normalise_role_permissions: { Args: { p_perms: Json }; Returns: Json }
      notification_next_allowed: {
        Args: { p_appointment_start?: string; p_at: string; p_branch: string }
        Returns: string
      }
      outbox_attach_token: {
        Args: { p_appointment: string; p_token: string }
        Returns: undefined
      }
      outbox_cancel_unsent: {
        Args: { p_appointment: string; p_events: string[]; p_reason: string }
        Returns: undefined
      }
      outbox_claim: {
        Args: { p_channels?: string[]; p_limit?: number }
        Returns: Json
      }
      outbox_clean_error: { Args: { p_text: string }; Returns: string }
      outbox_complete: {
        Args: {
          p_dead_tokens?: string[]
          p_id: string
          p_provider: string
          p_provider_id: string
        }
        Returns: Json
      }
      outbox_enqueue: {
        Args: {
          p_appointment?: string
          p_branch: string
          p_business: string
          p_client?: string
          p_deliver_after?: string
          p_event: string
          p_key: string
          p_payload?: Json
          p_review_request?: string
          p_token?: string
          p_user?: string
        }
        Returns: string
      }
      outbox_fail: {
        Args: {
          p_definite?: boolean
          p_error: string
          p_id: string
          p_retryable?: boolean
        }
        Returns: Json
      }
      outbox_finish: {
        Args: {
          p_code: string
          p_error: string
          p_id: string
          p_status: string
        }
        Returns: undefined
      }
      outbox_guard: { Args: { p_id: string }; Returns: string }
      outbox_job: { Args: { p_id: string }; Returns: Json }
      outbox_log: {
        Args: {
          p_code: string
          p_credits?: number
          p_encoding?: string
          p_error: string
          p_id: string
          p_provider?: string
          p_provider_id?: string
          p_segments?: number
          p_status: string
        }
        Returns: undefined
      }
      outbox_maintenance: { Args: { p_now?: string }; Returns: Json }
      outbox_recipient: { Args: { p_id: string }; Returns: Json }
      outbox_reserve_sms: {
        Args: { p_body: string; p_id: string }
        Returns: Json
      }
      outbox_seal: { Args: { p_token: string }; Returns: string }
      outbox_unseal: { Args: { p_sealed: string }; Returns: string }
      outbox_worker_authorize: { Args: { p_token: string }; Returns: boolean }
      own_client_ids: { Args: never; Returns: string[] }
      own_staff_ids: { Args: never; Returns: string[] }
      package_visible: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_client_id: string
        }
        Returns: boolean
      }
      perm_all_branches: {
        Args: { p_business_id: string; p_permission: string }
        Returns: boolean
      }
      perm_branch_ids: {
        Args: { p_branch_scope_only: boolean; p_permission: string }
        Returns: string[]
      }
      perm_business_ids: {
        Args: { p_branch_scope_only: boolean; p_permission: string }
        Returns: string[]
      }
      perm_cover_business_ids: {
        Args: { p_permission: string }
        Returns: string[]
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
      plan_limit_violations: {
        Args: {
          p_business_id: string
          p_plan: Database["public"]["Enums"]["business_plan"]
        }
        Returns: Json
      }
      platform_flag: { Args: never; Returns: boolean }
      portal_audit: {
        Args: {
          p_action: string
          p_after: Json
          p_business_id: string
          p_entity_id: string
          p_entity_type: string
        }
        Returns: undefined
      }
      portal_bookings: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_scope?: string
          p_session: string
        }
        Returns: Json
      }
      portal_cancel_booking: {
        Args: { p_appointment_id: string; p_reason?: string; p_session: string }
        Returns: Json
      }
      portal_client_ids: {
        Args: { p_business_id: string; p_email: string }
        Returns: string[]
      }
      portal_create_booking: {
        Args: {
          p_client_id: string
          p_notes?: string
          p_service_id: string
          p_session: string
          p_staff_id?: string
          p_starts_at: string
        }
        Returns: Json
      }
      portal_create_data_request: {
        Args: { p_kind: string; p_session: string }
        Returns: Json
      }
      portal_ctx: { Args: { p_session: string }; Returns: Json }
      portal_exchange_token: {
        Args: { p_ip_hash?: string; p_token: string }
        Returns: Json
      }
      portal_forms: { Args: { p_session: string }; Returns: Json }
      portal_info: { Args: { p_slug: string }; Returns: Json }
      portal_invoice: {
        Args: { p_invoice_id: string; p_session: string }
        Returns: Json
      }
      portal_invoices: {
        Args: { p_limit?: number; p_offset?: number; p_session: string }
        Returns: Json
      }
      portal_mint_manage_token: {
        Args: { p_appointment_id: string; p_business_id: string }
        Returns: string
      }
      portal_norm_email: { Args: { p_email: string }; Returns: string }
      portal_overview: { Args: { p_session: string }; Returns: Json }
      portal_own_appointment: {
        Args: { p_appointment_id: string; p_ctx: Json }
        Returns: string
      }
      portal_packages: { Args: { p_session: string }; Returns: Json }
      portal_photo_paths: {
        Args: { p_file_ids: string[]; p_session: string }
        Returns: {
          file_id: string
          path: string
        }[]
      }
      portal_photos: { Args: { p_session: string }; Returns: Json }
      portal_request_login: {
        Args: { p_email: string; p_ip_hash?: string; p_slug: string }
        Returns: Json
      }
      portal_reschedule_booking: {
        Args: {
          p_appointment_id: string
          p_session: string
          p_staff_id?: string
          p_starts_at: string
        }
        Returns: Json
      }
      portal_reschedule_slots: {
        Args: {
          p_appointment_id: string
          p_from?: string
          p_session: string
          p_to?: string
        }
        Returns: Json
      }
      portal_revoke_manage_token: {
        Args: { p_token: string }
        Returns: undefined
      }
      portal_sign_out: {
        Args: { p_all?: boolean; p_session: string }
        Returns: Json
      }
      push_recipient_users: {
        Args: {
          p_branch: string
          p_business: string
          p_exclude?: string
          p_permission: string
          p_staff: string
        }
        Returns: string[]
      }
      push_remove_dead_tokens: {
        Args: { p_outbox: string; p_token_ids: string[] }
        Returns: number
      }
      record_signed_consent: {
        Args: {
          p_answers: Json
          p_appointment_id: string
          p_client_id: string
          p_signature: Json
          p_signer_name: string
          p_template_id: string
        }
        Returns: Json
      }
      refresh_invoice_payment_state: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      register_push_token: {
        Args: { p_platform: string; p_token: string }
        Returns: Json
      }
      register_web_push_subscription: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string }
        Returns: Json
      }
      reissue_review_request: {
        Args: { p_appointment_id: string }
        Returns: Json
      }
      remove_member: { Args: { p_member_id: string }; Returns: Json }
      remove_member_role: { Args: { p_assignment_id: string }; Returns: Json }
      remove_review: {
        Args: { p_reason: string; p_review_id: string }
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
      report_last_complete_end: {
        Args: { p_frequency: string; p_local_date: string }
        Returns: string
      }
      report_period: {
        Args: {
          p_anchor: string
          p_from: string
          p_period: string
          p_to: string
        }
        Returns: Json
      }
      report_period_for_end: {
        Args: { p_end: string; p_frequency: string }
        Returns: Json
      }
      report_schedule_gate: { Args: { p_business_id: string }; Returns: Json }
      report_schedule_zone: {
        Args: { p_branch_id: string; p_business_id: string }
        Returns: string
      }
      report_summary_data: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_from: string
          p_pf: string
          p_pt: string
          p_to: string
        }
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
      resolve_data_request: {
        Args: { p_id: string; p_outcome: string }
        Returns: Json
      }
      resolve_manage_token: { Args: { p_token: string }; Returns: string }
      restore_branch: { Args: { p_branch_id: string }; Returns: Json }
      reverse_payment: {
        Args: {
          p_amount_minor?: number
          p_payment_id: string
          p_reason: string
        }
        Returns: Json
      }
      reverse_session: {
        Args: { p_reason?: string; p_usage_id: string }
        Returns: Json
      }
      reverse_session_at: {
        Args: { p_now: string; p_reason: string; p_usage_id: string }
        Returns: Json
      }
      revoke_invite: { Args: { p_member_id: string }; Returns: Json }
      revoke_sessions_of_disabled_members: {
        Args: { p_business_id: string }
        Returns: number
      }
      role_permission_set: { Args: { p_role_id: string }; Returns: Json }
      roles_gate: { Args: { p_business_id: string }; Returns: Json }
      rotate_widget_key: { Args: { p_business_id: string }; Returns: Json }
      save_booking_settings: {
        Args: { p_branch_id: string; p_settings: Json }
        Returns: Json
      }
      save_form_template: {
        Args: {
          p_body: Json
          p_business_id: string
          p_fields: Json
          p_is_active?: boolean
          p_kind: string
          p_requires_signature: boolean
          p_service_ids: string[]
          p_template_id: string
          p_title: string
        }
        Returns: Json
      }
      save_package: {
        Args: {
          p_bonus_sessions: number
          p_branch_id: string
          p_description: string
          p_expiry_days: number
          p_is_active?: boolean
          p_name: string
          p_package_id: string
          p_price_minor: number
          p_service_ids: string[]
          p_sessions: number
        }
        Returns: Json
      }
      save_product: {
        Args: {
          p_branch_id: string
          p_is_active?: boolean
          p_low_stock_threshold: number
          p_name: string
          p_opening_stock?: number
          p_price_minor: number
          p_product_id: string
          p_sku: string
          p_unit: string
        }
        Returns: Json
      }
      save_push_preferences: {
        Args: { p_business: string; p_prefs: Json }
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
      scope_rank: {
        Args: { p_scope: Database["public"]["Enums"]["permission_scope"] }
        Returns: number
      }
      scoped_client_ids: { Args: { p_permission: string }; Returns: string[] }
      set_addon: {
        Args: { p_addon: string; p_business_id: string; p_enabled: boolean }
        Returns: Json
      }
      set_addon_prices: {
        Args: {
          p_active?: boolean
          p_currency: string
          p_key: string
          p_monthly_minor: number
          p_name?: string
        }
        Returns: Json
      }
      set_business_status: {
        Args: { p_business_id: string; p_note?: string; p_status: string }
        Returns: Json
      }
      set_commission_rule: {
        Args: {
          p_currency?: string
          p_effective_from?: string
          p_flat_minor?: number
          p_kind: string
          p_percent_bp?: number
          p_service_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      set_inventory_settings: {
        Args: { p_allow_negative_stock: boolean; p_branch_id: string }
        Returns: Json
      }
      set_photo_consent: {
        Args: { p_client_id: string; p_value: boolean }
        Returns: Json
      }
      set_plan_prices: {
        Args: {
          p_active?: boolean
          p_annual_minor: number
          p_currency: string
          p_key: string
          p_monthly_minor: number
          p_name?: string
        }
        Returns: Json
      }
      set_primary_branch: { Args: { p_branch_id: string }; Returns: Json }
      set_report_schedule: {
        Args: {
          p_branch_id?: string
          p_business_id: string
          p_enabled?: boolean
          p_frequency: string
          p_send_hour?: number
        }
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
      sms_ledger_post: {
        Args: {
          p_amount: number
          p_attempt?: number
          p_business: string
          p_by?: string
          p_dial?: string
          p_encoding?: string
          p_kind: string
          p_note?: string
          p_outbox?: string
          p_ref?: number
          p_segments?: number
        }
        Returns: Json
      }
      sms_rate_for: {
        Args: { p_phone: string }
        Returns: {
          country_code: string
          credits_per_segment: number
          dial_code: string
          note: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sms_country_rates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sms_segments: {
        Args: { p_text: string }
        Returns: {
          out_encoding: string
          out_segments: number
          out_units: number
        }[]
      }
      staff_in_scope: {
        Args: {
          p_business_id: string
          p_permission: string
          p_staff_id: string
        }
        Returns: boolean
      }
      submit_form_request: {
        Args: {
          p_answers: Json
          p_ip_hash?: string
          p_signature: Json
          p_signer_name: string
          p_token: string
        }
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
      support_view_business: { Args: { p_business_id: string }; Returns: Json }
      suppress_recipient: {
        Args: {
          p_business: string
          p_channel: string
          p_hash: string
          p_source: string
        }
        Returns: boolean
      }
      touch_manage_token: { Args: { p_token: string }; Returns: undefined }
      unregister_push_token: { Args: { p_token: string }; Returns: undefined }
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
      update_branch: {
        Args: { p_branch_id: string; p_patch: Json }
        Returns: Json
      }
      update_custom_role: {
        Args: { p_name?: string; p_permissions?: Json; p_role_id: string }
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
      upsert_industry_preset: {
        Args: {
          p_active?: boolean
          p_key: string
          p_name: string
          p_starter_fields: Json
          p_template_key: string
          p_terminology: Json
        }
        Returns: Json
      }
      user_holds_all_scope: {
        Args: { p_business_id: string; p_permission: string; p_user_id: string }
        Returns: boolean
      }
      user_is_disabled: { Args: { p_user: string }; Returns: boolean }
      validate_form_answers: {
        Args: { p_answers: Json; p_fields: Json }
        Returns: Json
      }
      validate_form_body: { Args: { p_body: Json }; Returns: Json }
      validate_form_fields: { Args: { p_fields: Json }; Returns: Json }
      validate_signature: {
        Args: { p_required: boolean; p_sig: Json }
        Returns: Json
      }
      validate_widget_origin: {
        Args: { p_origin: string; p_public_key: string }
        Returns: Json
      }
      void_signed_consent: {
        Args: { p_id: string; p_reason: string }
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
      commission_entry_kind: "earn" | "reversal"
      commission_rule_kind: "percent" | "flat" | "none"
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
      session_usage_kind: "deduct" | "reversal"
      slot_display_mode: "only_available" | "all_greyed"
      slot_interval_mode: "min_15" | "min_30" | "min_60" | "service_length"
      staff_choice_mode: "hidden" | "optional" | "required"
      stock_movement_kind: "purchase" | "adjustment" | "sale" | "return"
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
      commission_entry_kind: ["earn", "reversal"],
      commission_rule_kind: ["percent", "flat", "none"],
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
      session_usage_kind: ["deduct", "reversal"],
      slot_display_mode: ["only_available", "all_greyed"],
      slot_interval_mode: ["min_15", "min_30", "min_60", "service_length"],
      staff_choice_mode: ["hidden", "optional", "required"],
      stock_movement_kind: ["purchase", "adjustment", "sale", "return"],
    },
  },
} as const
