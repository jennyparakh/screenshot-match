-- LostLink phase 1 schema changes. Run through Lovable (not by hand-editing drizzle/ or supabase/migrations/).
-- Safe to re-run: uses IF NOT EXISTS / DROP ... IF EXISTS. Existing rows and the 6 sample listings are untouched.

-- ============ 1. items: color, brand, details ============
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS color   text CHECK (color   IS NULL OR length(color)   BETWEEN 2 AND 40),
  ADD COLUMN IF NOT EXISTS brand   text CHECK (brand   IS NULL OR length(brand)   BETWEEN 2 AND 60),
  ADD COLUMN IF NOT EXISTS details text CHECK (details IS NULL OR length(details) BETWEEN 2 AND 500);

CREATE INDEX IF NOT EXISTS items_open_idx  ON public.items(resolved, kind, category);
CREATE INDEX IF NOT EXISTS items_color_idx ON public.items(color);

-- ============ 2. item_private: owner-only hidden details (used to judge ownership claims) ============
CREATE TABLE IF NOT EXISTS public.item_private (
  item_id uuid PRIMARY KEY REFERENCES public.items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  secret_details text NOT NULL CHECK (length(secret_details) BETWEEN 2 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.item_private FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_private TO authenticated;
GRANT ALL ON public.item_private TO service_role;
ALTER TABLE public.item_private ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner reads private details"   ON public.item_private;
DROP POLICY IF EXISTS "Owner writes private details"  ON public.item_private;
DROP POLICY IF EXISTS "Owner updates private details" ON public.item_private;
DROP POLICY IF EXISTS "Owner deletes private details" ON public.item_private;
CREATE POLICY "Owner reads private details"   ON public.item_private FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owner writes private details"  ON public.item_private FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.items i WHERE i.id = item_id AND i.user_id = auth.uid()));
CREATE POLICY "Owner updates private details" ON public.item_private FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner deletes private details" ON public.item_private FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============ 3. requests: ownership verification (extends the existing table) ============
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS verification_answer text CHECK (verification_answer IS NULL OR length(verification_answer) BETWEEN 5 AND 1000),
  ADD COLUMN IF NOT EXISTS decision_note       text CHECK (decision_note IS NULL OR length(decision_note) BETWEEN 1 AND 500),
  ADD COLUMN IF NOT EXISTS decided_at          timestamptz;
-- Existing rows keep NULL verification_answer (legacy requests). The app requires it for new claims.
-- Read access is unchanged: only the sender and recipient can SELECT a request row, so the answer is never public.

CREATE OR REPLACE FUNCTION public.protect_request_fields() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.sender_id <> OLD.sender_id OR NEW.recipient_id <> OLD.recipient_id OR NEW.item_id <> OLD.item_id
     OR NEW.message <> OLD.message OR NEW.contact <> OLD.contact
     OR NEW.verification_answer IS DISTINCT FROM OLD.verification_answer
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Only request status and decision note can change';
  END IF;
  IF NEW.status <> OLD.status THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'This request has already been decided';
    END IF;
    NEW.decided_at := now();
  END IF;
  RETURN NEW;
END; $$;

-- ============ 4. notifications ============
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('potential_match','claim_request','claim_accepted','claim_declined','listing_returned','listing_removed')),
  item_id uuid,            -- no FK on purpose: must survive item deletion
  related_item_id uuid,    -- the other listing for potential_match
  request_id uuid,
  title text NOT NULL,
  body  text NOT NULL,     -- only public listing titles / generic wording; never claim answers or contact info
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_match_uniq ON public.notifications(user_id, item_id, related_item_id) WHERE type = 'potential_match';

REVOKE ALL ON public.notifications FROM anon;
GRANT SELECT, DELETE ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read own notifications"   ON public.notifications;
DROP POLICY IF EXISTS "Update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Delete own notifications" ON public.notifications;
CREATE POLICY "Read own notifications"   ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());
-- No INSERT policy/grant: users can never create notifications directly. Only the triggers/function below can.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- New claim -> notify the finder/reporter (title of the public listing only)
CREATE OR REPLACE FUNCTION public.notify_claim_created() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text;
BEGIN
  SELECT title INTO t FROM public.items WHERE id = NEW.item_id;
  INSERT INTO public.notifications(user_id, type, item_id, request_id, title, body)
  VALUES (NEW.recipient_id, 'claim_request', NEW.item_id, NEW.id, 'New claim request', 'Someone sent a claim request for "' || coalesce(t,'your listing') || '".');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS notify_claim_created ON public.requests;
