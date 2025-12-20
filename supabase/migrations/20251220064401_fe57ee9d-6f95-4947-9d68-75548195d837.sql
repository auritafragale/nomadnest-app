-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('sitter', 'owner', 'both');

-- Create enum for listing status
CREATE TYPE public.listing_status AS ENUM ('draft', 'published', 'paused');

-- Create enum for sit_date status
CREATE TYPE public.sit_date_status AS ENUM ('open', 'closed', 'booked');

-- Create enum for application status
CREATE TYPE public.application_status AS ENUM ('applied', 'shortlisted', 'accepted', 'declined', 'withdrawn');

-- Create enum for sit status
CREATE TYPE public.sit_status AS ENUM ('confirmed', 'in_progress', 'completed', 'cancelled');

-- Create enum for report target type
CREATE TYPE public.report_target_type AS ENUM ('user', 'listing', 'message');

-- Create enum for report status
CREATE TYPE public.report_status AS ENUM ('pending', 'reviewed', 'resolved', 'dismissed');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  country TEXT,
  city TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create user_roles table (separate for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'sitter',
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE (user_id)
);

-- Create sitter_profiles table
CREATE TABLE public.sitter_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  headline TEXT,
  bio TEXT,
  why_i_sit TEXT,
  experience_level TEXT,
  experience_details TEXT,
  languages TEXT[] DEFAULT '{}',
  comfortable_with TEXT[] DEFAULT '{}',
  pet_types TEXT[] DEFAULT '{}',
  sit_style TEXT,
  home_preferences TEXT[] DEFAULT '{}',
  house_rules_compatibility TEXT[] DEFAULT '{}',
  availability_type TEXT,
  available_from DATE,
  available_to DATE,
  preferred_regions TEXT[] DEFAULT '{}',
  preferred_countries TEXT[] DEFAULT '{}',
  preferred_cities TEXT[] DEFAULT '{}',
  phone TEXT,
  id_verified BOOLEAN DEFAULT FALSE,
  background_check BOOLEAN DEFAULT FALSE,
  social_links JSONB DEFAULT '[]',
  gallery TEXT[] DEFAULT '{}',
  age_range TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create owner_profiles table
CREATE TABLE public.owner_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  bio TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create listings table
CREATE TABLE public.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  country TEXT,
  city TEXT,
  area TEXT,
  address_private TEXT,
  home_type TEXT,
  sleeping_arrangement TEXT,
  amenities TEXT[] DEFAULT '{}',
  wifi_quality TEXT,
  house_rules TEXT[] DEFAULT '{}',
  house_rules_other TEXT,
  home_care_tasks TEXT[] DEFAULT '{}',
  home_care_tasks_other TEXT,
  ideal_sitter_description TEXT,
  requirements TEXT[] DEFAULT '{}',
  requirements_other TEXT,
  communication_style TEXT,
  photos TEXT[] DEFAULT '{}',
  status listing_status DEFAULT 'draft' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create pets table
CREATE TABLE public.pets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  name TEXT,
  age TEXT,
  personality TEXT,
  daily_routine TEXT,
  feeding_details TEXT,
  walks_exercise TEXT,
  has_medication BOOLEAN DEFAULT FALSE,
  medication_instructions TEXT,
  vet_info TEXT,
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create sit_dates table
CREATE TABLE public.sit_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  flexibility TEXT,
  handover_preference TEXT,
  status sit_date_status DEFAULT 'open' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create applications table
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  sit_dates_id UUID REFERENCES public.sit_dates(id) ON DELETE CASCADE NOT NULL,
  sitter_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message TEXT,
  who_applying TEXT,
  highlights TEXT[] DEFAULT '{}',
  status application_status DEFAULT 'applied' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create conversations table
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sitter_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create sits table (confirmed sits)
CREATE TABLE public.sits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE NOT NULL,
  sit_dates_id UUID REFERENCES public.sit_dates(id) ON DELETE CASCADE NOT NULL,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sitter_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status sit_status DEFAULT 'confirmed' NOT NULL,
  confirmed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create reviews table
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sit_id UUID REFERENCES public.sits(id) ON DELETE CASCADE NOT NULL,
  reviewer_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  reviewee_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create reports table
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  target_type report_target_type NOT NULL,
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status report_status DEFAULT 'pending' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name'
  );
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sitter_profiles_updated_at BEFORE UPDATE ON public.sitter_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_owner_profiles_updated_at BEFORE UPDATE ON public.owner_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_listings_updated_at BEFORE UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pets_updated_at BEFORE UPDATE ON public.pets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sit_dates_updated_at BEFORE UPDATE ON public.sit_dates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sits_updated_at BEFORE UPDATE ON public.sits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sitter_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sit_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own role" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own role" ON public.user_roles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for sitter_profiles
CREATE POLICY "Anyone can view sitter profiles" ON public.sitter_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own sitter profile" ON public.sitter_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sitter profile" ON public.sitter_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sitter profile" ON public.sitter_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for owner_profiles
CREATE POLICY "Anyone can view owner profiles" ON public.owner_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own owner profile" ON public.owner_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own owner profile" ON public.owner_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own owner profile" ON public.owner_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for listings
CREATE POLICY "Anyone can view published listings" ON public.listings FOR SELECT USING (status = 'published' OR auth.uid() = owner_user_id);
CREATE POLICY "Owners can insert listings" ON public.listings FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Owners can update own listings" ON public.listings FOR UPDATE TO authenticated USING (auth.uid() = owner_user_id);
CREATE POLICY "Owners can delete own listings" ON public.listings FOR DELETE TO authenticated USING (auth.uid() = owner_user_id);

