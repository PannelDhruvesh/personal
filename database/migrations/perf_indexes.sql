-- =============================================
-- Its Billi — Performance Indexes
-- Paste this in Supabase SQL Editor → Run
-- =============================================

-- Main gallery query index
CREATE INDEX IF NOT EXISTS idx_files_gallery
    ON files (user_id, is_deleted, created_at DESC);

-- Filtered gallery (by file_type)
CREATE INDEX IF NOT EXISTS idx_files_gallery_type
    ON files (user_id, file_type, is_deleted, created_at DESC);

-- Favorites filter
CREATE INDEX IF NOT EXISTS idx_files_gallery_fav
    ON files (user_id, is_favorite, is_deleted, created_at DESC);

-- Trash view
CREATE INDEX IF NOT EXISTS idx_files_trash
    ON files (user_id, is_deleted, deleted_at DESC);

-- Trigram search on filename (ILIKE '%...%')
CREATE EXTENSION IF NOT EXISTS pg_trgm;  
CREATE INDEX IF NOT EXISTS idx_files_filename_trgm
    ON files USING gin (original_filename gin_trgm_ops);

-- Albums listing
CREATE INDEX IF NOT EXISTS idx_albums_gallery
    ON albums (user_id, is_deleted, created_at DESC);

-- Activity logs
CREATE INDEX IF NOT EXISTS idx_activity_composite
    ON activity_logs (user_id, action, created_at DESC);

-- Refresh tokens
CREATE INDEX IF NOT EXISTS idx_tokens_cleanup
    ON refresh_tokens (user_id, is_revoked, expires_at);
