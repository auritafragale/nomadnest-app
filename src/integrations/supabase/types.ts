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
      applications: {
        Row: {
          created_at: string
          highlights: string[] | null
          id: string
          listing_id: string
          message: string | null
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
          parent_message_id: string | null
          room_id: string
          sender_user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          parent_message_id?: string | null
          room_id: string
          sender_user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
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
      community_flags: {
        Row: {
          category: string
          created_at: string
          id: string
          reporter_user_id: string
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
          reporter_user_id: string
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
          reporter_user_id?: string
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
      community_strikes: {
        Row: {
          category: string
          created_at: string
          flag_count: number
          id: string
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
          show_strike_three_warning?: boolean
          strike_two_email_sent_at?: string | null
          subject_id?: string
          subject_type?: string
          subject_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          conversation_type: Database["public"]["Enums"]["conversation_type"]
          created_at: string
          id: string
          listing_id: string | null
          owner_user_id: string
          sitter_user_id: string
          updated_at: string
        }
        Insert: {
          conversation_type?: Database["public"]["Enums"]["conversation_type"]
          created_at?: string
          id?: string
          listing_id?: string | null
          owner_user_id: string
          sitter_user_id: string
          updated_at?: string
        }
        Update: {
          conversation_type?: Database["public"]["Enums"]["conversation_type"]
          created_at?: string
          id?: string
          listing_id?: string | null
          owner_user_id?: string
          sitter_user_id?: string
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
        ]
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
      listings: {
        Row: {
          address_private: string | null
          amenities: string[] | null
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
          ideal_sitter_description: string | null
          latitude: number | null
          longitude: number | null
          owner_user_id: string
          photos: string[] | null
          remote_location: boolean
          requirements: string[] | null
          requirements_other: string | null
          sleeping_arrangement: string | null
          status: Database["public"]["Enums"]["listing_status"]
          timezone: string | null
          title: string
          updated_at: string
          wifi_quality: string | null
        }
        Insert: {
          address_private?: string | null
          amenities?: string[] | null
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
          ideal_sitter_description?: string | null
          latitude?: number | null
          longitude?: number | null
          owner_user_id: string
          photos?: string[] | null
          remote_location?: boolean
          requirements?: string[] | null
          requirements_other?: string | null
          sleeping_arrangement?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          timezone?: string | null
          title: string
          updated_at?: string
          wifi_quality?: string | null
        }
        Update: {
          address_private?: string | null
          amenities?: string[] | null
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
          ideal_sitter_description?: string | null
          latitude?: number | null
          longitude?: number | null
          owner_user_id?: string
          photos?: string[] | null
          remote_location?: boolean
          requirements?: string[] | null
          requirements_other?: string | null
          sleeping_arrangement?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          timezone?: string | null
          title?: string
          updated_at?: string
          wifi_quality?: string | null
        }
        Relationships: []
      }
      manual_id_verifications: {
        Row: {
          created_at: string
          id: string
          id_photo_path: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_path: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          id_photo_path: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          id_photo_path?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path?: string
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
          body: string
          conversation_id: string
          created_at: string
          id: string
          read_at: string | null
          sender_user_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_user_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
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
          founding_member: boolean | null
          full_name: string | null
          id: string
          id_verified: boolean | null
          is_admin: boolean
          last_name: string | null
          location: string | null
          membership_expiry: string | null
          membership_status: string | null
          membership_type: string | null
          onfido_applicant_id: string | null
          onfido_check_id: string | null
          phone_line_type: string | null
          phone_number: string | null
          phone_verified: boolean
          phone_verified_at: string | null
          reliability_score: number
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
          founding_member?: boolean | null
          full_name?: string | null
          id: string
          id_verified?: boolean | null
          is_admin?: boolean
          last_name?: string | null
          location?: string | null
          membership_expiry?: string | null
          membership_status?: string | null
          membership_type?: string | null
          onfido_applicant_id?: string | null
          onfido_check_id?: string | null
          phone_line_type?: string | null
          phone_number?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          reliability_score?: number
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
          founding_member?: boolean | null
          full_name?: string | null
          id?: string
          id_verified?: boolean | null
          is_admin?: boolean
          last_name?: string | null
          location?: string | null
          membership_expiry?: string | null
          membership_status?: string | null
          membership_type?: string | null
          onfido_applicant_id?: string | null
          onfido_check_id?: string | null
          phone_line_type?: string | null
          phone_number?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          reliability_score?: number
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
      reports: {
        Row: {
          created_at: string
          details: string | null
          evidence_paths: string[] | null
          id: string
          reason: string
          reporter_user_id: string
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
          reporter_user_id: string
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
          reporter_user_id?: string
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_type?: Database["public"]["Enums"]["report_target_type"]
          updated_at?: string
        }
        Relationships: []
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
          flag_pet_aggression: boolean
          flag_pet_neglect: boolean
          flag_sitter_cleanliness: boolean
          flag_undisclosed_cameras: boolean
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
          reviewee_user_id: string
          reviewer_user_id: string
          sit_id: string
          text: string | null
        }
        Insert: {
          created_at?: string
          flag_abandonment?: boolean
          flag_home_cleanliness?: boolean
          flag_pet_aggression?: boolean
          flag_pet_neglect?: boolean
          flag_sitter_cleanliness?: boolean
          flag_undisclosed_cameras?: boolean
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
          reviewee_user_id: string
          reviewer_user_id: string
          sit_id: string
          text?: string | null
        }
        Update: {
          created_at?: string
          flag_abandonment?: boolean
          flag_home_cleanliness?: boolean
          flag_pet_aggression?: boolean
          flag_pet_neglect?: boolean
          flag_sitter_cleanliness?: boolean
          flag_undisclosed_cameras?: boolean
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
          reviewee_user_id?: string
          reviewer_user_id?: string
          sit_id?: string
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
          author_user_id: string
          created_at: string
          id: string
          kind: string
          note: string | null
          photo_url: string | null
          sit_id: string
        }
        Insert: {
          author_user_id: string
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          photo_url?: string | null
          sit_id: string
        }
        Update: {
          author_user_id?: string
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          photo_url?: string | null
          sit_id?: string
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
      sits: {
        Row: {
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          id: string
          listing_id: string
          owner_user_id: string
          sit_dates_id: string
          sitter_user_id: string
          status: Database["public"]["Enums"]["sit_status"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          listing_id: string
          owner_user_id: string
          sit_dates_id: string
          sitter_user_id: string
          status?: Database["public"]["Enums"]["sit_status"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          owner_user_id?: string
          sit_dates_id?: string
          sitter_user_id?: string
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
      welcome_guides: {
        Row: {
          created_at: string
          emergency_contacts: string | null
          feeding_schedule: string | null
          house_notes: string | null
          id: string
          listing_id: string | null
          owner_user_id: string
          updated_at: string
          vet_info: string | null
          wifi_info: string | null
        }
        Insert: {
          created_at?: string
          emergency_contacts?: string | null
          feeding_schedule?: string | null
          house_notes?: string | null
          id?: string
          listing_id?: string | null
          owner_user_id: string
          updated_at?: string
          vet_info?: string | null
          wifi_info?: string | null
        }
        Update: {
          created_at?: string
          emergency_contacts?: string | null
          feeding_schedule?: string | null
          house_notes?: string | null
          id?: string
          listing_id?: string | null
          owner_user_id?: string
          updated_at?: string
          vet_info?: string | null
          wifi_info?: string | null
        }
        Relationships: []
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
          full_name: string | null
          id: string | null
          id_verified: boolean | null
          last_name: string | null
          location: string | null
          phone_verified: boolean | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          email_verified?: boolean | null
          first_name?: string | null
          founding_member?: never
          full_name?: string | null
          id?: string | null
          id_verified?: boolean | null
          last_name?: string | null
          location?: string | null
          phone_verified?: boolean | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          email_verified?: boolean | null
          first_name?: string | null
          founding_member?: never
          full_name?: string | null
          id?: string | null
          id_verified?: boolean | null
          last_name?: string | null
          location?: string | null
          phone_verified?: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      acquire_job_lease: {
        Args: { p_job_name: string; p_lease_seconds: number }
        Returns: boolean
      }
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
      admin_list_community_strikes: {
        Args: never
        Returns: {
          category: string
          flag_count: number
          id: string
          listing_title: string
          show_strike_three_warning: boolean
          strike_two_email_sent_at: string
          subject_id: string
          subject_name: string
          subject_type: string
          subject_user_id: string
          updated_at: string
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
      admin_set_report_status: {
        Args: {
          p_report_id: string
          p_status: Database["public"]["Enums"]["report_status"]
        }
        Returns: undefined
      }
      advance_sit_statuses: { Args: never; Returns: undefined }
      can_access_city_chat: {
        Args: { p_room_id: string; p_user_id: string }
        Returns: boolean
      }
      city_chat_key: {
        Args: { p_city: string; p_country: string }
        Returns: string
      }
      city_chat_thread_summaries: {
        Args: { p_room_id: string }
        Returns: {
          last_reply_at: string
          parent_message_id: string
          replier_avatars: string[]
          reply_count: number
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
      get_my_membership: {
        Args: never
        Returns: {
          founding_member: boolean
          membership_expiry: string
          membership_status: string
          membership_type: string
        }[]
      }
      get_my_verification: {
        Args: never
        Returns: {
          id_verified: boolean
          onfido_applicant_id: string
          onfido_check_id: string
        }[]
      }
      get_perk_discount_code: { Args: { p_slug: string }; Returns: string }
      get_unread_conversations_count: { Args: never; Returns: number }
      get_unread_messages_count: { Args: never; Returns: number }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      is_active_member: { Args: { _user_id: string }; Returns: boolean }
      is_admin_user: { Args: { _user_id: string }; Returns: boolean }
      is_owner_active: { Args: { _owner_user_id: string }; Returns: boolean }
      mark_conversation_messages_read: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      member_review_rates: {
        Args: { p_user_ids: string[] }
        Returns: {
          review_rate: number
          reviews_written: number
          sits_attended: number
          user_id: string
        }[]
      }
      redeem_founding_member_code: {
        Args: { p_code: string; p_user_id: string }
        Returns: string
      }
      release_job_lease: { Args: { p_job_name: string }; Returns: undefined }
      request_is_end_user: { Args: never; Returns: boolean }
      set_my_profile_phone: {
        Args: { p_phone: string; p_target: string }
        Returns: undefined
      }
      unaccent_fallback: { Args: { p_text: string }; Returns: string }
      upsert_push_subscription: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string }
        Returns: undefined
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
      report_target_type: "user" | "listing" | "message"
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
      report_target_type: ["user", "listing", "message"],
      sit_date_status: ["open", "closed", "booked"],
      sit_status: ["confirmed", "in_progress", "completed", "cancelled"],
    },
  },
} as const
