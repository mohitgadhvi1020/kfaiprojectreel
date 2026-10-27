-- Migration: store derived scripts on monitored_content rows.
-- When the user clicks "Generate Script" on a monitored video/post, we run
-- Gemini and persist the script inline on the monitored_content row so the UI
-- can surface it next to the original without another API call.

ALTER TABLE monitored_content
  ADD COLUMN IF NOT EXISTS generated_script TEXT,
  ADD COLUMN IF NOT EXISTS generated_caption TEXT,
  ADD COLUMN IF NOT EXISTS generated_hashtags TEXT,
  ADD COLUMN IF NOT EXISTS script_model TEXT,
  ADD COLUMN IF NOT EXISTS script_generated_at TIMESTAMPTZ;
