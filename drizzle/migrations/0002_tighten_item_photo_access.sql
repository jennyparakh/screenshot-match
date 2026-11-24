DROP POLICY IF EXISTS "View item photos" ON storage.objects;

CREATE POLICY "Owners view own item photos" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'item-photos'
  AND owner_id = (select auth.uid())::text
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

CREATE POLICY "Anyone views photos of open listings" ON storage.objects
FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'item-photos'
  AND EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.image_path = objects.name
      AND NOT i.resolved
      AND i.user_id::text = (storage.foldername(objects.name))[1]
      AND i.user_id::text = objects.owner_id
  )
);