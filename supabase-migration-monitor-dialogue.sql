-- Migration: store dialogue-video job reference on monitored_content rows.
-- When the user clicks "Generate Dialogue Video" on a monitored video/post,
-- we kick off the existing /video pipeline (dialogue script → ElevenLabs
-- voices → Remotion render with character avatars + subtitles + background
-- video), and persist the job ID + status on the monitored_content row so the
-- UI can surface progress and the download URL next to the original.

ALTER TABLE monitored_content
  ADD COLUMN IF NOT EXISTS dialogue_video_job_id TEXT,
  ADD COLUMN IF NOT EXISTS dialogue_video_status TEXT,
  ADD COLUMN IF NOT EXISTS dialogue_video_url TEXT,
  ADD COLUMN IF NOT EXISTS dialogue_video_character_set TEXT,
  ADD COLUMN IF NOT EXISTS dialogue_video_started_at TIMESTAMPTZ;
