-- =============================================
-- Its Billi — Complete Database Setup
-- Paste this entire file in Supabase SQL Editor
-- and click RUN once.
--
-- Includes:
--   1. Extensions
--   2. Tables
--   3. Indexes
--   4. Triggers & Functions
--   5. Row Level Security Policies
--   6. Storage Bucket & Policies
--   7. Admin Setup (is_admin column + grant access)
-- =============================================


-- ─────────────────────────────────────────────
-- 1. EXTENSIONS
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ─────────────────────────────────────────────
-- 2. TABLES
-- ─────────────────────────────────────────────

-- USERS
CREATE TABLE IF NOT EXISTS users (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    username        VARCHAR(50)  UNIQUE NOT NULL,
    display_name    VARCHAR(100),
    password_hash   TEXT         NOT NULL,
    avatar_url      TEXT,
    bio             TEXT,
    is_active       BOOLEAN      DEFAULT TRUE,
    is_verified     BOOLEAN      DEFAULT FALSE,
    is_admin        BOOLEAN      DEFAULT FALSE,
    storage_used    BIGINT       DEFAULT 0,
    storage_limit   BIGINT       DEFAULT 10737418240, -- 10 GB
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW(),
    last_login      TIMESTAMPTZ,
    CONSTRAINT users_email_check    CHECK (email    ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT users_username_check CHECK (username ~* '^[A-Za-z0-9_]{3,50}$'),
    CONSTRAINT users_storage_check  CHECK (storage_used >= 0)
);

-- OTP VERIFICATIONS
CREATE TABLE IF NOT EXISTS otp_verifications (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID        REFERENCES users(id) ON DELETE CASCADE,
    email      VARCHAR(255) NOT NULL,
    otp_code   VARCHAR(6)  NOT NULL,
    otp_type   VARCHAR(20) NOT NULL CHECK (otp_type IN ('register', 'reset_password', 'login')),
    expires_at TIMESTAMPTZ NOT NULL,
    is_used    BOOLEAN     DEFAULT FALSE,
    attempts   INTEGER     DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- REFRESH TOKENS
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT  NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    is_revoked  BOOLEAN     DEFAULT FALSE,
    device_info TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ALBUMS
CREATE TABLE IF NOT EXISTS albums (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    cover_url   TEXT,
    is_favorite BOOLEAN      DEFAULT FALSE,
    is_hidden   BOOLEAN      DEFAULT FALSE,
    is_deleted  BOOLEAN      DEFAULT FALSE,
    deleted_at  TIMESTAMPTZ,
    sort_order  INTEGER      DEFAULT 0,
    file_count  INTEGER      DEFAULT 0,
    total_size  BIGINT       DEFAULT 0,
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW(),
    CONSTRAINT albums_name_check CHECK (LENGTH(name) >= 1)
);

-- FILES
CREATE TABLE IF NOT EXISTS files (
    id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    album_id          UUID         REFERENCES albums(id) ON DELETE SET NULL,
    filename          VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    file_type         VARCHAR(10)  NOT NULL CHECK (file_type IN ('photo', 'video')),
    mime_type         VARCHAR(100) NOT NULL,
    file_size         BIGINT       NOT NULL,
    storage_path      TEXT         NOT NULL,
    thumbnail_path    TEXT,
    width             INTEGER,
    height            INTEGER,
    duration_seconds  INTEGER,
    is_favorite       BOOLEAN      DEFAULT FALSE,
    is_deleted        BOOLEAN      DEFAULT FALSE,
    deleted_at        TIMESTAMPTZ,
    sort_order        INTEGER      DEFAULT 0,
    metadata          JSONB        DEFAULT '{}',
    created_at        TIMESTAMPTZ  DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  DEFAULT NOW(),
    CONSTRAINT files_size_check CHECK (file_size > 0)
);

-- USER SETTINGS
CREATE TABLE IF NOT EXISTS user_settings (
    id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID        UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dark_mode            BOOLEAN     DEFAULT TRUE,
    notifications_enabled BOOLEAN   DEFAULT TRUE,
    auto_backup          BOOLEAN     DEFAULT FALSE,
    default_album_id     UUID        REFERENCES albums(id) ON DELETE SET NULL,
    grid_size            VARCHAR(10) DEFAULT 'medium' CHECK (grid_size IN ('small', 'medium', 'large')),
    sort_by              VARCHAR(20) DEFAULT 'created_at' CHECK (sort_by IN ('created_at', 'name', 'size', 'type')),
    sort_order           VARCHAR(4)  DEFAULT 'desc' CHECK (sort_order IN ('asc', 'desc')),
    show_hidden_albums   BOOLEAN     DEFAULT FALSE,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ACTIVITY LOGS
CREATE TABLE IF NOT EXISTS activity_logs (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action        VARCHAR(50) NOT NULL,
    resource_type VARCHAR(20),
    resource_id   UUID,
    details       JSONB       DEFAULT '{}',
    ip_address    INET,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────
-- 3. INDEXES
-- ─────────────────────────────────────────────

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email      ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username   ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_is_admin   ON users(is_admin) WHERE is_admin = TRUE;

-- OTP
CREATE INDEX IF NOT EXISTS idx_otp_email      ON otp_verifications(email);
CREATE INDEX IF NOT EXISTS idx_otp_user_id    ON otp_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON otp_verifications(expires_at);

-- Refresh tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token      ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Albums
CREATE INDEX IF NOT EXISTS idx_albums_user_id    ON albums(user_id);
CREATE INDEX IF NOT EXISTS idx_albums_is_deleted ON albums(is_deleted);
CREATE INDEX IF NOT EXISTS idx_albums_is_favorite ON albums(is_favorite);
CREATE INDEX IF NOT EXISTS idx_albums_created_at ON albums(created_at DESC);

-- Files
CREATE INDEX IF NOT EXISTS idx_files_user_id     ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_album_id    ON files(album_id);
CREATE INDEX IF NOT EXISTS idx_files_file_type   ON files(file_type);
CREATE INDEX IF NOT EXISTS idx_files_is_deleted  ON files(is_deleted);
CREATE INDEX IF NOT EXISTS idx_files_is_favorite ON files(is_favorite);
CREATE INDEX IF NOT EXISTS idx_files_created_at  ON files(created_at DESC);

-- Activity logs
CREATE INDEX IF NOT EXISTS idx_activity_user_id    ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_action     ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity_logs(created_at DESC);


-- ─────────────────────────────────────────────
-- 4. TRIGGERS & FUNCTIONS
-- ─────────────────────────────────────────────

-- Auto-update updated_at on every table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at         ON users;
DROP TRIGGER IF EXISTS update_albums_updated_at        ON albums;
DROP TRIGGER IF EXISTS update_files_updated_at         ON files;
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_albums_updated_at
    BEFORE UPDATE ON albums
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE ON files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- Auto-create user_settings row when a new user registers
CREATE OR REPLACE FUNCTION create_user_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_settings (user_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_user_created ON users;
CREATE TRIGGER on_user_created
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION create_user_settings();


-- Keep album file_count and total_size in sync
CREATE OR REPLACE FUNCTION update_album_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE albums SET
            file_count = file_count + 1,
            total_size = total_size + NEW.file_size
        WHERE id = NEW.album_id;

    ELSIF TG_OP = 'DELETE' THEN
        UPDATE albums SET
            file_count = GREATEST(file_count - 1, 0),
            total_size = GREATEST(total_size - OLD.file_size, 0)
        WHERE id = OLD.album_id;

    ELSIF TG_OP = 'UPDATE' THEN
        -- File moved to a different album
        IF OLD.album_id IS DISTINCT FROM NEW.album_id THEN
            IF OLD.album_id IS NOT NULL THEN
                UPDATE albums SET
                    file_count = GREATEST(file_count - 1, 0),
                    total_size = GREATEST(total_size - OLD.file_size, 0)
                WHERE id = OLD.album_id;
            END IF;
            IF NEW.album_id IS NOT NULL THEN
                UPDATE albums SET
                    file_count = file_count + 1,
                    total_size = total_size + NEW.file_size
                WHERE id = NEW.album_id;
            END IF;
        END IF;
        -- File soft-deleted
        IF OLD.is_deleted = FALSE AND NEW.is_deleted = TRUE AND NEW.album_id IS NOT NULL THEN
            UPDATE albums SET
                file_count = GREATEST(file_count - 1, 0),
                total_size = GREATEST(total_size - OLD.file_size, 0)
            WHERE id = NEW.album_id;
        -- File restored from trash
        ELSIF OLD.is_deleted = TRUE AND NEW.is_deleted = FALSE AND NEW.album_id IS NOT NULL THEN
            UPDATE albums SET
                file_count = file_count + 1,
                total_size = total_size + NEW.file_size
            WHERE id = NEW.album_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_file_change ON files;
CREATE TRIGGER on_file_change
    AFTER INSERT OR UPDATE OR DELETE ON files
    FOR EACH ROW EXECUTE FUNCTION update_album_stats();


-- Keep users.storage_used in sync
CREATE OR REPLACE FUNCTION update_user_storage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users SET storage_used = storage_used + NEW.file_size WHERE id = NEW.user_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users SET storage_used = GREATEST(storage_used - OLD.file_size, 0) WHERE id = OLD.user_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_file_storage_change ON files;
CREATE TRIGGER on_file_storage_change
    AFTER INSERT OR DELETE ON files
    FOR EACH ROW EXECUTE FUNCTION update_user_storage();


-- Clean expired OTPs (call manually or via pg_cron)
CREATE OR REPLACE FUNCTION clean_expired_otps()
RETURNS void AS $$
BEGIN
    DELETE FROM otp_verifications WHERE expires_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────

ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE albums             ENABLE ROW LEVEL SECURITY;
ALTER TABLE files              ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_verifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs      ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first so this script is re-runnable
DROP POLICY IF EXISTS "users_select_own"    ON users;
DROP POLICY IF EXISTS "users_update_own"    ON users;
DROP POLICY IF EXISTS "users_insert_service" ON users;
DROP POLICY IF EXISTS "users_select_admin"  ON users;
DROP POLICY IF EXISTS "users_update_admin"  ON users;
DROP POLICY IF EXISTS "users_delete_admin"  ON users;

DROP POLICY IF EXISTS "albums_select_own"  ON albums;
DROP POLICY IF EXISTS "albums_insert_own"  ON albums;
DROP POLICY IF EXISTS "albums_update_own"  ON albums;
DROP POLICY IF EXISTS "albums_delete_own"  ON albums;
DROP POLICY IF EXISTS "albums_select_admin" ON albums;

DROP POLICY IF EXISTS "files_select_own"   ON files;
DROP POLICY IF EXISTS "files_insert_own"   ON files;
DROP POLICY IF EXISTS "files_update_own"   ON files;
DROP POLICY IF EXISTS "files_delete_own"   ON files;
DROP POLICY IF EXISTS "files_select_admin" ON files;

DROP POLICY IF EXISTS "settings_select_own" ON user_settings;
DROP POLICY IF EXISTS "settings_insert_own" ON user_settings;
DROP POLICY IF EXISTS "settings_update_own" ON user_settings;

DROP POLICY IF EXISTS "otp_select_own"     ON otp_verifications;
DROP POLICY IF EXISTS "otp_insert_service" ON otp_verifications;
DROP POLICY IF EXISTS "otp_update_service" ON otp_verifications;

DROP POLICY IF EXISTS "tokens_select_own"    ON refresh_tokens;
DROP POLICY IF EXISTS "tokens_insert_service" ON refresh_tokens;
DROP POLICY IF EXISTS "tokens_update_service" ON refresh_tokens;
DROP POLICY IF EXISTS "tokens_delete_own"    ON refresh_tokens;

DROP POLICY IF EXISTS "logs_select_own"   ON activity_logs;
DROP POLICY IF EXISTS "logs_insert_service" ON activity_logs;
DROP POLICY IF EXISTS "logs_select_admin" ON activity_logs;

-- USERS policies
CREATE POLICY "users_select_own" ON users
    FOR SELECT USING (
        auth.uid() = id
        OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = TRUE)
    );

CREATE POLICY "users_update_own" ON users
    FOR UPDATE USING (
        auth.uid() = id
        OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = TRUE)
    );

CREATE POLICY "users_insert_service" ON users
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "users_delete_admin" ON users
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = TRUE)
    );

-- ALBUMS policies
CREATE POLICY "albums_select_own" ON albums
    FOR SELECT USING (
        auth.uid() = user_id
        OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = TRUE)
    );

