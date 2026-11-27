CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE TABLE posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,visibility text DEFAULT 'public',deleted_at timestamptz,post_type text DEFAULT 'normal',video_url text,media_urls jsonb DEFAULT '[]',metadata jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now());
CREATE TABLE post_attachments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),post_id uuid,file_url text,storage_key text,file_type text,mime_type text,size_bytes bigint,sort_order integer,transform_meta jsonb DEFAULT '{}');
CREATE TABLE video_upload_sessions(id uuid,user_id uuid,r2_key text,file_size bigint,file_hash text,status text,created_at timestamptz DEFAULT now());
CREATE TABLE live_sessions(id uuid PRIMARY KEY,host_user_id uuid,owner_id uuid,user_id uuid,post_id uuid,live_post_id uuid,replay_post_id uuid,mode text,status text,ended_at timestamptz,r2_object_key text,r2_video_url text);
