export type ContentGenerationStatus =
  | "none"
  | "researching"
  | "generating"
  | "hooks"
  | "scripting"
  | "refining"
  | "completed"
  | "failed";

export interface Startup {
  id: string;
  name: string;
  description: string;
  funding_amount: string;
  funding_round: string;
  investor: string;
  tech: string;
  builder_value: string;
  website?: string;
  category?: string;
  source_url?: string;
  discovered_at: string;
  scale: "small" | "medium";
  is_used: boolean;
  reel_created: boolean;
  run_id: string | null;
  content_status: ContentGenerationStatus;
}

export interface XTip {
  id: string;
  author: string;
  post_summary: string;
  practical_takeaway: string;
  reel_potential: string;
  post_url: string;
  post_snippet: string;
  discovered_at: string;
  is_used: boolean;
  run_id: string | null;
}

export interface TrendingTopic {
  id: string;
  topic: string;
  platform: string;
  angle: string;
  discovered_at: string;
  run_id: string | null;
}

export interface Run {
  id: string;
  status:
    | "researching"
    | "ready"
    | "generating"
    | "hooks"
    | "scripting"
    | "refining"
    | "completed"
    | "failed";
  created_at: string;
  completed_at: string | null;
  startups_found: number;
  x_tips_found: number;
  trending_found: number;
  selected_startup_id: string | null;
  selected_x_tip_id: string | null;
  content_type: "startup" | "x_tip" | null;
}

export interface ResearchData {
  id: string;
  run_id: string;
  startup_id: string | null;
  x_tip_id: string | null;
  technical_research: string;
  technical_sources: string[];
  product_research: string;
  product_sources: string[];
  market_research: string;
  market_sources: string[];
  founders_research: string;
  founders_sources: string[];
  viral_angles: string;
  research_quality_score: number;
  research_passed: boolean;
  research_warning: string;
  created_at: string;
}

export interface Hook {
  style: string;
  hook: string;
  why_it_works: string;
}

export interface GeneratedContent {
  id: string;
  run_id: string;
  startup_id: string | null;
  x_tip_id: string | null;
  content_type: "reel_script" | "carousel_text" | "caption_hashtags";
  content: string;
  is_refined: boolean;
  hooks: Hook[];
  selected_hook: Hook | null;
  quality_score: string;
  reviewer_notes: string;
  created_at: string;
}

export interface AppSettings {
  id: string;
  perplexity_api_key: string;
  openai_api_key: string;
  apify_api_key: string;
  supabase_url: string;
  supabase_anon_key: string;
  supabase_service_key: string;
  instagram_handle: string;
  creator_name: string;
  creator_bio: string;
  x_tracked_accounts: string[];
  content_tone: string;
  updated_at: string;
}

export interface ContentPreference {
  id: string;
  note: string;
  category: "like" | "dislike" | "style" | "instruction";
  created_at: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date?: string;
}

export type MonitorSource = "youtube" | "instagram" | "twitter";
export type MonitorItemStatus = "new" | "reviewed" | "used" | "dismissed";

export interface MonitoredChannel {
  id: string;
  platform: MonitorSource;
  channel_id: string;
  channel_name: string;
  channel_url?: string;
  added_at: string;
  last_polled_at: string | null;
  is_active: boolean;
}

export interface MonitoredContent {
  id: string;
  source: MonitorSource;
  source_channel_id: string;
  source_channel_name: string;
  title: string;
  url: string;
  thumbnail: string | null;
  published_at: string;
  raw_text: string;
  summary: string | null;
  topics: string[];
  tools_mentioned: string[];
  content_ideas: string[];
  key_insights: string[];
  content_type: string | null;
  status: MonitorItemStatus;
  created_at: string;
}
