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
      conversations: {
        Row: {
          created_at: string
          id: string
          listing_id: string | null
          owner_user_id: string
          sitter_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id?: string | null
          owner_user_id: string
          sitter_user_id: string
          updated_at?: string
        }
        Update: {
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
      listings: {
        Row: {
          address_private: string | null
          amenities: string[] | null
          area: string | null
          city: string | null
          communication_style: string | null
          country: string | null
          created_at: string
          description: string | null
          home_care_tasks: string[] | null
          home_care_tasks_other: string | null
          home_type: string | null
          house_rules: string[] | null
          house_rules_other: string | null
          id: string
          ideal_sitter_description: string | null
          owner_user_id: string
          photos: string[] | null
          requirements: string[] | null
          requirements_other: string | null
          sleeping_arrangement: string | null
          status: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at: string
          wifi_quality: string | null
        }
        Insert: {
          address_private?: string | null
          amenities?: string[] | null
          area?: string | null
          city?: string | null
          communication_style?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          home_care_tasks?: string[] | null
          home_care_tasks_other?: string | null
          home_type?: string | null
          house_rules?: string[] | null
          house_rules_other?: string | null
          id?: string
          ideal_sitter_description?: string | null
          owner_user_id: string
          photos?: string[] | null
          requirements?: string[] | null
          requirements_other?: string | null
          sleeping_arrangement?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at?: string
          wifi_quality?: string | null
        }
        Update: {
          address_private?: string | null
          amenities?: string[] | null
          area?: string | null
          city?: string | null
          communication_style?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          home_care_tasks?: string[] | null
          home_care_tasks_other?: string | null
          home_type?: string | null
          house_rules?: string[] | null
          house_rules_other?: string | null
          id?: string
          ideal_sitter_description?: string | null
          owner_user_id?: string
          photos?: string[] | null
          requirements?: string[] | null
          requirements_other?: string | null
          sleeping_arrangement?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          title?: string
          updated_at?: string
          wifi_quality?: string | null
        }
        Relationships: []
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
      owner_profiles: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
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
          city: string | null
          country: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id: string
          last_name?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
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
      reviews: {
        Row: {
          created_at: string
          id: string
          rating: number
          reviewee_user_id: string
          reviewer_user_id: string
          sit_id: string
          text: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          rating: number
          reviewee_user_id: string
          reviewer_user_id: string
          sit_id: string
          text?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          rating?: number
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
      sit_dates: {
        Row: {
          created_at: string
          end_date: string
          flexibility: string | null
          handover_preference: string | null
          id: string
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
          languages: string[] | null
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
          languages?: string[] | null
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
          languages?: string[] | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
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
      app_role: ["sitter", "owner", "both"],
      application_status: [
        "applied",
        "shortlisted",
        "accepted",
        "declined",
        "withdrawn",
      ],
      listing_status: ["draft", "published", "paused"],
      report_status: ["pending", "reviewed", "resolved", "dismissed"],
      report_target_type: ["user", "listing", "message"],
      sit_date_status: ["open", "closed", "booked"],
      sit_status: ["confirmed", "in_progress", "completed", "cancelled"],
    },
  },
} as const
