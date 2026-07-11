-- =============================================
-- Its Billi - Admin Panel Migration
-- Run this in Supabase SQL Editor
-- =============================================


-- ─────────────────────────────────────────────
-- STEP 1: Add is_admin column to users table
-- ─────────────────────────────────────────────
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Index for fast admin checks
CREATE INDEX IF NOT EXISTS idx_users_is_admin
    ON users(is_admin)
    WHERE is_admin = TRUE;

-- Extra activity_log indexes for admin filters
CREATE INDEX IF NOT EXISTS idx_activity_action
    ON activity_logs(action);


-- ─────────────────────────────────────────────
-- STEP 2: Grant yourself admin access
-- Replace the email below with YOUR email
-- ─────────────────────────────────────────────
UPDATE users
    SET is_admin = TRUE
    WHERE email = 'your@email.com';   -- ← change this


-- ─────────────────────────────────────────────
-- STEP 3: RLS policy — admins can read all users
-- (The FastAPI backend uses the service role key
--  so it bypasses RLS. These policies protect
--  direct Supabase client access if you ever use it.)
-- ─────────────────────────────────────────────

-- Allow admins to read all users
DROP POLICY IF EXISTS "users_select_admin" ON users;
CREATE POLICY "users_select_admin" ON users
    FOR SELECT
    USING (
        auth.uid() = id
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.is_admin = TRUE
        )
    );

-- Allow admins to update any user
DROP POLICY IF EXISTS "users_update_admin" ON users;
CREATE POLICY "users_update_admin" ON users
    FOR UPDATE
    USING (
        auth.uid() = id
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.is_admin = TRUE
        )
    );

-- Allow admins to delete any user
DROP POLICY IF EXISTS "users_delete_admin" ON users;
CREATE POLICY "users_delete_admin" ON users
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.is_admin = TRUE
        )
    );

-- Allow admins to read ALL activity logs (not just their own)
DROP POLICY IF EXISTS "logs_select_admin" ON activity_logs;
CREATE POLICY "logs_select_admin" ON activity_logs
    FOR SELECT
    USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.is_admin = TRUE
        )
    );

-- Allow admins to read all files
DROP POLICY IF EXISTS "files_select_admin" ON files;
CREATE POLICY "files_select_admin" ON files
    FOR SELECT
    USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.is_admin = TRUE
        )
    );

-- Allow admins to read all albums
DROP POLICY IF EXISTS "albums_select_admin" ON albums;
CREATE POLICY "albums_select_admin" ON albums
    FOR SELECT
    USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
              AND u.is_admin = TRUE
        )
    );


-- ─────────────────────────────────────────────
-- STEP 4: Verify — check your user is admin now
-- ─────────────────────────────────────────────
SELECT id, email, username, is_admin
    FROM users
    WHERE is_admin = TRUE;
