-- Adds a tag_targets column on generated_content to store the founders + company
-- to @-mention when posting a LinkedIn post (the "tag helper" panel data).
-- Shape: { "company": {name, linkedin_url, search_url},
--          "founders": [{name, title, linkedin_url, search_url}, ...] }
--
-- Run this in the Supabase SQL editor. Safe to re-run.

ALTER TABLE generated_content
  ADD COLUMN IF NOT EXISTS tag_targets JSONB DEFAULT NULL;
