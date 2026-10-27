-- ============================================
-- Migration: Fix schema mismatches + new research streams
-- Run this in Supabase SQL editor
-- ============================================

-- STARTUPS: add missing columns + allow 'medium' scale
ALTER TABLE startups ADD COLUMN IF NOT EXISTS reel_created BOOLEAN DEFAULT FALSE;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS content_status TEXT DEFAULT 'none';
ALTER TABLE startups DROP CONSTRAINT IF EXISTS startups_scale_check;
ALTER TABLE startups ADD CONSTRAINT startups_scale_check CHECK (scale IN ('small', 'medium', 'big'));
ALTER TABLE startups ALTER COLUMN scale SET DEFAULT 'small';

-- RESEARCH_DATA: add founders + business + contrarian streams
ALTER TABLE research_data ADD COLUMN IF NOT EXISTS founders_research TEXT;
ALTER TABLE research_data ADD COLUMN IF NOT EXISTS founders_sources TEXT[] DEFAULT '{}';
ALTER TABLE research_data ADD COLUMN IF NOT EXISTS business_research TEXT;
ALTER TABLE research_data ADD COLUMN IF NOT EXISTS business_sources TEXT[] DEFAULT '{}';
ALTER TABLE research_data ADD COLUMN IF NOT EXISTS contrarian_research TEXT;
ALTER TABLE research_data ADD COLUMN IF NOT EXISTS contrarian_sources TEXT[] DEFAULT '{}';