CREATE TRIGGER notify_claim_created AFTER INSERT ON public.requests FOR EACH ROW EXECUTE FUNCTION public.notify_claim_created();

-- Claim decided -> notify the claimant (the decision note is NOT copied into the notification)
CREATE OR REPLACE FUNCTION public.notify_claim_decided() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('accepted','declined') THEN
    SELECT title INTO t FROM public.items WHERE id = NEW.item_id;
    INSERT INTO public.notifications(user_id, type, item_id, request_id, title, body)
    VALUES (NEW.sender_id,
            CASE WHEN NEW.status = 'accepted' THEN 'claim_accepted' ELSE 'claim_declined' END,
            NEW.item_id, NEW.id,
            CASE WHEN NEW.status = 'accepted' THEN 'Claim approved' ELSE 'Claim not approved' END,
            CASE WHEN NEW.status = 'accepted' THEN 'Your claim for "' || coalesce(t,'a listing') || '" was approved. Open the request to see the reply.'
                 ELSE 'Your claim for "' || coalesce(t,'a listing') || '" was not approved.' END);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS notify_claim_decided ON public.requests;
CREATE TRIGGER notify_claim_decided AFTER UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.notify_claim_decided();

-- Listing marked returned -> notify people with pending/accepted claims
CREATE OR REPLACE FUNCTION public.notify_listing_returned() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.resolved AND NOT OLD.resolved THEN
    INSERT INTO public.notifications(user_id, type, item_id, request_id, title, body)
    SELECT r.sender_id, 'listing_returned', NEW.id, r.id, 'Listing marked returned', '"' || NEW.title || '" was marked as returned.'
    FROM public.requests r WHERE r.item_id = NEW.id AND r.status IN ('pending','accepted');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS notify_listing_returned ON public.items;
CREATE TRIGGER notify_listing_returned AFTER UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.notify_listing_returned();

-- Listing deleted -> notify people with pending claims (runs before the requests cascade-delete)
CREATE OR REPLACE FUNCTION public.notify_listing_removed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications(user_id, type, item_id, title, body)
  SELECT r.sender_id, 'listing_removed', OLD.id, 'Listing removed', '"' || OLD.title || '" was removed by its reporter.'
  FROM public.requests r WHERE r.item_id = OLD.id AND r.status = 'pending';
  RETURN OLD;
END; $$;
DROP TRIGGER IF EXISTS notify_listing_removed ON public.items;
CREATE TRIGGER notify_listing_removed BEFORE DELETE ON public.items FOR EACH ROW EXECUTE FUNCTION public.notify_listing_removed();

-- Potential match -> called by the app after it scores a new/edited listing.
-- Guards: caller must own p_my_item; the other listing must be open, the opposite kind, same category, and owned by someone else.
-- Dedupe via notifications_match_uniq. Sample listings (owner ...0001) never get notifications.
CREATE OR REPLACE FUNCTION public.notify_potential_match(p_my_item uuid, p_other_item uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.items; b public.items;
BEGIN
  SELECT * INTO a FROM public.items WHERE id = p_my_item AND user_id = auth.uid();
  SELECT * INTO b FROM public.items WHERE id = p_other_item AND NOT resolved;
  IF a.id IS NULL OR b.id IS NULL THEN RETURN; END IF;
  IF a.kind = b.kind OR a.category <> b.category OR a.user_id = b.user_id THEN RETURN; END IF;
  IF b.user_id = '00000000-0000-0000-0000-000000000001' THEN RETURN; END IF;
  INSERT INTO public.notifications(user_id, type, item_id, related_item_id, title, body)
  VALUES (b.user_id, 'potential_match', b.id, a.id, 'Possible match',
          'A new ' || a.kind || ' report, "' || a.title || '", may match your listing "' || b.title || '". This is a suggestion, not a confirmed match.')
  ON CONFLICT DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION public.notify_potential_match(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_potential_match(uuid, uuid) TO authenticated;

-- ============ 5. Storage: photos no longer world-readable ============
-- Signed-in users can view photos of open listings; owners can always view their own (incl. returned items).
DROP POLICY IF EXISTS "View item photos" ON storage.objects;
CREATE POLICY "View item photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'item-photos' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.items i WHERE i.image_path = name AND NOT i.resolved)
  ));
