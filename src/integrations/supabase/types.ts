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
      ai_usage: {
        Row: {
          created_at: string
          feature: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feature: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          feature?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      applications: {
        Row: {
          created_at: string
          highlights: string[] | null
          id: string
          listing_id: string
          message: string | null
          owner_seen_at: string | null
          sit_dates_id: string
          sitter_user_id: string
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          who_applying: string | null
        }
        Insert: {
          created_at?: string
          highlights?: string[] | null
          id?: string
          listing_id: string
          message?: string | null
          owner_seen_at?: string | null
          sit_dates_id: string
          sitter_user_id: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          who_applying?: string | null
        }
        Update: {
          created_at?: string
          highlights?: string[] | null
          id?: string
          listing_id?: string
          message?: string | null
          owner_seen_at?: string | null
          sit_dates_id?: string
          sitter_user_id?: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          who_applying?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_sit_dates_id_fkey"
            columns: ["sit_dates_id"]
            isOneToOne: false
            referencedRelation: "sit_dates"
            referencedColumns: ["id"]
          },
        ]
      }
      arrival_vault_photos: {
        Row: {
          created_at: string
          id: string
          photo_url: string
          sit_id: string
          sitter_user_id: string
          taken_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          photo_url: string
          sit_id: string
          sitter_user_id: string
          taken_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          photo_url?: string
          sit_id?: string
          sitter_user_id?: string
          taken_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arrival_vault_photos_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: false
            referencedRelation: "sits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrival_vault_photos_sitter_user_id_fkey"
            columns: ["sitter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrival_vault_photos_sitter_user_id_fkey"
            columns: ["sitter_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      background_job_state: {
        Row: {
          job_name: string
          last_error: string | null
          last_run_at: string | null
          locked_until: string | null
          pause_reason: string | null
          paused: boolean
        }
        Insert: {
          job_name: string
          last_error?: string | null
          last_run_at?: string | null
          locked_until?: string | null
          pause_reason?: string | null
          paused?: boolean
        }
        Update: {
          job_name?: string
          last_error?: string | null
          last_run_at?: string | null
          locked_until?: string | null
          pause_reason?: string | null
          paused?: boolean
        }
        Relationships: []
      }
      cancellation_strikes: {
        Row: {
          created_at: string
          days_before_start: number | null
          id: string
          reason: string | null
          sit_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          days_before_start?: number | null
          id?: string
          reason?: string | null
          sit_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          days_before_start?: number | null
          id?: string
          reason?: string | null
          sit_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_strikes_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: false
            referencedRelation: "sits"
            referencedColumns: ["id"]
          },
        ]
      }
      city_chat_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "city_chat_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "city_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      city_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_pinned: boolean
          parent_message_id: string | null
          room_id: string
          sender_user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          parent_message_id?: string | null
          room_id: string
          sender_user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          parent_message_id?: string | null
          room_id?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "city_chat_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "city_chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_chat_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "city_chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      city_chat_rooms: {
        Row: {
          city: string
          city_key: string
          country: string
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
        }
        Insert: {
          city: string
          city_key: string
          country: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
        }
        Update: {
          city?: string
          city_key?: string
          country?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
        }
        Relationships: []
      }
      city_chat_thread_subscriptions: {
        Row: {
          created_at: string
          id: string
          thread_message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          thread_message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          thread_message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "city_chat_thread_subscriptions_thread_message_id_fkey"
            columns: ["thread_message_id"]
            isOneToOne: false
            referencedRelation: "city_chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_chat_thread_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_chat_thread_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_flags: {
        Row: {
          category: string
          created_at: string
          id: string
          note: string | null
          reporter_user_id: string | null
          review_id: string | null
          sit_id: string | null
          subject_id: string
          subject_type: string
          subject_user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          note?: string | null
          reporter_user_id?: string | null
          review_id?: string | null
          sit_id?: string | null
          subject_id: string
          subject_type: string
          subject_user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          note?: string | null
          reporter_user_id?: string | null
          review_id?: string | null
          sit_id?: string | null
          subject_id?: string
          subject_type?: string
          subject_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_flags_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_flags_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: false
            referencedRelation: "sits"
            referencedColumns: ["id"]
          },
        ]
      }
      community_strike_notes: {
        Row: {
          admin_user_id: string
          created_at: string
          id: string
          note: string
          strike_id: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          id?: string
          note: string
          strike_id: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          id?: string
          note?: string
          strike_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_strike_notes_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_strike_notes_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_strike_notes_strike_id_fkey"
            columns: ["strike_id"]
            isOneToOne: false
            referencedRelation: "community_strikes"
            referencedColumns: ["id"]
          },
        ]
      }
      community_strikes: {
        Row: {
          category: string
          created_at: string
          flag_count: number
          id: string
          review_status: string
          show_strike_three_warning: boolean
          strike_two_email_sent_at: string | null
          subject_id: string
          subject_type: string
          subject_user_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          flag_count?: number
          id?: string
          review_status?: string
          show_strike_three_warning?: boolean
          strike_two_email_sent_at?: string | null
          subject_id: string
          subject_type: string
          subject_user_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          flag_count?: number
          id?: string
          review_status?: string
          show_strike_three_warning?: boolean
          strike_two_email_sent_at?: string | null
          subject_id?: string
          subject_type?: string
          subject_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      contact_rate_limits: {
        Row: {
          created_at: string
          email_hash: string
          id: string
          ip_hash: string
        }
        Insert: {
          created_at?: string
          email_hash: string
          id?: string
          ip_hash: string
        }
        Update: {
          created_at?: string
          email_hash?: string
          id?: string
          ip_hash?: string
        }
        Relationships: []
      }
      conversation_pair_threads: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_a_id: string
          user_b_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_a_id: string
          user_b_id: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_a_id?: string
          user_b_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          conversation_type: Database["public"]["Enums"]["conversation_type"]
          created_at: string
          id: string
          listing_id: string | null
          owner_user_id: string | null
          pair_thread_id: string | null
          sitter_user_id: string | null
          updated_at: string
        }
        Insert: {
          conversation_type?: Database["public"]["Enums"]["conversation_type"]
          created_at?: string
          id?: string
          listing_id?: string | null
          owner_user_id?: string | null
          pair_thread_id?: string | null
          sitter_user_id?: string | null
          updated_at?: string
        }
        Update: {
          conversation_type?: Database["public"]["Enums"]["conversation_type"]
          created_at?: string
          id?: string
          listing_id?: string | null
          owner_user_id?: string | null
          pair_thread_id?: string | null
          sitter_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_pair_thread_id_fkey"
            columns: ["pair_thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_pair_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      deleted_accounts: {
        Row: {
          billing_records_retained: boolean
          deleted_at: string
          listing_ids: string[]
          notes: string | null
          onfido_applicant_deleted: boolean | null
          safety_purge_after: string
          safety_purged_at: string | null
          storage_files_deleted: number | null
          stripe_subscriptions_cancelled: number | null
          user_id: string
        }
        Insert: {
          billing_records_retained?: boolean
          deleted_at?: string
          listing_ids?: string[]
          notes?: string | null
          onfido_applicant_deleted?: boolean | null
          safety_purge_after?: string
          safety_purged_at?: string | null
          storage_files_deleted?: number | null
          stripe_subscriptions_cancelled?: number | null
          user_id: string
        }
        Update: {
          billing_records_retained?: boolean
          deleted_at?: string
          listing_ids?: string[]
          notes?: string | null
          onfido_applicant_deleted?: boolean | null
          safety_purge_after?: string
          safety_purged_at?: string | null
          storage_files_deleted?: number | null
          stripe_subscriptions_cancelled?: number | null
          user_id?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      founding_member_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          max_uses: number
          used_count: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          max_uses?: number
          used_count?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          max_uses?: number
          used_count?: number
        }
        Relationships: []
      }
      guide_qa: {
        Row: {
          answer: string
          arrival_only: boolean
          created_at: string
          id: string
          listing_id: string
          question: string
          source_question_id: string | null
          updated_at: string
        }
        Insert: {
          answer: string
          arrival_only?: boolean
          created_at?: string
          id?: string
          listing_id: string
          question: string
          source_question_id?: string | null
          updated_at?: string
        }
        Update: {
          answer?: string
          arrival_only?: boolean
          created_at?: string
          id?: string
          listing_id?: string
          question?: string
          source_question_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guide_qa_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guide_qa_source_question_id_fkey"
            columns: ["source_question_id"]
            isOneToOne: false
            referencedRelation: "guide_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      guide_questions: {
        Row: {
          added_to_guide: boolean
          answered_at: string | null
          answered_from_guide: boolean
          asked_owner_at: string | null
          created_at: string
          dismissed_at: string | null
          draft_answer: string | null
          id: string
          is_emergency: boolean
          listing_id: string | null
          owner_answer: string | null
          parent_question_id: string | null
          question: string
          removed_at: string | null
          sit_id: string
          sitter_user_id: string | null
          updated_at: string
        }
        Insert: {
          added_to_guide?: boolean
          answered_at?: string | null
          answered_from_guide?: boolean
          asked_owner_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          draft_answer?: string | null
          id?: string
          is_emergency?: boolean
          listing_id?: string | null
          owner_answer?: string | null
          parent_question_id?: string | null
          question: string
          removed_at?: string | null
          sit_id: string
          sitter_user_id?: string | null
          updated_at?: string
        }
        Update: {
          added_to_guide?: boolean
          answered_at?: string | null
          answered_from_guide?: boolean
          asked_owner_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          draft_answer?: string | null
          id?: string
          is_emergency?: boolean
          listing_id?: string | null
          owner_answer?: string | null
          parent_question_id?: string | null
          question?: string
          removed_at?: string | null
          sit_id?: string
          sitter_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guide_questions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guide_questions_parent_question_id_fkey"
            columns: ["parent_question_id"]
            isOneToOne: false
            referencedRelation: "guide_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guide_questions_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: false
            referencedRelation: "sits"
            referencedColumns: ["id"]
          },
        ]
      }
      guide_unlock_notifications: {
        Row: {
          kind: string
          notified_at: string
          sit_dates_id: string
          sit_id: string
        }
        Insert: {
          kind: string
          notified_at?: string
          sit_dates_id: string
          sit_id: string
        }
        Update: {
          kind?: string
          notified_at?: string
          sit_dates_id?: string
          sit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guide_unlock_notifications_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: false
            referencedRelation: "sits"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          address_private: string | null
          amenities: string[] | null
          approx_latitude: number | null
          approx_longitude: number | null
          area: string | null
          car_needed: boolean
          city: string | null
          communication_style: string | null
          country: string | null
          created_at: string
          description: string | null
          heavy_gardening: boolean
          home_care_tasks: string[] | null
          home_care_tasks_other: string | null
          home_type: string | null
          house_rules: string[] | null
          house_rules_other: string | null
          id: string
          ideal_nomad_types: string[]
          ideal_sitter_description: string | null
          latitude: number | null
          location_type: string | null
          longitude: number | null
          owner_declaration_accepted_at: string | null
          owner_user_id: string
          photos: string[] | null
          public_transport_accessible: boolean | null
          remote_location: boolean
          requirements: string[] | null
          requirements_other: string | null
          sleeping_arrangement: string | null
          status: Database["public"]["Enums"]["listing_status"]
          timezone: string | null
          title: string
          updated_at: string
          wheelchair_accessible: boolean
          wifi_quality: string | null
        }
        Insert: {
          address_private?: string | null
          amenities?: string[] | null
          approx_latitude?: number | null
          approx_longitude?: number | null
          area?: string | null
          car_needed?: boolean
          city?: string | null
          communication_style?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          heavy_gardening?: boolean
          home_care_tasks?: string[] | null
          home_care_tasks_other?: string | null
          home_type?: string | null
          house_rules?: string[] | null
          house_rules_other?: string | null
          id?: string
          ideal_nomad_types?: string[]
          ideal_sitter_description?: string | null
          latitude?: number | null
          location_type?: string | null
          longitude?: number | null
          owner_declaration_accepted_at?: string | null
          owner_user_id: string
          photos?: string[] | null
          public_transport_accessible?: boolean | null
          remote_location?: boolean
          requirements?: string[] | null
          requirements_other?: string | null
          sleeping_arrangement?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          timezone?: string | null
          title: string
          updated_at?: string
          wheelchair_accessible?: boolean
          wifi_quality?: string | null
        }
        Update: {
          address_private?: string | null
          amenities?: string[] | null
          approx_latitude?: number | null
          approx_longitude?: number | null
          area?: string | null
          car_needed?: boolean
          city?: string | null
          communication_style?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          heavy_gardening?: boolean
          home_care_tasks?: string[] | null
          home_care_tasks_other?: string | null
          home_type?: string | null
          house_rules?: string[] | null
          house_rules_other?: string | null
          id?: string
          ideal_nomad_types?: string[]
          ideal_sitter_description?: string | null
          latitude?: number | null
          location_type?: string | null
          longitude?: number | null
          owner_declaration_accepted_at?: string | null
          owner_user_id?: string
          photos?: string[] | null
          public_transport_accessible?: boolean | null
          remote_location?: boolean
          requirements?: string[] | null
          requirements_other?: string | null
          sleeping_arrangement?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          timezone?: string | null
          title?: string
          updated_at?: string
          wheelchair_accessible?: boolean
          wifi_quality?: string | null
        }
        Relationships: []
      }
      manual_id_verifications: {
        Row: {
          created_at: string
          documents_deleted_at: string | null
          id: string
          id_photo_path: string | null
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_path: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          documents_deleted_at?: string | null
          id?: string
          id_photo_path?: string | null
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          documents_deleted_at?: string | null
          id?: string
          id_photo_path?: string | null
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_id_verifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_id_verifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_id_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_id_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_path: string | null
          body: string
          conversation_id: string
          created_at: string
          guide_question_id: string | null
          id: string
          message_lang: string | null
          read_at: string | null
          sender_user_id: string | null
          translated_at: string | null
          translated_body: string | null
          translated_lang: string | null
        }
        Insert: {
          attachment_path?: string | null
          body: string
          conversation_id: string
          created_at?: string
          guide_question_id?: string | null
          id?: string
          message_lang?: string | null
          read_at?: string | null
          sender_user_id?: string | null
          translated_at?: string | null
          translated_body?: string | null
          translated_lang?: string | null
        }
        Update: {
          attachment_path?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          guide_question_id?: string | null
          id?: string
          message_lang?: string | null
          read_at?: string | null
          sender_user_id?: string | null
          translated_at?: string | null
          translated_body?: string | null
          translated_lang?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_guide_question_id_fkey"
            columns: ["guide_question_id"]
            isOneToOne: false
            referencedRelation: "guide_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      nomad_match_cache: {
        Row: {
          created_at: string
          listing_id: string
          owner_user_id: string
          results: Json
        }
        Insert: {
          created_at?: string
          listing_id: string
          owner_user_id: string
          results?: Json
        }
        Update: {
          created_at?: string
          listing_id?: string
          owner_user_id?: string
          results?: Json
        }
        Relationships: [
          {
            foreignKeyName: "nomad_match_cache_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_application_status: boolean
          email_membership: boolean
          email_messages: boolean
          email_new_applications: boolean
          email_reviews: boolean
          email_sit_updates: boolean
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_application_status?: boolean
          email_membership?: boolean
          email_messages?: boolean
          email_new_applications?: boolean
          email_reviews?: boolean
          email_sit_updates?: boolean
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_application_status?: boolean
          email_membership?: boolean
          email_messages?: boolean
          email_new_applications?: boolean
          email_reviews?: boolean
          email_sit_updates?: boolean
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          message: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          message: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          message?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      owner_profiles: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      perk_clicks: {
        Row: {
          clicked_at: string
          id: string
          perk_id: string
          referrer: string | null
          user_id: string | null
        }
        Insert: {
          clicked_at?: string
          id?: string
          perk_id: string
          referrer?: string | null
          user_id?: string | null
        }
        Update: {
          clicked_at?: string
          id?: string
          perk_id?: string
          referrer?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perk_clicks_perk_id_fkey"
            columns: ["perk_id"]
            isOneToOne: false
            referencedRelation: "perks"
            referencedColumns: ["id"]
          },
        ]
      }
      perks: {
        Row: {
          affiliate_url: string
          benefit_short: string
          category: string
          created_at: string
          description: string | null
          discount_code: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          is_featured: boolean
          logo_url: string | null
          name: string
          slug: string
          sort_order: number
          subid_param: string | null
          terms: string | null
          updated_at: string
        }
        Insert: {
          affiliate_url: string
          benefit_short: string
          category?: string
          created_at?: string
          description?: string | null
          discount_code?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          logo_url?: string | null
          name: string
          slug: string
          sort_order?: number
          subid_param?: string | null
          terms?: string | null
          updated_at?: string
        }
        Update: {
          affiliate_url?: string
          benefit_short?: string
          category?: string
          created_at?: string
          description?: string | null
          discount_code?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          sort_order?: number
          subid_param?: string | null
          terms?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pets: {
        Row: {
          age: string | null
          behaviour_notes: string | null
          created_at: string
          daily_routine: string | null
          feeding_details: string | null
          has_medication: boolean | null
          id: string
          listing_id: string
          medication_instructions: string | null
          name: string | null
          personality: string | null
          photos: string[] | null
          reactive_to_animals: boolean
          requires_medication: boolean
          separation_anxiety_tolerance: string | null
          type: string
          updated_at: string
          vet_info: string | null
          walks_exercise: string | null
        }
        Insert: {
          age?: string | null
          behaviour_notes?: string | null
          created_at?: string
          daily_routine?: string | null
          feeding_details?: string | null
          has_medication?: boolean | null
          id?: string
          listing_id: string
          medication_instructions?: string | null
          name?: string | null
          personality?: string | null
          photos?: string[] | null
          reactive_to_animals?: boolean
          requires_medication?: boolean
          separation_anxiety_tolerance?: string | null
          type: string
          updated_at?: string
          vet_info?: string | null
          walks_exercise?: string | null
        }
        Update: {
          age?: string | null
          behaviour_notes?: string | null
          created_at?: string
          daily_routine?: string | null
          feeding_details?: string | null
          has_medication?: boolean | null
          id?: string
          listing_id?: string
          medication_instructions?: string | null
          name?: string | null
          personality?: string | null
          photos?: string[] | null
          reactive_to_animals?: boolean
          requires_medication?: boolean
          separation_anxiety_tolerance?: string | null
          type?: string
          updated_at?: string
          vet_info?: string | null
          walks_exercise?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pets_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string
          email_verified: boolean
          first_name: string | null
          flagged_for_admin_review: boolean
          founding_badge: boolean
          founding_member: boolean | null
          full_name: string | null
          id: string
          id_verified: boolean | null
          is_admin: boolean
          last_name: string | null
          location: string | null
          max_listings: number
          membership_expiry: string | null
          membership_status: string | null
          membership_type: string | null
          onfido_applicant_id: string | null
          onfido_check_id: string | null
          phone_line_type: string | null
          phone_number: string | null
          phone_verified: boolean
          phone_verified_at: string | null
          preferred_language: string | null
          reliability_score: number
          reliability_strike_email_sent_at: string | null
          share_name_in_stories: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email: string
          email_verified?: boolean
          first_name?: string | null
          flagged_for_admin_review?: boolean
          founding_badge?: boolean
          founding_member?: boolean | null
          full_name?: string | null
          id: string
          id_verified?: boolean | null
          is_admin?: boolean
          last_name?: string | null
          location?: string | null
          max_listings?: number
          membership_expiry?: string | null
          membership_status?: string | null
          membership_type?: string | null
          onfido_applicant_id?: string | null
          onfido_check_id?: string | null
          phone_line_type?: string | null
          phone_number?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          preferred_language?: string | null
          reliability_score?: number
          reliability_strike_email_sent_at?: string | null
          share_name_in_stories?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string
          email_verified?: boolean
          first_name?: string | null
          flagged_for_admin_review?: boolean
          founding_badge?: boolean
          founding_member?: boolean | null
          full_name?: string | null
          id?: string
          id_verified?: boolean | null
          is_admin?: boolean
          last_name?: string | null
          location?: string | null
          max_listings?: number
          membership_expiry?: string | null
          membership_status?: string | null
          membership_type?: string | null
          onfido_applicant_id?: string | null
          onfido_check_id?: string | null
          phone_line_type?: string | null
          phone_number?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          preferred_language?: string | null
          reliability_score?: number
          reliability_strike_email_sent_at?: string | null
          share_name_in_stories?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reliability_review_notes: {
        Row: {
          admin_user_id: string
          created_at: string
          id: string
          note: string
          user_id: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          id?: string
          note: string
          user_id: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          id?: string
          note?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reliability_review_notes_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reliability_review_notes_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reliability_review_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reliability_review_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          evidence_paths: string[] | null
          id: string
          reason: string
          reporter_user_id: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          evidence_paths?: string[] | null
          id?: string
          reason: string
          reporter_user_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          evidence_paths?: string[] | null
          id?: string
          reason?: string
          reporter_user_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_type?: Database["public"]["Enums"]["report_target_type"]
          updated_at?: string
        }
        Relationships: []
      }
      review_flag_evidence: {
        Row: {
          created_at: string
          flag_key: string
          id: string
          photo_url: string | null
          reason_text: string | null
          review_id: string
        }
        Insert: {
          created_at?: string
          flag_key: string
          id?: string
          photo_url?: string | null
          reason_text?: string | null
          review_id: string
        }
        Update: {
          created_at?: string
          flag_key?: string
          id?: string
          photo_url?: string | null
          reason_text?: string | null
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_flag_evidence_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_reminders: {
        Row: {
          id: string
          sent_at: string
          sit_id: string
          stage: number
          user_id: string
        }
        Insert: {
          id?: string
          sent_at?: string
          sit_id: string
          stage: number
          user_id: string
        }
        Update: {
          id?: string
          sent_at?: string
          sit_id?: string
          stage?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_reminders_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: false
            referencedRelation: "sits"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          created_at: string
          flag_abandonment: boolean
          flag_home_cleanliness: boolean
          flag_not_homeowner: string | null
          flag_pet_aggression: boolean
          flag_pet_neglect: boolean
          flag_sitter_cleanliness: boolean
          flag_unauthorized_guests: boolean | null
          flag_undisclosed_cameras: boolean
          former_reviewee_user_id: string | null
          id: string
          rating: number
          rating_cleanliness: number | null
          rating_clear_expectations: number | null
          rating_communication: number | null
          rating_home_accuracy: number | null
          rating_hospitality: number | null
          rating_pet_care: number | null
          rating_pet_preparedness: number | null
          rating_reliability: number | null
          rating_respect_home: number | null
          reviewee_user_id: string | null
          reviewer_user_id: string | null
          sit_id: string | null
          text: string | null
        }
        Insert: {
          created_at?: string
          flag_abandonment?: boolean
          flag_home_cleanliness?: boolean
          flag_not_homeowner?: string | null
          flag_pet_aggression?: boolean
          flag_pet_neglect?: boolean
          flag_sitter_cleanliness?: boolean
          flag_unauthorized_guests?: boolean | null
          flag_undisclosed_cameras?: boolean
          former_reviewee_user_id?: string | null
          id?: string
          rating: number
          rating_cleanliness?: number | null
          rating_clear_expectations?: number | null
          rating_communication?: number | null
          rating_home_accuracy?: number | null
          rating_hospitality?: number | null
          rating_pet_care?: number | null
          rating_pet_preparedness?: number | null
          rating_reliability?: number | null
          rating_respect_home?: number | null
          reviewee_user_id?: string | null
          reviewer_user_id?: string | null
          sit_id?: string | null
          text?: string | null
        }
        Update: {
          created_at?: string
          flag_abandonment?: boolean
          flag_home_cleanliness?: boolean
          flag_not_homeowner?: string | null
          flag_pet_aggression?: boolean
          flag_pet_neglect?: boolean
          flag_sitter_cleanliness?: boolean
          flag_unauthorized_guests?: boolean | null
          flag_undisclosed_cameras?: boolean
          former_reviewee_user_id?: string | null
          id?: string
          rating?: number
          rating_cleanliness?: number | null
          rating_clear_expectations?: number | null
          rating_communication?: number | null
          rating_home_accuracy?: number | null
          rating_hospitality?: number | null
          rating_pet_care?: number | null
          rating_pet_preparedness?: number | null
          rating_reliability?: number | null
          rating_respect_home?: number | null
          reviewee_user_id?: string | null
          reviewer_user_id?: string | null
          sit_id?: string | null
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: false
            referencedRelation: "sits"
            referencedColumns: ["id"]
          },
        ]
      }
      sit_checkins: {
        Row: {
          ai_drafted: boolean
          author_user_id: string | null
          chips: string[]
          created_at: string
          flag_note: string | null
          flagged: boolean
          id: string
          kind: string
          local_day: string | null
          message_lang: string | null
          note: string | null
          owner_heart_at: string | null
          photo_paths: string[]
          photo_url: string | null
          sit_id: string
          translated_at: string | null
          translated_flag_note: string | null
          translated_lang: string | null
          translated_message: string | null
        }
        Insert: {
          ai_drafted?: boolean
          author_user_id?: string | null
          chips?: string[]
          created_at?: string
          flag_note?: string | null
          flagged?: boolean
          id?: string
          kind: string
          local_day?: string | null
          message_lang?: string | null
          note?: string | null
          owner_heart_at?: string | null
          photo_paths?: string[]
          photo_url?: string | null
          sit_id: string
          translated_at?: string | null
          translated_flag_note?: string | null
          translated_lang?: string | null
          translated_message?: string | null
        }
        Update: {
          ai_drafted?: boolean
          author_user_id?: string | null
          chips?: string[]
          created_at?: string
          flag_note?: string | null
          flagged?: boolean
          id?: string
          kind?: string
          local_day?: string | null
          message_lang?: string | null
          note?: string | null
          owner_heart_at?: string | null
          photo_paths?: string[]
          photo_url?: string | null
          sit_id?: string
          translated_at?: string | null
          translated_flag_note?: string | null
          translated_lang?: string | null
          translated_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sit_checkins_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: false
            referencedRelation: "sits"
            referencedColumns: ["id"]
          },
        ]
      }
      sit_dates: {
        Row: {
          created_at: string
          end_date: string
          flexibility: string | null
          handover_preference: string | null
          id: string
          is_urgent: boolean
          listing_id: string
          start_date: string
          status: Database["public"]["Enums"]["sit_date_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          flexibility?: string | null
          handover_preference?: string | null
          id?: string
          is_urgent?: boolean
          listing_id: string
          start_date: string
          status?: Database["public"]["Enums"]["sit_date_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          flexibility?: string | null
          handover_preference?: string | null
          id?: string
          is_urgent?: boolean
          listing_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["sit_date_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sit_dates_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      sit_reschedule_requests: {
        Row: {
          created_at: string
          id: string
          note: string | null
          proposed_end_date: string
          proposed_start_date: string
          requested_by: string
          responded_at: string | null
          sit_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          proposed_end_date: string
          proposed_start_date: string
          requested_by: string
          responded_at?: string | null
          sit_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          proposed_end_date?: string
          proposed_start_date?: string
          requested_by?: string
          responded_at?: string | null
          sit_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sit_reschedule_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sit_reschedule_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sit_reschedule_requests_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: false
            referencedRelation: "sits"
            referencedColumns: ["id"]
          },
        ]
      }
      sit_stories: {
        Row: {
          attempts: number
          created_at: string
          id: string
          owner_user_id: string | null
          photo_alt: Json | null
          photo_paths: string[]
          portfolio_decided_at: string | null
          portfolio_photo_paths: string[]
          portfolio_requested_at: string | null
          portfolio_status: string
          ready_at: string | null
          sit_id: string
          sitter_user_id: string | null
          status: string
          story: string | null
          story_days: Json | null
          title: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          owner_user_id?: string | null
          photo_alt?: Json | null
          photo_paths?: string[]
          portfolio_decided_at?: string | null
          portfolio_photo_paths?: string[]
          portfolio_requested_at?: string | null
          portfolio_status?: string
          ready_at?: string | null
          sit_id: string
          sitter_user_id?: string | null
          status?: string
          story?: string | null
          story_days?: Json | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          owner_user_id?: string | null
          photo_alt?: Json | null
          photo_paths?: string[]
          portfolio_decided_at?: string | null
          portfolio_photo_paths?: string[]
          portfolio_requested_at?: string | null
          portfolio_status?: string
          ready_at?: string | null
          sit_id?: string
          sitter_user_id?: string | null
          status?: string
          story?: string | null
          story_days?: Json | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sit_stories_sit_id_fkey"
            columns: ["sit_id"]
            isOneToOne: true
            referencedRelation: "sits"
            referencedColumns: ["id"]
          },
        ]
      }
      sit_story_share_hits: {
        Row: {
          hits: number
          link_id: string
          minute: string
        }
        Insert: {
          hits?: number
          link_id: string
          minute: string
        }
        Update: {
          hits?: number
          link_id?: string
          minute?: string
        }
        Relationships: [
          {
            foreignKeyName: "sit_story_share_hits_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "sit_story_share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      sit_story_share_links: {
        Row: {
          created_at: string
          created_by: string | null
          disabled_at: string | null
          enabled: boolean
          id: string
          story_id: string
          token: string
          view_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          enabled?: boolean
          id?: string
          story_id: string
          token: string
          view_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          enabled?: boolean
          id?: string
          story_id?: string
          token?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "sit_story_share_links_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "sit_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      sits: {
        Row: {
          arrival_prompt_sent_at: string | null
          cancelled_at: string | null
          cancelled_from_status:
            | Database["public"]["Enums"]["sit_status"]
            | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          id: string
          listing_id: string | null
          owner_user_id: string | null
          sit_dates_id: string | null
          sitter_user_id: string | null
          snapshot_city: string | null
          snapshot_country: string | null
          snapshot_end_date: string | null
          snapshot_start_date: string | null
          snapshot_title: string | null
          status: Database["public"]["Enums"]["sit_status"]
          updated_at: string
        }
        Insert: {
          arrival_prompt_sent_at?: string | null
          cancelled_at?: string | null
          cancelled_from_status?:
            | Database["public"]["Enums"]["sit_status"]
            | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          owner_user_id?: string | null
          sit_dates_id?: string | null
          sitter_user_id?: string | null
          snapshot_city?: string | null
          snapshot_country?: string | null
          snapshot_end_date?: string | null
          snapshot_start_date?: string | null
          snapshot_title?: string | null
          status?: Database["public"]["Enums"]["sit_status"]
          updated_at?: string
        }
        Update: {
          arrival_prompt_sent_at?: string | null
          cancelled_at?: string | null
          cancelled_from_status?:
            | Database["public"]["Enums"]["sit_status"]
            | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          owner_user_id?: string | null
          sit_dates_id?: string | null
          sitter_user_id?: string | null
          snapshot_city?: string | null
          snapshot_country?: string | null
          snapshot_end_date?: string | null
          snapshot_start_date?: string | null
          snapshot_title?: string | null
          status?: Database["public"]["Enums"]["sit_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sits_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sits_sit_dates_id_fkey"
            columns: ["sit_dates_id"]
            isOneToOne: false
            referencedRelation: "sit_dates"
            referencedColumns: ["id"]
          },
        ]
      }
      sitter_availability: {
        Row: {
          created_at: string
          end_date: string
          id: string
          sitter_user_id: string
          start_date: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          sitter_user_id: string
          start_date: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          sitter_user_id?: string
          start_date?: string
        }
        Relationships: []
      }
      sitter_invites: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          message: string | null
          owner_user_id: string
          sit_dates_id: string
          sitter_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          message?: string | null
          owner_user_id: string
          sit_dates_id: string
          sitter_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          message?: string | null
          owner_user_id?: string
          sit_dates_id?: string
          sitter_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sitter_invites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sitter_invites_sit_dates_id_fkey"
            columns: ["sit_dates_id"]
            isOneToOne: false
            referencedRelation: "sit_dates"
            referencedColumns: ["id"]
          },
        ]
      }
      sitter_profiles: {
        Row: {
          age_range: string | null
          availability_type: string | null
          available_from: string | null
          available_to: string | null
          background_check: boolean | null
          bio: string | null
          comfortable_with: string[] | null
          created_at: string
          experience_details: string | null
          experience_level: string | null
          gallery: string[] | null
          headline: string | null
          home_preferences: string[] | null
          house_rules_compatibility: string[] | null
          id: string
          id_verified: boolean | null
          is_active: boolean
          is_visible: boolean
          languages: string[] | null
          latitude: number | null
          longitude: number | null
          pet_types: string[] | null
          phone: string | null
          preferred_cities: string[] | null
          preferred_countries: string[] | null
          preferred_regions: string[] | null
          sit_style: string | null
          social_links: Json | null
          updated_at: string
          user_id: string
          why_i_sit: string | null
        }
        Insert: {
          age_range?: string | null
          availability_type?: string | null
          available_from?: string | null
          available_to?: string | null
          background_check?: boolean | null
          bio?: string | null
          comfortable_with?: string[] | null
          created_at?: string
          experience_details?: string | null
          experience_level?: string | null
          gallery?: string[] | null
          headline?: string | null
          home_preferences?: string[] | null
          house_rules_compatibility?: string[] | null
          id?: string
          id_verified?: boolean | null
          is_active?: boolean
          is_visible?: boolean
          languages?: string[] | null
          latitude?: number | null
          longitude?: number | null
          pet_types?: string[] | null
          phone?: string | null
          preferred_cities?: string[] | null
          preferred_countries?: string[] | null
          preferred_regions?: string[] | null
          sit_style?: string | null
          social_links?: Json | null
          updated_at?: string
          user_id: string
          why_i_sit?: string | null
        }
        Update: {
          age_range?: string | null
          availability_type?: string | null
          available_from?: string | null
          available_to?: string | null
          background_check?: boolean | null
          bio?: string | null
          comfortable_with?: string[] | null
          created_at?: string
          experience_details?: string | null
          experience_level?: string | null
          gallery?: string[] | null
          headline?: string | null
          home_preferences?: string[] | null
          house_rules_compatibility?: string[] | null
          id?: string
          id_verified?: boolean | null
          is_active?: boolean
          is_visible?: boolean
          languages?: string[] | null
          latitude?: number | null
          longitude?: number | null
          pet_types?: string[] | null
          phone?: string | null
          preferred_cities?: string[] | null
          preferred_countries?: string[] | null
          preferred_regions?: string[] | null
          sit_style?: string | null
          social_links?: Json | null
          updated_at?: string
          user_id?: string
          why_i_sit?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          onboarding_completed: boolean | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          onboarding_completed?: boolean | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          onboarding_completed?: boolean | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      welcome_guide_access: {
        Row: {
          alarm_instructions: string | null
          created_at: string
          door_codes: string | null
          key_handover: string | null
          listing_id: string
          na_fields: string[]
          owner_user_id: string
          updated_at: string
          wifi_details: string | null
        }
        Insert: {
          alarm_instructions?: string | null
          created_at?: string
          door_codes?: string | null
          key_handover?: string | null
          listing_id: string
          na_fields?: string[]
          owner_user_id: string
          updated_at?: string
          wifi_details?: string | null
        }
        Update: {
          alarm_instructions?: string | null
          created_at?: string
          door_codes?: string | null
          key_handover?: string | null
          listing_id?: string
          na_fields?: string[]
          owner_user_id?: string
          updated_at?: string
          wifi_details?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "welcome_guide_access_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      welcome_guide_photos: {
        Row: {
          created_at: string
          id: string
          instruction: string | null
          listing_id: string
          note: string | null
          owner_user_id: string
          pet_id: string | null
          section: string
          sort_order: number
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instruction?: string | null
          listing_id: string
          note?: string | null
          owner_user_id: string
          pet_id?: string | null
          section: string
          sort_order?: number
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instruction?: string | null
          listing_id?: string
          note?: string | null
          owner_user_id?: string
          pet_id?: string | null
          section?: string
          sort_order?: number
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "welcome_guide_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welcome_guide_photos_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      welcome_guides: {
        Row: {
          appliances: string | null
          bins_recycling: string | null
          created_at: string
          emergency_contacts: string | null
          heating_cooling: string | null
          house_notes: string | null
          id: string
          listing_id: string
          migrated_notes: string | null
          na_fields: string[]
          neighbours: string | null
          out_of_hours_vet: string | null
          owner_user_id: string
          parking: string | null
          plants: string | null
          updated_at: string
        }
        Insert: {
          appliances?: string | null
          bins_recycling?: string | null
          created_at?: string
          emergency_contacts?: string | null
          heating_cooling?: string | null
          house_notes?: string | null
          id?: string
          listing_id: string
          migrated_notes?: string | null
          na_fields?: string[]
          neighbours?: string | null
          out_of_hours_vet?: string | null
          owner_user_id: string
          parking?: string | null
          plants?: string | null
          updated_at?: string
        }
        Update: {
          appliances?: string | null
          bins_recycling?: string | null
          created_at?: string
          emergency_contacts?: string | null
          heating_cooling?: string | null
          house_notes?: string | null
          id?: string
          listing_id?: string
          migrated_notes?: string | null
          na_fields?: string[]
          neighbours?: string | null
          out_of_hours_vet?: string | null
          owner_user_id?: string
          parking?: string | null
          plants?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "welcome_guides_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          country: string | null
          email_verified: boolean | null
          first_name: string | null
          founding_member: boolean | null
          id: string | null
          id_verified: boolean | null
          phone_verified: boolean | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          email_verified?: boolean | null
          first_name?: string | null
          founding_member?: boolean | null
          id?: string | null
          id_verified?: boolean | null
          phone_verified?: boolean | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          email_verified?: boolean | null
          first_name?: string | null
          founding_member?: boolean | null
          id?: string | null
          id_verified?: boolean | null
          phone_verified?: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_application: { Args: { p_application_id: string }; Returns: Json }
      accept_invite: {
        Args: { p_invite_id: string; p_message?: string }
        Returns: string
      }
      account_storage_objects: {
        Args: { p_user_id: string }
        Returns: {
          bucket_id: string
          name: string
        }[]
      }
      acquire_job_lease: {
        Args: { p_job_name: string; p_lease_seconds: number }
        Returns: boolean
      }
      admin_chat_photo_cleanup_preview: { Args: never; Returns: Json }
      admin_checkin_photo_cleanup_preview: { Args: never; Returns: Json }
      admin_clear_public_chat_photo_messages: { Args: never; Returns: Json }
      admin_clear_public_checkin_photo_refs: { Args: never; Returns: Json }
      admin_dashboard_stats: {
        Args: never
        Returns: {
          active_members: number
          active_perks: number
          founding_code_max: number
          founding_code_used: number
          founding_members: number
          open_sit_dates: number
          pending_verifications: number
          published_listings: number
          total_members: number
        }[]
      }
      admin_decide_id_verification: {
        Args: { p_decision: string; p_notes?: string; p_submission_id: string }
        Returns: string
      }
      admin_get_listing_allowance: {
        Args: { p_user_id: string }
        Returns: Json
      }
      admin_get_member_contact: { Args: { p_user_id: string }; Returns: Json }
      admin_get_pending_counts: {
        Args: never
        Returns: {
          flags_pending: number
          reports_pending: number
          verifications_pending: number
        }[]
      }
      admin_list_community_strikes: {
        Args: never
        Returns: {
          category: string
          flag_count: number
          id: string
          listing_title: string
          review_status: string
          show_strike_three_warning: boolean
          strike_two_email_sent_at: string
          subject_id: string
          subject_name: string
          subject_type: string
          subject_user_id: string
          updated_at: string
        }[]
      }
      admin_list_flag_incidents: {
        Args: {
          p_category: string
          p_subject_id: string
          p_subject_type: string
        }
        Returns: {
          evidence_photo_url: string
          evidence_reason: string
          flag_id: string
          flagged_at: string
          reporter_name: string
          review_id: string
          review_text: string
          sit_id: string
        }[]
      }
      admin_list_id_verifications: {
        Args: never
        Returns: {
          created_at: string
          email: string
          first_name: string
          id: string
          id_photo_path: string
          last_name: string
          notes: string
          reviewed_at: string
          reviewed_by: string
          selfie_path: string
          status: string
          user_id: string
        }[]
      }
      admin_list_members: {
        Args: never
        Returns: {
          city: string
          country: string
          created_at: string
          email: string
          email_verified: boolean
          first_name: string
          founding_member: boolean
          id: string
          id_verified: boolean
          is_admin: boolean
          last_name: string
          membership_status: string
          membership_type: string
          phone_verified: boolean
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      admin_list_perks: {
        Args: never
        Returns: {
          affiliate_url: string
          benefit_short: string
          category: string
          created_at: string
          description: string | null
          discount_code: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          is_featured: boolean
          logo_url: string | null
          name: string
          slug: string
          sort_order: number
          subid_param: string | null
          terms: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "perks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_published_listings: {
        Args: never
        Returns: {
          city: string
          country: string
          created_at: string
          id: string
          open_dates_count: number
          owner_name: string
          photo_url: string
          title: string
        }[]
      }
      admin_list_reliability_reviews: {
        Args: never
        Returns: {
          email: string
          full_name: string
          last_strike_at: string
          reliability_score: number
          strike_count: number
          user_id: string
        }[]
      }
      admin_list_reports: {
        Args: never
        Returns: {
          created_at: string
          details: string
          evidence_paths: string[]
          id: string
          reason: string
          reporter_email: string
          reporter_name: string
          reporter_user_id: string
          status: Database["public"]["Enums"]["report_status"]
          target_email: string
          target_id: string
          target_name: string
          target_profile_user_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
          updated_at: string
        }[]
      }
      admin_perk_click_stats: {
        Args: never
        Returns: {
          clicks_30d: number
          perk_id: string
          total_clicks: number
        }[]
      }
      admin_queue_photo_alt_text: {
        Args: { p_story_id: string }
        Returns: undefined
      }
      admin_queue_sit_story: { Args: { p_sit_id: string }; Returns: string }
      admin_set_max_listings: {
        Args: { p_max_listings: number; p_user_id: string }
        Returns: number
      }
      admin_set_report_status: {
        Args: {
          p_report_id: string
          p_status: Database["public"]["Enums"]["report_status"]
        }
        Returns: undefined
      }
      advance_sit_statuses: { Args: never; Returns: undefined }
      answer_guide_question: {
        Args: {
          p_answer: string
          p_arrival_only?: boolean
          p_question_id: string
        }
        Returns: Json
      }
      arrival_photo_file_deletable: {
        Args: { p_path: string }
        Returns: boolean
      }
      arrival_photo_is_evidence: { Args: { p_path: string }; Returns: boolean }
      arrival_photo_sit_is_mine: {
        Args: { p_sit_id: string }
        Returns: boolean
      }
      attach_report_evidence: {
        Args: { p_paths: string[]; p_report_id: string }
        Returns: string[]
      }
      can_access_city_chat: {
        Args: { p_room_id: string; p_user_id: string }
        Returns: boolean
      }
      can_publish_listing: { Args: never; Returns: boolean }
      can_read_chat_photo: { Args: { p_name: string }; Returns: boolean }
      can_read_sit_update_photo: { Args: { p_name: string }; Returns: boolean }
      canonical_pet_type: { Args: { p_type: string }; Returns: string }
      can_upload_chat_photo: { Args: { p_name: string }; Returns: boolean }
      can_upload_sit_update_photo: {
        Args: { p_name: string }
        Returns: boolean
      }
      chat_photo_conversation: { Args: { p_name: string }; Returns: string }
      city_chat_key: {
        Args: { p_city: string; p_country: string }
        Returns: string
      }
      city_chat_nomad_count: { Args: { p_room_id: string }; Returns: number }
      city_chat_thread_summaries: {
        Args: { p_room_id: string }
        Returns: {
          last_reply_at: string
          parent_message_id: string
          replier_avatars: string[]
          reply_count: number
        }[]
      }
      create_sit_story_share_link: {
        Args: { p_story_id: string }
        Returns: string
      }
      decide_sit_story_portfolio: {
        Args: {
          p_decision: string
          p_photo_paths?: string[]
          p_story_id: string
        }
        Returns: string
      }
      decline_application: {
        Args: { p_application_id: string; p_note?: string }
        Returns: Json
      }
      disable_my_sit_story_share_link: {
        Args: { p_story_id: string }
        Returns: undefined
      }
      disable_sit_story_share_links: {
        Args: { p_story_id: string }
        Returns: undefined
      }
      expired_id_documents: {
        Args: never
        Returns: {
          id: string
          id_photo_path: string
          selfie_path: string
        }[]
      }
      export_account_data: { Args: { p_user_id: string }; Returns: Json }
      export_account_files: {
        Args: { p_user_id: string }
        Returns: {
          bucket_id: string
          name: string
        }[]
      }
      get_community_warnings: {
        Args: { p_subject_id: string; p_subject_type: string }
        Returns: string[]
      }
      get_conversation_active_sits: {
        Args: { p_conversation_ids: string[] }
        Returns: Json
      }
      get_guide_completion: { Args: { p_listing_id: string }; Returns: Json }
      get_listing_exact_location: {
        Args: { p_listing_id: string }
        Returns: Json
      }
      get_listing_applicants: {
        Args: { p_listing_id: string }
        Returns: {
          application_id: string
          avatar_url: string
          avg_rating: number
          city: string
          country: string
          created_at: string
          end_date: string
          first_name: string
          fit_free_from: string
          fit_free_nights: number
          fit_free_to: string
          fit_meds_ok: boolean
          fit_pets_known: string[]
          fit_pets_missing: string[]
          fit_same_city: boolean
          fit_total_nights: number
          founding_member: boolean
          highlights: string[]
          id_verified: boolean
          message: string
          owner_seen: boolean
          pet_types: string[]
          review_count: number
          review_rate: number
          sit_dates_id: string
          sit_id: string
          sit_status: string
          sitter_user_id: string
          start_date: string
          status: Database["public"]["Enums"]["application_status"]
          who_applying: string
        }[]
      }
      get_listing_private_address: {
        Args: { p_listing_id: string }
        Returns: string
      }
      get_my_contact_info: {
        Args: never
        Returns: {
          email: string
          owner_phone: string
          phone_line_type: string
          phone_number: string
          phone_verified: boolean
          sitter_phone: string
        }[]
      }
      get_my_dashboard_summary: { Args: never; Returns: Json }
      get_my_guide_windows: {
        Args: never
        Returns: {
          access_open: boolean
          ends_at: string
          listing_id: string
          sit_id: string
          timezone: string
          unlock_at: string
        }[]
      }
      get_my_membership: {
        Args: never
        Returns: {
          founding_member: boolean
          membership_expiry: string
          membership_status: string
          membership_type: string
        }[]
      }
      get_my_profile: { Args: never; Returns: Json }
      get_my_settings: { Args: never; Returns: Json }
      get_my_sit_stories: { Args: never; Returns: Json }
      get_my_verification: {
        Args: never
        Returns: {
          id_verified: boolean
          onfido_applicant_id: string
          onfido_check_id: string
        }[]
      }
      get_owner_guide_questions: {
        Args: { p_listing_id: string }
        Returns: Json
      }
      get_perk_discount_code: { Args: { p_slug: string }; Returns: string }
      get_pet_private_details: {
        Args: { p_listing_id: string }
        Returns: {
          behaviour_notes: string
          id: string
          medication_instructions: string
          vet_info: string
        }[]
      }
      get_portfolio_story: { Args: { p_story_id: string }; Returns: Json }
      get_public_member_cards: { Args: { p_user_ids: string[] }; Returns: Json }
      get_shared_sit_story: { Args: { p_token: string }; Returns: Json }
      get_sit_story: { Args: { p_story_id: string }; Returns: Json }
      get_sit_update_context: { Args: { p_sit_id: string }; Returns: Json }
      get_sitter_free_dates: { Args: { p_sitter_id: string }; Returns: Json }
      get_sitter_guide: { Args: { p_listing_id: string }; Returns: Json }
      get_sitter_portfolio: { Args: { p_sitter_id: string }; Returns: Json }
      get_unread_conversations_count: { Args: never; Returns: number }
      get_unread_messages_count: { Args: never; Returns: number }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      guide_photo_object_ok: {
        Args: { p_listing_id: string; p_path: string }
        Returns: boolean
      }
      guide_question_link_ok: {
        Args: {
          p_conversation_id: string
          p_question_id: string
          p_sender_id: string
        }
        Returns: boolean
      }
      hit_shared_sit_story: { Args: { p_token: string }; Returns: boolean }
      is_active_member: { Args: { _user_id: string }; Returns: boolean }
      is_admin_user: { Args: { _user_id: string }; Returns: boolean }
      is_owner_active: { Args: { _owner_user_id: string }; Returns: boolean }
      link_guide_question: {
        Args: { p_parent_id: string; p_question_id: string }
        Returns: boolean
      }
      listing_timezone: { Args: { p_listing_id: string }; Returns: string }
      log_sit_abandonment_flag: {
        Args: { p_note?: string; p_sit_id: string }
        Returns: undefined
      }
      mark_applications_seen: { Args: { p_ids: string[] }; Returns: number }
      mark_conversation_messages_read: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      mark_guide_question_asked: {
        Args: { p_question_id: string }
        Returns: undefined
      }
      mark_id_documents_deleted: { Args: { p_ids: string[] }; Returns: number }
      member_review_rates: {
        Args: { p_user_ids: string[] }
        Returns: {
          review_rate: number
          reviews_written: number
          sits_attended: number
          user_id: string
        }[]
      }
      nomad_profile_shared_with_me: {
        Args: { p_sitter_id: string }
        Returns: boolean
      }
      notify_application_status: {
        Args: {
          p_application_id: string
          p_note?: string
          p_sit_id?: string
          p_status: string
        }
        Returns: undefined
      }
      notify_guide_unlocks: { Args: never; Returns: number }
      prepare_account_deletion: { Args: { p_user_id: string }; Returns: Json }
      profile_is_discoverable: { Args: { p_user_id: string }; Returns: boolean }
      public_founding_spots: {
        Args: never
        Returns: {
          cap: number
          spots_left: number
        }[]
      }
      purge_expired_safety_records: { Args: never; Returns: Json }
      random_point_near: {
        Args: { p_lat: number; p_lng: number; p_radius_m?: number }
        Returns: {
          lat: number
          lng: number
        }[]
      }
      redeem_founding_member_code: {
        Args: { p_code: string; p_user_id: string }
        Returns: string
      }
      release_job_lease: { Args: { p_job_name: string }; Returns: undefined }
      remove_listing_dates: { Args: { p_sit_dates_id: string }; Returns: Json }
      remove_guide_question: { Args: { p_question_id: string }; Returns: Json }
      remove_sit_story_portfolio_photo: {
        Args: { p_path: string; p_story_id: string }
        Returns: string[]
      }
      request_internal_function: {
        Args: { p_body?: Json; p_function: string }
        Returns: number
      }
      request_is_end_user: { Args: never; Returns: boolean }
      request_listing_timezone_backfill: { Args: never; Returns: undefined }
      request_privacy_retention: { Args: never; Returns: undefined }
      requeue_sit_stories: { Args: never; Returns: number }
      respond_to_sit_reschedule: {
        Args: { p_accept: boolean; p_request_id: string }
        Returns: Json
      }
      set_guide_question_dismissed: {
        Args: { p_dismissed: boolean; p_question_id: string }
        Returns: Json
      }
      set_guide_question_draft: {
        Args: { p_draft: string; p_question_id: string }
        Returns: Json
      }
      set_my_availability: { Args: { p_ranges: Json }; Returns: Json }
      set_my_preferred_language: {
        Args: { p_language: string; p_only_if_empty?: boolean }
        Returns: string
      }
      set_my_profile_phone: {
        Args: { p_phone: string; p_target: string }
        Returns: undefined
      }
      set_my_story_name_sharing: {
        Args: { p_allow: boolean }
        Returns: boolean
      }
      set_sit_story_portfolio_request: {
        Args: { p_request: boolean; p_story_id: string }
        Returns: string
      }
      scrub_contact_details: { Args: { p_text: string }; Returns: string }
      shortlist_application: {
        Args: { p_application_id: string }
        Returns: Json
      }
      sit_guide_window: {
        Args: { p_sit_id: string }
        Returns: {
          ends_at: string
          timezone: string
          unlock_at: string
        }[]
      }
      sit_story_allowed: {
        Args: { p_owner: string; p_sitter: string }
        Returns: boolean
      }
      sit_update_due: { Args: { p_sit_id: string }; Returns: Json }
      sit_update_photo_sit: { Args: { p_name: string }; Returns: string }
      sitter_guide_sit: {
        Args: { p_listing_id: string; p_user_id: string }
        Returns: {
          ends_at: string
          sit_dates_id: string
          sit_id: string
          timezone: string
          unlock_at: string
        }[]
      }
      toggle_checkin_heart: { Args: { p_checkin_id: string }; Returns: Json }
      unaccent_fallback: { Args: { p_text: string }; Returns: string }
      unshortlist_application: {
        Args: { p_application_id: string }
        Returns: Json
      }
      update_reminders_due: {
        Args: never
        Returns: {
          listing_title: string
          owner_first_name: string
          sit_id: string
          sitter_user_id: string
          style: string
        }[]
      }
      upsert_push_subscription: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string }
        Returns: undefined
      }
      withdraw_sit_story_portfolio: {
        Args: { p_story_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "sitter" | "owner" | "both"
      application_status:
        | "applied"
        | "shortlisted"
        | "accepted"
        | "declined"
        | "withdrawn"
        | "cancelled"
      conversation_type: "listing" | "direct" | "city_chat"
      listing_status: "draft" | "published" | "paused"
      report_status: "pending" | "reviewed" | "resolved" | "dismissed"
      report_target_type: "user" | "listing" | "message" | "sit_story"
      sit_date_status: "open" | "closed" | "booked"
      sit_status: "confirmed" | "in_progress" | "completed" | "cancelled"
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
    Enums: {
      app_role: ["sitter", "owner", "both"],
      application_status: [
        "applied",
        "shortlisted",
        "accepted",
        "declined",
        "withdrawn",
        "cancelled",
      ],
      conversation_type: ["listing", "direct", "city_chat"],
      listing_status: ["draft", "published", "paused"],
      report_status: ["pending", "reviewed", "resolved", "dismissed"],
      report_target_type: ["user", "listing", "message", "sit_story"],
      sit_date_status: ["open", "closed", "booked"],
      sit_status: ["confirmed", "in_progress", "completed", "cancelled"],
    },
  },
} as const