CREATE POLICY "albums_insert_own" ON albums
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "albums_update_own" ON albums
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "albums_delete_own" ON albums
    FOR DELETE USING (auth.uid() = user_id);

-- FILES policies
CREATE POLICY "files_select_own" ON files
    FOR SELECT USING (
        auth.uid() = user_id
        OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = TRUE)
    );

CREATE POLICY "files_insert_own" ON files
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "files_update_own" ON files
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "files_delete_own" ON files
    FOR DELETE USING (auth.uid() = user_id);

-- USER SETTINGS policies
CREATE POLICY "settings_select_own" ON user_settings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "settings_insert_own" ON user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "settings_update_own" ON user_settings
    FOR UPDATE USING (auth.uid() = user_id);

-- OTP policies
CREATE POLICY "otp_select_own" ON otp_verifications
    FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "otp_insert_service" ON otp_verifications
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "otp_update_service" ON otp_verifications
    FOR UPDATE WITH CHECK (TRUE);

-- REFRESH TOKENS policies
CREATE POLICY "tokens_select_own" ON refresh_tokens
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "tokens_insert_service" ON refresh_tokens
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "tokens_update_service" ON refresh_tokens
    FOR UPDATE WITH CHECK (TRUE);

CREATE POLICY "tokens_delete_own" ON refresh_tokens
    FOR DELETE USING (auth.uid() = user_id);

