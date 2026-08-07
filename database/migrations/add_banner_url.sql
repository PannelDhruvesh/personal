-- Migration: Add banner_url to users table
-- Run this against your Supabase / PostgreSQL database

ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_url TEXT;
