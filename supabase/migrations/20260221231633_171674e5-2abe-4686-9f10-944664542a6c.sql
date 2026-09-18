-- Create storage buckets for live recordings and thumbnails
INSERT INTO storage.buckets (id, name, public)
VALUES ('live-recordings', 'live-recordings', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('live-thumbnails', 'live-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for live-recordings bucket
CREATE POLICY "Authenticated users can upload live recordings"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'live-recordings' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view live recordings"
ON storage.objects FOR SELECT
USING (bucket_id = 'live-recordings');

CREATE POLICY "Users can update their own live recordings"
ON storage.objects FOR UPDATE
USING (bucket_id = 'live-recordings' AND auth.uid() IS NOT NULL);

-- RLS policies for live-thumbnails bucket
CREATE POLICY "Authenticated users can upload live thumbnails"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'live-thumbnails' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view live thumbnails"
ON storage.objects FOR SELECT
USING (bucket_id = 'live-thumbnails');

CREATE POLICY "Users can update their own live thumbnails"
ON storage.objects FOR UPDATE
USING (bucket_id = 'live-thumbnails' AND auth.uid() IS NOT NULL);