-- Adds 'linkedin_post' as an allowed content_type on generated_content so the
-- LinkedIn flow (Sorai Tech company-page posts) can store a single text post per
-- startup alongside the existing Instagram reel/carousel/caption rows.
--
-- Run this in the Supabase SQL editor. Safe to re-run.

ALTER TABLE generated_content
  DROP CONSTRAINT IF EXISTS generated_content_content_type_check;

ALTER TABLE generated_content
  ADD CONSTRAINT generated_content_content_type_check
  CHECK (content_type IN ('reel_script','carousel_text','caption_hashtags','linkedin_post'));
