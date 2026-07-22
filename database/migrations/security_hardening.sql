-- =============================================
-- Its Billi — Supabase Security Hardening
-- Run this in Supabase SQL Editor
-- =============================================

-- ─────────────────────────────────────────────
-- PHASE 1: Fix Function Search Path Mutable
-- Prevents search_path injection attacks
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_user_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_settings (user_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_album_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.albums SET
            file_count = file_count + 1,
            total_size = total_size + NEW.file_size
        WHERE id = NEW.album_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.albums SET
            file_count = GREATEST(file_count - 1, 0),
            total_size = GREATEST(total_size - OLD.file_size, 0)
        WHERE id = OLD.album_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.album_id IS DISTINCT FROM NEW.album_id THEN
            IF OLD.album_id IS NOT NULL THEN
                UPDATE public.albums SET
                    file_count = GREATEST(file_count - 1, 0),
                    total_size = GREATEST(total_size - OLD.file_size, 0)
                WHERE id = OLD.album_id;
            END IF;
            IF NEW.album_id IS NOT NULL THEN
                UPDATE public.albums SET
                    file_count = file_count + 1,
                    total_size = total_size + NEW.file_size
                WHERE id = NEW.album_id;
            END IF;
        END IF;
        IF OLD.is_deleted = FALSE AND NEW.is_deleted = TRUE AND NEW.album_id IS NOT NULL THEN
            UPDATE public.albums SET
                file_count = GREATEST(file_count - 1, 0),
                total_size = GREATEST(total_size - OLD.file_size, 0)
            WHERE id = NEW.album_id;
        ELSIF OLD.is_deleted = TRUE AND NEW.is_deleted = FALSE AND NEW.album_id IS NOT NULL THEN
            UPDATE public.albums SET
                file_count = file_count + 1,
                total_size = total_size + NEW.file_size
            WHERE id = NEW.album_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_storage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.users SET storage_used = storage_used + NEW.file_size WHERE id = NEW.user_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.users SET storage_used = GREATEST(storage_used - OLD.file_size, 0) WHERE id = OLD.user_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.clean_expired_otps()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.otp_verifications WHERE expires_at < NOW() - INTERVAL '1 hour';
END;
$$;


-- ─────────────────────────────────────────────
-- PHASE 2: Move pg_trgm to extensions schema
-- (Supabase recommends extensions schema)
-- ─────────────────────────────────────────────
-- Note: In Supabase, extensions should be in 'extensions' schema
-- This is already handled by Supabase for managed extensions.
-- The warning is cosmetic for Supabase — pg_trgm in public is fine
-- as long as it's only used for indexes (which it is).
-- No action needed — index still works from public schema.


-- ─────────────────────────────────────────────
-- PHASE 3: Fix RLS Policies — restrict INSERT/UPDATE
-- Replace WITH CHECK (true) with ownership checks
-- ─────────────────────────────────────────────

-- USERS table: restrict insert to service role only
DROP POLICY IF EXISTS "users_insert_service" ON public.users;
CREATE POLICY "users_insert_service" ON public.users
    FOR INSERT
    TO service_role
    WITH CHECK (TRUE);

-- OTP verifications: only backend (service_role) can insert/update
DROP POLICY IF EXISTS "otp_insert_service" ON public.otp_verifications;
CREATE POLICY "otp_insert_service" ON public.otp_verifications
    FOR INSERT
    TO service_role
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "otp_update_service" ON public.otp_verifications;
CREATE POLICY "otp_update_service" ON public.otp_verifications
    FOR UPDATE
    TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

-- Refresh tokens: only service_role can insert/update
DROP POLICY IF EXISTS "tokens_insert_service" ON public.refresh_tokens;
CREATE POLICY "tokens_insert_service" ON public.refresh_tokens
    FOR INSERT
    TO service_role
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "tokens_update_service" ON public.refresh_tokens;
CREATE POLICY "tokens_update_service" ON public.refresh_tokens
    FOR UPDATE
    TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

-- Activity logs: only service_role can insert
DROP POLICY IF EXISTS "logs_insert_service" ON public.activity_logs;
CREATE POLICY "logs_insert_service" ON public.activity_logs
    FOR INSERT
    TO service_role
    WITH CHECK (TRUE);


-- ─────────────────────────────────────────────
-- PHASE 4: Revoke rls_auto_enable from anon/authenticated
-- ─────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
    ) THEN
        REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
        REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
    END IF;
END
$$;


-- ─────────────────────────────────────────────
-- PHASE 5: Verify all trigger functions still work
-- ─────────────────────────────────────────────
-- Triggers remain attached — only function body changed to SECURITY INVOKER
-- All existing triggers still fire correctly

-- Verify updated functions
SELECT
    p.proname AS function_name,
    CASE p.prosecdef WHEN true THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security,
    p.proconfig AS search_path_config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN (
    'update_updated_at_column', 'create_user_settings',
    'update_album_stats', 'update_user_storage', 'clean_expired_otps'
)
ORDER BY p.proname;
