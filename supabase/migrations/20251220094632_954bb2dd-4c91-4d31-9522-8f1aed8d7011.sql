-- Create notification_preferences table
CREATE TABLE public.notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  email_new_applications boolean NOT NULL DEFAULT true,
  email_messages boolean NOT NULL DEFAULT true,
  email_sit_updates boolean NOT NULL DEFAULT true,
  email_reviews boolean NOT NULL DEFAULT true,
  email_application_status boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own notification preferences" 
ON public.notification_preferences 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences" 
ON public.notification_preferences 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences" 
ON public.notification_preferences 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create sitter_invites table for owner to invite sitters
CREATE TABLE public.sitter_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  sit_dates_id uuid NOT NULL REFERENCES public.sit_dates(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  sitter_user_id uuid NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'applied', 'declined')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sitter_invites ENABLE ROW LEVEL SECURITY;

-- RLS policies for sitter_invites
CREATE POLICY "Owners can insert invites" 
ON public.sitter_invites 
FOR INSERT 
WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Owners can view sent invites" 
ON public.sitter_invites 
FOR SELECT 
USING (auth.uid() = owner_user_id);

CREATE POLICY "Sitters can view received invites" 
ON public.sitter_invites 
FOR SELECT 
USING (auth.uid() = sitter_user_id);

CREATE POLICY "Sitters can update received invites" 
ON public.sitter_invites 
FOR UPDATE 
USING (auth.uid() = sitter_user_id);

-- Create notifications table for in-app notifications
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  data jsonb DEFAULT '{}',
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for notifications
CREATE POLICY "Users can view own notifications" 
ON public.notifications 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" 
ON public.notifications 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create trigger for updated_at on notification_preferences
CREATE TRIGGER update_notification_preferences_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on sitter_invites
CREATE TRIGGER update_sitter_invites_updated_at
BEFORE UPDATE ON public.sitter_invites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();