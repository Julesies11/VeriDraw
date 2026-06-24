-- 2026062300_create_vd_profiles.sql
-- Migration to set up vd_profiles table and vd-avatars storage bucket with policies.

-- 1. Create Profiles Table
CREATE TABLE IF NOT EXISTS public.vd_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.vd_profiles ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for vd_profiles
DROP POLICY IF EXISTS select_vd_profiles ON public.vd_profiles;
CREATE POLICY select_vd_profiles ON public.vd_profiles
    FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS insert_vd_profiles ON public.vd_profiles;
CREATE POLICY insert_vd_profiles ON public.vd_profiles
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS update_vd_profiles ON public.vd_profiles;
CREATE POLICY update_vd_profiles ON public.vd_profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 4. Trigger to Auto-update updated_at timestamp
DROP TRIGGER IF EXISTS trigger_vd_profiles_updated_at ON public.vd_profiles;
CREATE TRIGGER trigger_vd_profiles_updated_at
    BEFORE UPDATE ON public.vd_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.vd_set_updated_at();

-- 5. Clean up any existing trigger on auth.users from previous migration designs
-- (Avoids global triggers on auth.users in shared database environments)
DROP TRIGGER IF EXISTS vd_on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.vd_handle_new_user();


-- 7. Setup storage bucket vd-avatars and policies
-- Note: Inserts the bucket config row if not exists.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'vd-avatars', 
    'vd-avatars', 
    true, 
    2097152, -- 2MB in bytes
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET 
    public = true,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];


-- Drop existing storage policies if they exist to avoid duplication errors
DROP POLICY IF EXISTS "Allow public read access to avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow owners to upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow owners to update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow owners to delete avatars" ON storage.objects;
DROP POLICY IF EXISTS "vd_avatars_public_select" ON storage.objects;
DROP POLICY IF EXISTS "vd_avatars_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "vd_avatars_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "vd_avatars_owner_delete" ON storage.objects;

-- Storage Policies:
-- Allow anyone (public/anon) to read/download avatars
CREATE POLICY "vd_avatars_public_select" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'vd-avatars');

-- Allow authenticated users to upload avatars to their own folder (folder name is their user id)
CREATE POLICY "vd_avatars_owner_insert" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (
        bucket_id = 'vd-avatars' AND 
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- Allow authenticated users to update their own avatars
CREATE POLICY "vd_avatars_owner_update" ON storage.objects
    FOR UPDATE TO authenticated USING (
        bucket_id = 'vd-avatars' AND 
        (storage.foldername(name))[1] = auth.uid()::text
    ) WITH CHECK (
        bucket_id = 'vd-avatars' AND 
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- Allow authenticated users to delete their own avatars
CREATE POLICY "vd_avatars_owner_delete" ON storage.objects
    FOR DELETE TO authenticated USING (
        bucket_id = 'vd-avatars' AND 
        (storage.foldername(name))[1] = auth.uid()::text
    );
