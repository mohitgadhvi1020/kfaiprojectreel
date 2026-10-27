-- Migration: store a hook clip cut from the SOURCE reel on monitored_content.
-- The "Extract best ~3s" action downloads the original reel, finds the most
-- scroll-stopping moment via timestamped transcription, cuts it with ffmpeg to
-- /public/hooks/<id>.mp4, and records the clip path + chosen window here.

ALTER TABLE monitored_content
  ADD COLUMN IF NOT EXISTS hook_clip_path TEXT,
  ADD COLUMN IF NOT EXISTS hook_clip_start REAL,
  ADD COLUMN IF NOT EXISTS hook_clip_end REAL,
  ADD COLUMN IF NOT EXISTS hook_clip_quote TEXT,
  ADD COLUMN IF NOT EXISTS hook_clip_reason TEXT,
  ADD COLUMN IF NOT EXISTS hook_clip_generated_at TIMESTAMPTZ;
