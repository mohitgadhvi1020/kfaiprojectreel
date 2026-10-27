-- Migration: store a plain-English "learn mode" explanation on startup rows.
-- After the reel + carousel + caption are generated, the user can click
-- "Explain in Simple Terms" to get a Gemini-generated walkthrough of every
-- technical term and the overall idea. We persist it so reopening the
-- startup doesn't require re-running the call.

ALTER TABLE startups
  ADD COLUMN IF NOT EXISTS layman_explanation TEXT,
  ADD COLUMN IF NOT EXISTS layman_generated_at TIMESTAMPTZ;
