// Column lists for profile tables.
// Phone numbers are intentionally excluded: they are not readable through the
// Data API (see the contact-info security lookup) so `select("*")` would fail.

export const SITTER_PROFILE_COLUMNS = [
  "id",
  "user_id",
  "headline",
  "bio",
  "why_i_sit",
  "experience_level",
  "experience_details",
  "languages",
  "comfortable_with",
  "pet_types",
  "sit_style",
  "home_preferences",
  "house_rules_compatibility",
  "availability_type",
  "available_from",
  "available_to",
  "preferred_regions",
  "preferred_countries",
  "preferred_cities",
  "id_verified",
  "background_check",
  "social_links",
  "gallery",
  "age_range",
  "created_at",
  "updated_at",
  "is_active",
  "latitude",
  "longitude",
  "is_visible",
].join(", ");

export const OWNER_PROFILE_COLUMNS = [
  "id",
  "user_id",
  "bio",
  "created_at",
  "updated_at",
  "is_active",
].join(", ");

export interface MyContactInfo {
  email: string | null;
  phone_number: string | null;
  phone_verified: boolean | null;
  phone_line_type: string | null;
  sitter_phone: string | null;
  owner_phone: string | null;
}
