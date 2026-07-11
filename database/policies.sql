-- =============================================
-- Its Billi - Row Level Security Policies
-- =============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- USERS POLICIES
-- =============================================

-- Users can only read their own data
CREATE POLICY "users_select_own" ON users
    FOR SELECT USING (auth.uid() = id);

-- Users can update their own data
CREATE POLICY "users_update_own" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Service role can insert users (registration)
CREATE POLICY "users_insert_service" ON users
    FOR INSERT WITH CHECK (TRUE);

-- =============================================
-- ALBUMS POLICIES
-- =============================================

-- Users can only see their own albums
CREATE POLICY "albums_select_own" ON albums
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own albums
CREATE POLICY "albums_insert_own" ON albums
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own albums
CREATE POLICY "albums_update_own" ON albums
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own albums
CREATE POLICY "albums_delete_own" ON albums
    FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- FILES POLICIES
-- =============================================

-- Users can only see their own files
CREATE POLICY "files_select_own" ON files
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own files
CREATE POLICY "files_insert_own" ON files
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own files
CREATE POLICY "files_update_own" ON files
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own files
CREATE POLICY "files_delete_own" ON files
    FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- USER SETTINGS POLICIES
-- =============================================

CREATE POLICY "settings_select_own" ON user_settings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "settings_insert_own" ON user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "settings_update_own" ON user_settings
    FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- OTP POLICIES
-- =============================================

CREATE POLICY "otp_select_own" ON otp_verifications
    FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "otp_insert_service" ON otp_verifications
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "otp_update_service" ON otp_verifications
    FOR UPDATE WITH CHECK (TRUE);

-- =============================================
-- REFRESH TOKENS POLICIES
-- =============================================

CREATE POLICY "tokens_select_own" ON refresh_tokens
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "tokens_insert_service" ON refresh_tokens
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "tokens_update_service" ON refresh_tokens
    FOR UPDATE WITH CHECK (TRUE);

CREATE POLICY "tokens_delete_own" ON refresh_tokens
    FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- ACTIVITY LOGS POLICIES
-- =============================================

CREATE POLICY "logs_select_own" ON activity_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "logs_insert_service" ON activity_logs
    FOR INSERT WITH CHECK (TRUE);
