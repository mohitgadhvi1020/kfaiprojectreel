-- ============================================
-- AI Pulse Content Engine - Supabase Schema
-- Run this SQL in your Supabase SQL Editor
-- ============================================

-- Runs table
CREATE TABLE IF NOT EXISTS runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'researching' CHECK (status IN ('researching','ready','generating','hooks','scripting','refining','completed','failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  startups_found INTEGER DEFAULT 0,
  x_tips_found INTEGER DEFAULT 0,
  trending_found INTEGER DEFAULT 0,
  selected_startup_id UUID,
  selected_x_tip_id UUID,
  content_type TEXT CHECK (content_type IN ('startup','x_tip')),
  raw_startups TEXT,
  raw_x_builders TEXT,
  raw_trending TEXT
);

-- Startups discovered
CREATE TABLE IF NOT EXISTS startups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  funding_amount TEXT,
  funding_round TEXT,
  investor TEXT,
  tech TEXT,
  builder_value TEXT,
  website TEXT,
  category TEXT,
  source_url TEXT,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  scale TEXT DEFAULT 'small' CHECK (scale IN ('small','medium','big')),
  is_used BOOLEAN DEFAULT FALSE,
  reel_created BOOLEAN DEFAULT FALSE,
  content_status TEXT DEFAULT 'none',
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_startups_name_lower ON startups (LOWER(name));

-- X Builder Tips
CREATE TABLE IF NOT EXISTS x_tips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author TEXT NOT NULL,
  post_summary TEXT,
  practical_takeaway TEXT,
  reel_potential TEXT,
  post_url TEXT,
  post_snippet TEXT,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  is_used BOOLEAN DEFAULT FALSE,
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL
);

-- Trending Topics
CREATE TABLE IF NOT EXISTS trending_topics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic TEXT NOT NULL,
  platform TEXT,
  angle TEXT,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL
);

-- Deep Research data (4-phase research per startup or X tip)
CREATE TABLE IF NOT EXISTS research_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  startup_id UUID REFERENCES startups(id) ON DELETE CASCADE,
  x_tip_id UUID REFERENCES x_tips(id) ON DELETE CASCADE,
  technical_research TEXT,
  technical_sources TEXT[] DEFAULT '{}',
  product_research TEXT,
  product_sources TEXT[] DEFAULT '{}',
  market_research TEXT,
  market_sources TEXT[] DEFAULT '{}',
  founders_research TEXT,
  founders_sources TEXT[] DEFAULT '{}',
  business_research TEXT,
  business_sources TEXT[] DEFAULT '{}',
  contrarian_research TEXT,
  contrarian_sources TEXT[] DEFAULT '{}',
  viral_angles TEXT,
  research_quality_score INTEGER DEFAULT 0,
  research_passed BOOLEAN DEFAULT FALSE,
  research_warning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated content (reel, carousel, caption per run)
CREATE TABLE IF NOT EXISTS generated_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  startup_id UUID REFERENCES startups(id) ON DELETE CASCADE,
  x_tip_id UUID REFERENCES x_tips(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('reel_script','carousel_text','caption_hashtags')),
  content TEXT NOT NULL,
  is_refined BOOLEAN DEFAULT FALSE,
  hooks JSONB DEFAULT '[]',
  selected_hook JSONB,
  quality_score TEXT,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- App settings
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  perplexity_api_key TEXT DEFAULT '',
  openai_api_key TEXT DEFAULT '',
  supabase_url TEXT DEFAULT '',
  supabase_anon_key TEXT DEFAULT '',
  supabase_service_key TEXT DEFAULT '',
  apify_api_key TEXT DEFAULT '',
  instagram_handle TEXT DEFAULT 'mohit.builds.ai',
  creator_name TEXT DEFAULT 'Mohit',
  creator_bio TEXT DEFAULT 'IIT Bombay engineer, 6 years in tech',
  x_tracked_accounts TEXT[] DEFAULT ARRAY['@karpathy','@dair_ai','@rasbt','@svpino','@_philschmid','@hwchung27','@ClementDelworker','@TheAITimeline','@ai_for_success'],
  content_tone TEXT DEFAULT 'Builder explaining architecture to a smart friend. Confident, not salesy. Fast-paced, zero filler.',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM app_settings LIMIT 1);

-- Content preferences
CREATE TABLE IF NOT EXISTS content_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  note TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('like','dislike','style','instruction')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monitored Channels (YouTube, Instagram, Twitter)
CREATE TABLE IF NOT EXISTS monitored_channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('youtube','instagram','twitter')),
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  channel_url TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  last_polled_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monitored_channels_platform_id
  ON monitored_channels (platform, channel_id);

-- Monitored Content (ingested items from tracked channels)
CREATE TABLE IF NOT EXISTS monitored_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('youtube','instagram','twitter')),
  source_channel_id TEXT NOT NULL,
  source_channel_name TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnail TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  raw_text TEXT DEFAULT '',
  summary TEXT,
  topics TEXT[] DEFAULT '{}',
  tools_mentioned TEXT[] DEFAULT '{}',
  content_ideas TEXT[] DEFAULT '{}',
  key_insights TEXT[] DEFAULT '{}',
  content_type TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new','reviewed','used','dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monitored_content_url ON monitored_content (url);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_startups_is_used ON startups (is_used);
CREATE INDEX IF NOT EXISTS idx_startups_run_id ON startups (run_id);
CREATE INDEX IF NOT EXISTS idx_x_tips_run_id ON x_tips (run_id);
CREATE INDEX IF NOT EXISTS idx_generated_content_run_id ON generated_content (run_id);
CREATE INDEX IF NOT EXISTS idx_research_data_run_id ON research_data (run_id);
CREATE INDEX IF NOT EXISTS idx_monitored_content_source ON monitored_content (source);
CREATE INDEX IF NOT EXISTS idx_monitored_content_status ON monitored_content (status);
CREATE INDEX IF NOT EXISTS idx_monitored_content_published ON monitored_content (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitored_channels_platform ON monitored_channels (platform);