-- ACTIVITY LOGS policies
CREATE POLICY "logs_select_own" ON activity_logs
    FOR SELECT USING (
        auth.uid() = user_id
        OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = TRUE)
    );

CREATE POLICY "logs_insert_service" ON activity_logs
    FOR INSERT WITH CHECK (TRUE);


-- ─────────────────────────────────────────────
-- 6. STORAGE BUCKET & POLICIES
-- ─────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'its-billi',
    'its-billi',
    FALSE,
    104857600,  -- 100 MB per file
    ARRAY[
        'image/jpeg', 'image/png', 'image/gif',
        'image/webp', 'image/heic', 'image/heif',
        'video/mp4', 'video/quicktime', 'video/x-msvideo',
        'video/webm', 'video/x-matroska'
    ]
) ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies (so script is re-runnable)
DROP POLICY IF EXISTS "storage_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "storage_select_own" ON storage.objects;
DROP POLICY IF EXISTS "storage_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "storage_update_own" ON storage.objects;

-- Users can upload only to their own folder ({user_id}/...)
CREATE POLICY "storage_insert_own" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'its-billi'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Users can read only their own files
CREATE POLICY "storage_select_own" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'its-billi'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Users can delete only their own files
CREATE POLICY "storage_delete_own" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'its-billi'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Users can update only their own files
CREATE POLICY "storage_update_own" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'its-billi'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );


-- ─────────────────────────────────────────────
-- 7. ADMIN SETUP
-- ─────────────────────────────────────────────

-- Insert admin account if it doesn't exist already
-- Username: dhruv2007  |  Password: Dhruv@2007
-- (password is bcrypt hashed using pgcrypto)
INSERT INTO users (
    email,
    username,
    display_name,
    password_hash,
    is_active,
    is_verified,
    is_admin
)
VALUES (
    'panneldhruvesh2007@gmail.com',
    'dhruv2007',
    'Dhruv Admin',
    crypt('Dhruv@2007', gen_salt('bf', 12)),
    TRUE,
    TRUE,
    TRUE
)
ON CONFLICT (email) DO UPDATE
    SET is_admin      = TRUE,
        is_verified   = TRUE,
        is_active     = TRUE,
        password_hash = crypt('Dhruv@2007', gen_salt('bf', 12)),
        username      = 'dhruv2007';


-- ─────────────────────────────────────────────
-- VERIFY — should return admin account
-- ─────────────────────────────────────────────
SELECT id, email, username, is_admin, is_verified, created_at
    FROM users
    WHERE is_admin = TRUE;
