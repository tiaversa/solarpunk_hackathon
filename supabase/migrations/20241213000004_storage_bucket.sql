INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hackathon_images',
  'hackathon_images',
  false,
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Only the owner of the path (userId prefix) can upload/delete.
-- Reads require a signed URL (bucket is private).
CREATE POLICY "Users can upload their own photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'hackathon_images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'hackathon_images' AND (storage.foldername(name))[1] = auth.uid()::text);
