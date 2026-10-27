-- Migration: store viral hook variants + AI opener-clip prompts on
-- monitored_content rows.
-- When the user clicks "Generate Script" on a monitored reel/post, the same
-- LLM call now also returns 5-6 alternate viral hooks and ready-to-paste
-- AI cold-open clip prompts (Veo 3 / Gemini and Higgsfield). We persist these
-- inline so the monitor UI can surface them next to the script.

ALTER TABLE monitored_content
  ADD COLUMN IF NOT EXISTS generated_hooks TEXT,
  ADD COLUMN IF NOT EXISTS opener_clip_concept TEXT,
  ADD COLUMN IF NOT EXISTS opener_clip_veo_prompt TEXT,
  ADD COLUMN IF NOT EXISTS opener_clip_higgsfield_prompt TEXT;
