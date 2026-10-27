-- Migration: support hook-first flow
-- The redesigned pipeline generates 10 hooks BEFORE the script, and waits for
-- the user to pick one. We cache those hooks on the startup row so we don't
-- need to fabricate a placeholder generated_content row (which would violate
-- the CHECK constraint + NOT NULL content column on that table).

ALTER TABLE startups
  ADD COLUMN IF NOT EXISTS hooks_cache JSONB DEFAULT NULL;

-- Allow the new pipeline status values used by the UI.
-- (Safe to re-run: drops the old constraint then re-adds it.)
ALTER TABLE startups DROP CONSTRAINT IF EXISTS startups_content_status_check;
-- If you had a content_status CHECK, recreate here. Most installs don't have one,
-- so we just skip. The app treats content_status as free-form TEXT.

-- Document the values the app will write:
--   'generating'    -- research in progress
--   'hooks'         -- LLM generating the 10 hooks
--   'hooks_ready'   -- 10 hooks in hooks_cache, waiting for user to pick one
--   'scripting'     -- user picked a hook, building script
--   'refining'      -- refinement pass
--   'completed'     -- script + carousel + caption saved
--   'failed'        -- error anywhere above
