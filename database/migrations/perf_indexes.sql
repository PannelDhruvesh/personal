-- =============================================
-- Its Billi — Performance Indexes Migration
-- Run this in Supabase SQL Editor
-- =============================================

-- Composite index for main gallery query:
-- WHERE user_id = X AND is_deleted = false ORDER BY created_at DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_files_gallery
    ON files (user_id, is_deleted, created_at DESC);

-- Composite index for filtered gallery (by file_type):
-- WHERE user_id = X AND file_type = Y AND is_deleted = false
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_files_gallery_type
    ON files (user_id, file_type, is_deleted, created_at DESC);

-- Composite index for favorites filter:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_files_gallery_fav
    ON files (user_id, is_favorite, is_deleted, created_at DESC)
    WHERE is_favorite = TRUE;

-- Trash index:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_files_trash
    ON files (user_id, is_deleted, deleted_at DESC)
    WHERE is_deleted = TRUE;

-- Full-text search on filename (trigram for ILIKE '%...%'):
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_files_filename_trgm
    ON files USING gin (original_filename gin_trgm_ops);

-- Albums gallery query:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_albums_gallery
    ON albums (user_id, is_deleted, created_at DESC);

-- Activity logs for admin panel:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_composite
    ON activity_logs (user_id, action, created_at DESC);

-- Refresh tokens cleanup:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_cleanup
    ON refresh_tokens (user_id, is_revoked, expires_at)
    WHERE is_revoked = FALSE;
