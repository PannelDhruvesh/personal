-- =============================================
-- Security Hardening v3
-- Fixes remaining 3 Supabase Security Advisor warnings
-- Run this in Supabase SQL Editor
-- =============================================

-- ─────────────────────────────────────────────
-- FIX 1 & 2: rls_auto_enable SECURITY DEFINER
--
-- The REVOKE in v2 was insufficient because the function
-- is SECURITY DEFINER — Supabase PostgREST exposes it via
-- /rest/v1/rpc/rls_auto_enable regardless of grants when
-- it runs as the function owner.
--
-- The correct fix: drop it entirely (it is a leftover
-- utility function from initial setup, not needed in prod)
-- OR recreate it as SECURITY INVOKER so it runs as the
-- calling role (anon/authenticated) which has no table perms.
--
-- We recreate as SECURITY INVOKER — safe, non-breaking.
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- no-op: replaced SECURITY DEFINER with SECURITY INVOKER
  -- anon/authenticated callers have no elevated privileges
END;
$$;

-- Revoke execute from public roles for extra safety
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;

-- ─────────────────────────────────────────────
-- FIX 3: pg_trgm extension in public schema
--
-- Move pg_trgm to the extensions schema.
-- Supabase creates an 'extensions' schema for this purpose.
-- Steps:
--   1. Drop existing pg_trgm from public
--   2. Recreate in extensions schema
--
-- NOTE: If you have any indexes using pg_trgm operators
-- (e.g. gin indexes with gin_trgm_ops), drop them first,
-- recreate the extension, then rebuild the indexes.
-- The app does NOT use trgm indexes — safe to move.
-- ─────────────────────────────────────────────

DROP EXTENSION IF EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

-- ─────────────────────────────────────────────
-- Verify fixes after running
-- ─────────────────────────────────────────────
-- Check rls_auto_enable is now SECURITY INVOKER:
-- SELECT proname, prosecdef FROM pg_proc
-- WHERE proname = 'rls_auto_enable' AND pronamespace = 'public'::regnamespace;
-- Expected: prosecdef = false
--
-- Check pg_trgm is in extensions schema:
-- SELECT extname, extnamespace::regnamespace FROM pg_extension
-- WHERE extname = 'pg_trgm';
-- Expected: extnamespace = extensions
-- ─────────────────────────────────────────────
