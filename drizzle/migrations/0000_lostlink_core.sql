CREATE TABLE public.items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, title text NOT NULL CHECK (length(title) BETWEEN 2 AND 100), kind text NOT NULL CHECK(kind IN ('lost','found')), category text NOT NULL CHECK(category IN ('electronics','clothing','accessories','keys','bags','documents','other')), description text NOT NULL CHECK(length(description) BETWEEN 5 AND 1500), location text NOT NULL CHECK(length(location) BETWEEN 2 AND 120), event_date date NOT NULL, image_path text, resolved boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.items TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public open listings" ON public.items FOR SELECT USING (NOT resolved OR user_id=auth.uid());
CREATE POLICY "Create own listings" ON public.items FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid());
CREATE POLICY "Update own listings" ON public.items FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY "Delete own listings" ON public.items FOR DELETE TO authenticated USING(user_id=auth.uid());
CREATE TABLE public.requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE, sender_id uuid NOT NULL, recipient_id uuid NOT NULL, message text NOT NULL CHECK(length(message) BETWEEN 5 AND 1000), contact text NOT NULL CHECK(length(contact) BETWEEN 3 AND 255), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(item_id,sender_id));
GRANT SELECT,INSERT,UPDATE ON public.requests TO authenticated;
GRANT ALL ON public.requests TO service_role;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read requests" ON public.requests FOR SELECT TO authenticated USING(auth.uid() IN (sender_id,recipient_id));
CREATE POLICY "Send request to reporter" ON public.requests FOR INSERT TO authenticated WITH CHECK(sender_id=auth.uid() AND recipient_id<>auth.uid() AND status='pending' AND EXISTS(SELECT 1 FROM public.items WHERE id=item_id AND user_id=recipient_id AND NOT resolved));
CREATE POLICY "Recipient updates requests" ON public.requests FOR UPDATE TO authenticated USING(recipient_id=auth.uid()) WITH CHECK(recipient_id=auth.uid());
CREATE FUNCTION public.protect_request_fields() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NEW.sender_id<>OLD.sender_id OR NEW.recipient_id<>OLD.recipient_id OR NEW.item_id<>OLD.item_id OR NEW.message<>OLD.message OR NEW.contact<>OLD.contact THEN RAISE EXCEPTION 'Only request status can change'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER protect_request BEFORE UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.protect_request_fields();
CREATE POLICY "View item photos" ON storage.objects FOR SELECT USING(bucket_id='item-photos');
CREATE POLICY "Upload own item photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='item-photos' AND (storage.foldername(name))[1]=auth.uid()::text AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp'));
CREATE POLICY "Delete own item photos" ON storage.objects FOR DELETE TO authenticated USING(bucket_id='item-photos' AND (storage.foldername(name))[1]=auth.uid()::text);
ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.requests;
CREATE INDEX items_user_idx ON public.items(user_id);
CREATE INDEX requests_recipient_idx ON public.requests(recipient_id);
CREATE INDEX requests_sender_idx ON public.requests(sender_id);
CREATE INDEX requests_item_idx ON public.requests(item_id);
INSERT INTO public.items(user_id,title,kind,category,description,location,event_date,image_path) VALUES
('00000000-0000-0000-0000-000000000001','White wireless earbuds','found','electronics','Sample listing: white wireless earbuds in their charging case, found on a table.','Central Library','2026-11-20','sample:earbuds'),
('00000000-0000-0000-0000-000000000001','Sage green water bottle','found','accessories','Sample listing: green metal water bottle, no stickers.','Student Union','2026-11-20','sample:bottle'),
('00000000-0000-0000-0000-000000000001','Keys with a pink keychain','found','keys','Sample listing: two brass keys with a pink fabric keychain.','North Quad','2026-11-19','sample:keys'),
('00000000-0000-0000-0000-000000000001','Navy blue sweatshirt','found','clothing','Sample listing: navy cotton crewneck sweatshirt, size medium.','Sports Center','2026-11-19','sample:sweatshirt'),
('00000000-0000-0000-0000-000000000001','Missing white earbuds','lost','electronics','Sample listing: white wireless earbuds and charging case, last used while studying.','Central Library','2026-11-19','sample:earbuds'),
('00000000-0000-0000-0000-000000000001','Lost pink keychain','lost','keys','Sample listing: two brass keys on a pink fabric strap.','North Quad','2026-11-19','sample:keys');