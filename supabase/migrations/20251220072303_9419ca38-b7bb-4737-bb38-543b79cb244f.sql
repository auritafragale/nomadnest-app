-- Create storage bucket for listing images
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-images', 'listing-images', true);

-- Allow authenticated users to upload images to their own folders
CREATE POLICY "Users can upload listing images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'listing-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow anyone to view listing images (public bucket)
CREATE POLICY "Anyone can view listing images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'listing-images');

-- Allow users to update their own images
CREATE POLICY "Users can update own listing images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'listing-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own images
CREATE POLICY "Users can delete own listing images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'listing-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);