-- RLS Policies for pets
CREATE POLICY "Anyone can view pets of visible listings" ON public.pets FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.listings WHERE id = listing_id AND (status = 'published' OR owner_user_id = auth.uid()))
);
CREATE POLICY "Owners can insert pets" ON public.pets FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.listings WHERE id = listing_id AND owner_user_id = auth.uid())
);
CREATE POLICY "Owners can update pets" ON public.pets FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.listings WHERE id = listing_id AND owner_user_id = auth.uid())
);
CREATE POLICY "Owners can delete pets" ON public.pets FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.listings WHERE id = listing_id AND owner_user_id = auth.uid())
);

-- RLS Policies for sit_dates
CREATE POLICY "Anyone can view sit_dates of visible listings" ON public.sit_dates FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.listings WHERE id = listing_id AND (status = 'published' OR owner_user_id = auth.uid()))
);
CREATE POLICY "Owners can insert sit_dates" ON public.sit_dates FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.listings WHERE id = listing_id AND owner_user_id = auth.uid())
);
CREATE POLICY "Owners can update sit_dates" ON public.sit_dates FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.listings WHERE id = listing_id AND owner_user_id = auth.uid())
);
CREATE POLICY "Owners can delete sit_dates" ON public.sit_dates FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.listings WHERE id = listing_id AND owner_user_id = auth.uid())
);

-- RLS Policies for applications
CREATE POLICY "Sitters can view own applications" ON public.applications FOR SELECT TO authenticated USING (sitter_user_id = auth.uid());
CREATE POLICY "Owners can view applications for their listings" ON public.applications FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.listings WHERE id = listing_id AND owner_user_id = auth.uid())
);
CREATE POLICY "Sitters can insert applications" ON public.applications FOR INSERT TO authenticated WITH CHECK (sitter_user_id = auth.uid());
CREATE POLICY "Sitters can update own applications" ON public.applications FOR UPDATE TO authenticated USING (sitter_user_id = auth.uid());
CREATE POLICY "Owners can update applications for their listings" ON public.applications FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.listings WHERE id = listing_id AND owner_user_id = auth.uid())
);

-- RLS Policies for conversations
CREATE POLICY "Users can view own conversations" ON public.conversations FOR SELECT TO authenticated USING (
  auth.uid() = owner_user_id OR auth.uid() = sitter_user_id
);
CREATE POLICY "Users can insert conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = owner_user_id OR auth.uid() = sitter_user_id
);

-- RLS Policies for messages
CREATE POLICY "Users can view messages in own conversations" ON public.messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.conversations WHERE id = conversation_id AND (owner_user_id = auth.uid() OR sitter_user_id = auth.uid()))
);
CREATE POLICY "Users can insert messages in own conversations" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  sender_user_id = auth.uid() AND
  EXISTS (SELECT 1 FROM public.conversations WHERE id = conversation_id AND (owner_user_id = auth.uid() OR sitter_user_id = auth.uid()))
);
CREATE POLICY "Users can update own messages" ON public.messages FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.conversations WHERE id = conversation_id AND (owner_user_id = auth.uid() OR sitter_user_id = auth.uid()))
);

-- RLS Policies for sits
CREATE POLICY "Users can view own sits" ON public.sits FOR SELECT TO authenticated USING (
  auth.uid() = owner_user_id OR auth.uid() = sitter_user_id
);
CREATE POLICY "Owners can insert sits" ON public.sits FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Participants can update sits" ON public.sits FOR UPDATE TO authenticated USING (
  auth.uid() = owner_user_id OR auth.uid() = sitter_user_id
);

-- RLS Policies for reviews
CREATE POLICY "Anyone can view reviews" ON public.reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sit participants can insert reviews" ON public.reviews FOR INSERT TO authenticated WITH CHECK (
  reviewer_user_id = auth.uid() AND
  EXISTS (SELECT 1 FROM public.sits WHERE id = sit_id AND status = 'completed' AND (owner_user_id = auth.uid() OR sitter_user_id = auth.uid()))
);

-- RLS Policies for reports
CREATE POLICY "Users can view own reports" ON public.reports FOR SELECT TO authenticated USING (reporter_user_id = auth.uid());
CREATE POLICY "Users can insert reports" ON public.reports FOR INSERT TO authenticated WITH CHECK (reporter_user_id = auth.uid());

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;