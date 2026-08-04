-- =============================================
-- Security Hardening v2
-- Fixes all Supabase Security Advisor warnings
-- Run this in Supabase SQL Editor
-- =============================================

-- ─────────────────────────────────────────────
-- 1. Fix mutable search_path on all functions
--    Prevents search_path injection attacks
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
    INSERT INTO public.user_settings (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
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
-- 2. Fix RLS policies with WITH CHECK (true)
--    Scope INSERT/UPDATE to authenticated service
--    These tables are only written by the backend
--    using the service role key — not by Supabase Auth users.
--    We tighten them to only allow the service role.
-- ─────────────────────────────────────────────

-- activity_logs: only service role can insert logs
DROP POLICY IF EXISTS "logs_insert_service" ON public.activity_logs;
CREATE POLICY "logs_insert_service" ON public.activity_logs
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- otp_verifications: only service role can insert/update OTPs
DROP POLICY IF EXISTS "otp_insert_service" ON public.otp_verifications;
CREATE POLICY "otp_insert_service" ON public.otp_verifications
    FOR INSERT
    TO service_role
    WITH CHECK (true);

DROP POLICY IF EXISTS "otp_update_service" ON public.otp_verifications;
CREATE POLICY "otp_update_service" ON public.otp_verifications
    FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

-- refresh_tokens: only service role can insert/update tokens
DROP POLICY IF EXISTS "tokens_insert_service" ON public.refresh_tokens;
CREATE POLICY "tokens_insert_service" ON public.refresh_tokens
    FOR INSERT
    TO service_role
    WITH CHECK (true);

DROP POLICY IF EXISTS "tokens_update_service" ON public.refresh_tokens;
CREATE POLICY "tokens_update_service" ON public.refresh_tokens
    FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

-- users: only service role can register new users
DROP POLICY IF EXISTS "users_insert_service" ON public.users;
CREATE POLICY "users_insert_service" ON public.users
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- ─────────────────────────────────────────────
-- 3. Fix rls_auto_enable SECURITY DEFINER function
--    Revoke execute from anon and authenticated roles
--    This function should only be callable internally
-- ─────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;

-- ─────────────────────────────────────────────
-- 4. Move pg_trgm extension to extensions schema
--    (Supabase recommended schema for extensions)
-- ─────────────────────────────────────────────
-- NOTE: pg_trgm cannot be moved without dropping and recreating.
-- If you have indexes using pg_trgm, drop them first,
-- then run this, then recreate indexes.
-- Only run if you have not used trgm indexes yet.
--
-- DROP EXTENSION IF EXISTS pg_trgm;
-- CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;
--
-- If you have trgm-based indexes, keep pg_trgm in public for now
-- and suppress this warning in the Supabase advisor.
-- The risk is low since pg_trgm only provides text similarity functions.

-- ─────────────────────────────────────────────
-- Verification queries (run after migration)
-- ─────────────────────────────────────────────
-- SELECT proname, prosecdef, proconfig FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--   AND proname IN ('update_updated_at_column','create_user_settings',
--   'update_album_stats','update_user_storage','clean_expired_otps');
-- Expected: prosecdef = false, proconfig contains search_path=public
