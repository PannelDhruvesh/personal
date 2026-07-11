-- =============================================
-- Its Billi - Supabase Storage Configuration
-- =============================================

-- Create the private storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'its-billi',
    'its-billi',
    FALSE,
    104857600, -- 100MB per file
    ARRAY[
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/heic',
        'image/heif',
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo',
        'video/webm',
        'video/x-matroska'
    ]
) ON CONFLICT (id) DO NOTHING;

-- =============================================
-- STORAGE RLS POLICIES
-- =============================================

-- Users can only upload to their own folder
CREATE POLICY "storage_insert_own" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'its-billi' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Users can only read their own files
CREATE POLICY "storage_select_own" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'its-billi' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Users can delete their own files
CREATE POLICY "storage_delete_own" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'its-billi' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Users can update their own files
CREATE POLICY "storage_update_own" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'its-billi' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );
