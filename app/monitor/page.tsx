"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  RefreshCw, Loader2, Youtube, Instagram, ExternalLink,
  Eye, CheckCircle, X, Filter, Lightbulb, Tag, Wrench,
  Clock, ChevronDown, ChevronRight, Settings, Sparkles, Copy,
  Film, Download, Users, AlertCircle, Play, Image as ImageIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";

interface MonitoredItem {
  id: string;
  source: "youtube" | "instagram" | "twitter";
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
  status: "new" | "reviewed" | "used" | "dismissed";
  created_at: string;
  generated_script?: string | null;
  generated_caption?: string | null;
  generated_hashtags?: string | null;
  generated_hooks?: string | null;
  opener_clip_concept?: string | null;
  opener_clip_veo_prompt?: string | null;
  opener_clip_higgsfield_prompt?: string | null;
  hook_clip_path?: string | null;
  hook_clip_start?: number | null;
  hook_clip_end?: number | null;
  hook_clip_quote?: string | null;
  hook_clip_reason?: string | null;
  script_model?: string | null;
  script_generated_at?: string | null;
  dialogue_video_job_id?: string | null;
  dialogue_video_status?: string | null;
  dialogue_video_url?: string | null;
  dialogue_video_character_set?: string | null;
  dialogue_video_started_at?: string | null;
}

interface CharacterSet {
  id: string;
  theme: string;
  description: string;
  characterA: { name: string };
  characterB: { name: string };
}

interface BackgroundOption {
  path: string;
  name: string;
}

interface TimedLine {
  index: number;
  character: "A" | "B";
  text: string;
  start: number;
  end: number;
  matchedWords: number;
  totalWords: number;
}

interface VideoJobInfo {
  id: string;
  status:
    | "generating_script"
    | "generating_voices"
    | "rendering"
    | "completed"
    | "script_only"
    | "failed";
  error: string | null;
  downloadUrl: string | null;
  scriptPreview: string | null;
  timedLines?: TimedLine[] | null;
  alignmentMatchQuality?: number | null;
  characterSetId?: string | null;
}

const VIDEO_STATUS_LABEL: Record<string, string> = {
  generating_script: "Writing dialogue...",
  generating_voices: "Generating voices...",
  rendering: "Rendering video...",
  completed: "Ready",
  script_only: "Script ready (no ElevenLabs key)",
  failed: "Failed",
};

type SourceFilter = "all" | "youtube" | "instagram";
type StatusFilter = "all" | "new" | "reviewed" | "used" | "dismissed";

export default function MonitorPage() {
  const [items, setItems] = useState<MonitoredItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [channelCount, setChannelCount] = useState(0);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [clippingId, setClippingId] = useState<string | null>(null);
  // Dialogue-video state: which item is the panel open for, character sets,
  // backgrounds, per-item form selections, and live job status from /api/video/:id.
  const [dialoguePanelId, setDialoguePanelId] = useState<string | null>(null);
  const [characterSets, setCharacterSets] = useState<CharacterSet[]>([]);
  const [backgrounds, setBackgrounds] = useState<BackgroundOption[]>([]);
  const [dialogueForm, setDialogueForm] = useState<{
    characterSetId: string;
    targetDuration: number;
    backgroundVideoPath: string;
  }>({ characterSetId: "", targetDuration: 60, backgroundVideoPath: "backgrounds/bg-short.mp4" });
  const [dialogueStartingId, setDialogueStartingId] = useState<string | null>(null);
  const [videoJobs, setVideoJobs] = useState<Record<string, VideoJobInfo>>({});
  // Tracks which job is currently uploading user-recorded audio + rendering
  // it onto the Minecraft background. Disables the upload button during work.
  const [finalizingJobId, setFinalizingJobId] = useState<string | null>(null);
  // Which video job's full script panel is currently expanded inline next to
  // the post. Independent of dialogue/render status — works for script_only,
  // rendering, and completed jobs alike.
  const [scriptOpenJobId, setScriptOpenJobId] = useState<string | null>(null);
  // When set, expand the original source content (raw_text from the monitored
  // item) inline so the user can verify the generated dialogue script against
  // the YouTube transcript / Instagram caption it was based on.
  const [originalOpenItemId, setOriginalOpenItemId] = useState<string | null>(
    null
  );

  // "Latest in AI" explainer panel — separate from monitored content. Pulls
  // 6 fresh AI/tech topics (last 7 days) via /api/ai-explainer, which is
  // cached on disk for 6h so reloads are free. The user can force a refresh.
  const [explainerData, setExplainerData] = useState<{
    generatedAt: string;
    cached: boolean;
    stale?: boolean;
    warning?: string;
    topics: Array<{
      title: string;
      category: string;
      summary: string;
      why: string;
      hook?: string;
      bestFormat?: string;
      engagementBait?: string;
      growthScore?: number;
      underexposed?: boolean;
      sources: string[];
    }>;
  } | null>(null);
  const [explainerLoading, setExplainerLoading] = useState(false);
  const [explainerError, setExplainerError] = useState<string | null>(null);
  const [explainerCollapsed, setExplainerCollapsed] = useState(false);
  const [expandedTopicIdx, setExpandedTopicIdx] = useState<number | null>(null);
  // Per-topic dialogue-video state. Keyed by topic index in the explainer
  // payload — survives a page reload via localStorage so a long-running job
  // isn't lost when the tab refreshes.
  const [explainerJobs, setExplainerJobs] = useState<Record<number, string>>(
    () => {
      if (typeof window === "undefined") return {};
      try {
        return JSON.parse(localStorage.getItem("explainerJobs") || "{}");
      } catch {
        return {};
      }
    }
  );
  const [explainerCharSet, setExplainerCharSet] = useState<Record<number, string>>({});
  const [explainerStartingIdx, setExplainerStartingIdx] = useState<number | null>(
    null
  );
  // Visuals panel state. Per topic idx: the bundle (hero images + YT videos),
  // a loading flag, and which idx currently has the panel expanded.
  interface VisualsBundle {
    generatedAt: string;
    cached: boolean;
    entities: string[];
    hero: Array<{
      sourceUrl: string;
      title: string | null;
      image: string | null;
      video: string | null;
      siteName: string | null;
      extraImages: string[];
    }>;
    videos: Array<{
      videoId: string;
      url: string;
      embedUrl: string;
      title: string;
      channelTitle: string;
      thumbnail: string;
    }>;
    warnings: string[];
  }
  const [explainerVisuals, setExplainerVisuals] = useState<
    Record<number, VisualsBundle>
  >({});
  const [visualsLoadingIdx, setVisualsLoadingIdx] = useState<number | null>(
    null
  );
  const [visualsOpenIdx, setVisualsOpenIdx] = useState<number | null>(null);

  // ─── Instagram Reel Import ───
  const [reelUrl, setReelUrl] = useState("");
  const [reelImporting, setReelImporting] = useState(false);
  const [reelImportResult, setReelImportResult] = useState<{
    success: boolean;
    message: string;
    itemId?: string;
  } | null>(null);
  const [reelCollapsed, setReelCollapsed] = useState(false);
  const [reelDownloading, setReelDownloading] = useState(false);
  // Hindi script translation state — keyed by job ID
  const [hindiScripts, setHindiScripts] = useState<Record<string, string>>({});
  const [hindiLoadingJobId, setHindiLoadingJobId] = useState<string | null>(null);
  const [hindiOpenJobId, setHindiOpenJobId] = useState<string | null>(null);
  // When a reel is imported, optionally auto-open the dialogue panel for it.
  const [reelAutoDialogueId, setReelAutoDialogueId] = useState<string | null>(null);

  const handleReelImport = async () => {
    if (!reelUrl.trim()) return;
    setReelImporting(true);
    setReelImportResult(null);
    try {
      const res = await fetch("/api/monitor/reel-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: reelUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReelImportResult({ success: false, message: data.error || "Import failed" });
        toast.error(data.error || "Failed to import reel");
      } else {
        setReelImportResult({
          success: true,
          message: `Imported reel from @${data.item?.source_channel_id || "unknown"}${data.hasTranscript ? " (with transcript)" : " (caption only)"}`,
          itemId: data.item?.id,
        });
        toast.success("Reel imported! You can now generate dialogue from it.");
        setReelUrl("");
        // Refresh the items list so the new item shows up
        const r = await fetch("/api/monitor");
        const d = await r.json();
        if (d.items) setItems(d.items);
        // Auto-expand the imported item and open dialogue panel
        if (data.item?.id) {
          setExpandedId(data.item.id);
          setReelAutoDialogueId(data.item.id);
        }
      }
    } catch (err: any) {
      setReelImportResult({ success: false, message: err.message || "Network error" });
      toast.error("Failed to import reel");
    } finally {
      setReelImporting(false);
    }
  };

  const handleReelDownload = async () => {
    if (!reelUrl.trim()) return;
    setReelDownloading(true);
    const toastId = toast.loading("Downloading HD reel...");
    try {
      const res = await fetch("/api/monitor/reel-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: reelUrl.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Download failed" }));
        toast.error(data.error || "Download failed", { id: toastId });
        return;
      }
      const blob = await res.blob();
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ||
        "instagram-reel.mp4";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      toast.success("Reel downloaded!", { id: toastId });
    } catch (err: any) {
      toast.error(err.message || "Download failed", { id: toastId });
    } finally {
      setReelDownloading(false);
    }
  };

  /**
   * Upload a user-recorded audio file for a script-only job, then trigger
   * the ffmpeg mux against the Minecraft background. The job moves
   * script_only → rendering → completed (or failed).
   */
  const finalizeWithAudio = async (jobId: string, file: File) => {
    setFinalizingJobId(jobId);
    const toastId = toast.loading(`Rendering video with your audio...`);
    try {
      const fd = new FormData();
      fd.append("jobId", jobId);
      fd.append("audio", file);
      const res = await fetch("/api/video/finalize", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Render failed", { id: toastId });
      } else {
        toast.success("Video ready! Refresh to download.", { id: toastId });
        // Reflect new status immediately so UI shows download button.
        setVideoJobs((prev) => ({
          ...prev,
          [jobId]: {
            ...(prev[jobId] || {
              id: jobId,
              error: null,
              scriptPreview: null,
            }),
            id: jobId,
            status: "completed",
            error: null,
            downloadUrl: data.downloadUrl,
            scriptPreview: prev[jobId]?.scriptPreview || null,
          },
        }));
      }
    } catch (err: any) {
      toast.error(err?.message || "Upload failed", { id: toastId });
    } finally {
      setFinalizingJobId(null);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/monitor");
      const data = await res.json();
      setItems(data.items || []);
      setChannelCount((data.channels || []).length);
    } catch {
      toast.error("Failed to load monitored content");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-open the dialogue panel for a freshly imported reel.
  useEffect(() => {
    if (reelAutoDialogueId && items.some((i) => i.id === reelAutoDialogueId)) {
      setDialoguePanelId(reelAutoDialogueId);
      setReelAutoDialogueId(null);
    }
  }, [reelAutoDialogueId, items]);

  // Load character sets + available background videos once.
  useEffect(() => {
    fetch("/api/video/character-sets")
      .then((r) => r.json())
      .then((d) => {
        const list: CharacterSet[] = d.characterSets || [];
        setCharacterSets(list);
        setDialogueForm((prev) =>
          prev.characterSetId ? prev : { ...prev, characterSetId: list[0]?.id || "" }
        );
      })
      .catch(() => {});
    fetch("/api/video/backgrounds")
      .then((r) => r.json())
      .then((d) => {
        const list: BackgroundOption[] = d.backgrounds || [];
        setBackgrounds(list);
        setDialogueForm((prev) =>
          list.some((b) => b.path === prev.backgroundVideoPath)
            ? prev
            : { ...prev, backgroundVideoPath: list[0]?.path || "" }
        );
      })
      .catch(() => {});
  }, []);

  /**
   * Load the AI explainer panel. `force=true` skips the server-side cache
   * (costs an OpenAI call); the default `force=false` reads cached topics
   * if they're <6h old.
   */
  const loadExplainer = useCallback(async (force = false) => {
    setExplainerLoading(true);
    setExplainerError(null);
    try {
      const url = force ? "/api/ai-explainer?refresh=1" : "/api/ai-explainer";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setExplainerError(data.error || "Failed to load AI explainer");
      } else {
        setExplainerData(data);
        if (data.warning) toast(data.warning, { icon: "⚠️" });
      }
    } catch (err: any) {
      setExplainerError(err.message || "Network error");
    } finally {
      setExplainerLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExplainer(false);
  }, [loadExplainer]);

  // Poll any in-flight dialogue video jobs every 3s. Stops polling once
  // every tracked job is in a terminal state (completed / failed).
  useEffect(() => {
    const activeJobs = items
      .map((i) => i.dialogue_video_job_id)
      .filter((id): id is string => !!id)
      .filter((id) => {
        const j = videoJobs[id];
        return (
          !j ||
          (j.status !== "completed" &&
            j.status !== "failed" &&
            j.status !== "script_only")
        );
      });
    if (activeJobs.length === 0) return;

    let cancelled = false;
    const poll = async () => {
      const results = await Promise.all(
        activeJobs.map(async (id) => {
          try {
            const r = await fetch(`/api/video/${id}`);
            if (!r.ok) return null;
            return (await r.json()) as VideoJobInfo;
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      setVideoJobs((prev) => {
        const next = { ...prev };
        for (const j of results) if (j && j.id) next[j.id] = j;
        return next;
      });
      // If any job flipped to completed/failed, persist the final state on
      // its monitored_content row (status + download URL) so reloads are
      // sticky — then refresh the list.
      const flipped = results.filter(
        (j) =>
          j &&
          (j.status === "completed" ||
            j.status === "failed" ||
            j.status === "script_only")
      ) as VideoJobInfo[];
      if (flipped.length > 0) {
        await Promise.all(
          flipped.map((j) => {
            const item = items.find((i) => i.dialogue_video_job_id === j.id);
            if (!item || item.dialogue_video_status === j.status) return null;
            return fetch(`/api/monitor/${item.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                dialogue_video_status: j.status,
                dialogue_video_url: j.downloadUrl,
              }),
            }).catch(() => {});
          })
        );
        fetchData();
      }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [items, videoJobs, fetchData]);

  const handlePollNow = async () => {
    setPolling(true);
    toast.loading("Polling channels for new content...", { id: "poll" });

    try {
      const res = await fetch("/api/monitor", { method: "POST" });
      const data = await res.json();

      if (data.error) {
        toast.error(data.error, { id: "poll" });
      } else {
        const total = (data.youtube_processed || 0) + (data.instagram_processed || 0);
        toast.success(
          `Found ${total} new items (${data.youtube_processed} YT, ${data.instagram_processed} IG)`,
          { id: "poll" }
        );
        await fetchData();
      }
    } catch {
      toast.error("Poll failed", { id: "poll" });
    } finally {
      setPolling(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch(`/api/monitor/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: status as any } : item))
      );
    } catch {
      toast.error("Failed to update status");
    }
  };

  const generateScript = async (id: string) => {
    setGeneratingId(id);
    const toastId = toast.loading("Generating script with Gemini...");
    try {
      const res = await fetch(`/api/monitor/${id}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      toast.success(`Script generated (${data.model})`, { id: toastId });
      await fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to generate script", { id: toastId });
    } finally {
      setGeneratingId(null);
    }
  };

  const extractHookClip = async (id: string) => {
    setClippingId(id);
    const toastId = toast.loading(
      "Downloading source reel & finding the best hook moment… (~30s)"
    );
    try {
      const res = await fetch(`/api/monitor/${id}/extract-hook-clip`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hook clip extraction failed");
      toast.success(
        `Hook clip ready (${data.start?.toFixed?.(1)}s–${data.end?.toFixed?.(1)}s)`,
        { id: toastId }
      );
      await fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to extract hook clip", { id: toastId });
    } finally {
      setClippingId(null);
    }
  };

  const startDialogueVideo = async (id: string) => {
    if (!dialogueForm.characterSetId) {
      toast.error("Pick a character set first");
      return;
    }
    setDialogueStartingId(id);
    const toastId = toast.loading("Starting dialogue video pipeline...");
    try {
      const res = await fetch(`/api/monitor/${id}/generate-dialogue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dialogueForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Pipeline started — this takes 2–5 min", { id: toastId });
      setDialoguePanelId(null);
      await fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to start", { id: toastId });
    } finally {
      setDialogueStartingId(null);
    }
  };

  /**
   * Kick off a dialogue-video job from an explainer topic. Reuses
   * /api/video/generate (same pipeline monitored items use) — just feeds the
   * topic title + summary as the dialogue subject. Saves the spawned job id
   * keyed by topic index so the card can show live status.
   */
  const startDialogueFromExplainer = async (
    idx: number,
    topic: { title: string; summary: string; hook?: string; why?: string }
  ) => {
    const charSet = explainerCharSet[idx] || characterSets[0]?.id || "";
    if (!charSet) {
      toast.error("Pick a character set first");
      return;
    }
    setExplainerStartingIdx(idx);
    const toastId = toast.loading("Generating dialogue script...");
    try {
      // Concatenate the most useful fields into a single dialogue subject so
      // the script generator has actual material to riff on (title alone is
      // too thin; summary + why gives both facts and the hook).
      const subject = [topic.title, topic.summary, topic.why]
        .filter(Boolean)
        .join("\n\n");
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: subject,
          characterSetId: charSet,
          targetDuration: 60,
          generationMode: "topic_debate",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const jobId = data.jobId || data.id;
      if (!jobId) throw new Error("No job id returned");
      setExplainerJobs((prev) => {
        const next = { ...prev, [idx]: jobId };
        try {
          localStorage.setItem("explainerJobs", JSON.stringify(next));
        } catch {}
        return next;
      });
      toast.success("Script generating — refresh in ~30s", { id: toastId });
    } catch (e: any) {
      toast.error(e.message || "Failed to start dialogue", { id: toastId });
    } finally {
      setExplainerStartingIdx(null);
    }
  };

  // Poll explainer-spawned jobs the same way we poll monitored-item jobs.
  // Stops once every tracked job is in a terminal state.
  useEffect(() => {
    const ids = Object.values(explainerJobs).filter((id) => {
      const j = videoJobs[id];
      return (
        !j ||
        (j.status !== "completed" &&
          j.status !== "failed" &&
          j.status !== "script_only")
      );
    });
    if (ids.length === 0) return;
    const tick = async () => {
      const updates = await Promise.all(
        ids.map(async (id) => {
          try {
            const r = await fetch(`/api/video/${id}`);
            if (!r.ok) return null;
            return (await r.json()) as VideoJobInfo;
          } catch {
            return null;
          }
        })
      );
      setVideoJobs((prev) => {
        const next = { ...prev };
        updates.forEach((u) => {
          if (u) next[u.id] = u;
        });
        return next;
      });
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => clearInterval(t);
  }, [explainerJobs, videoJobs]);

  /**
   * Fetch a visuals bundle (OG hero shots + YouTube demos) for an explainer
   * topic. Cached server-side for 24h so repeat clicks are instant.
   */
  const findVisualsForTopic = async (
    idx: number,
    topic: { title: string; summary: string; sources: string[] }
  ) => {
    setVisualsLoadingIdx(idx);
    setVisualsOpenIdx(idx);
    try {
      const res = await fetch("/api/visuals/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cacheKey: `explainer-${idx}-${(topic.sources[0] || topic.title).slice(0, 80)}`,
          sources: topic.sources,
          text: `${topic.title}. ${topic.summary}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Visuals fetch failed");
        return;
      }
      setExplainerVisuals((prev) => ({ ...prev, [idx]: data }));
      if (data.warnings?.length) {
        for (const w of data.warnings) toast(w, { icon: "ℹ️", duration: 4000 });
      }
    } catch (err: any) {
      toast.error(err.message || "Network error fetching visuals");
    } finally {
      setVisualsLoadingIdx(null);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  const filtered = items.filter((item) => {
    if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    return true;
  });

  const stats = {
    total: items.length,
    new: items.filter((i) => i.status === "new").length,
    youtube: items.filter((i) => i.source === "youtube").length,
    instagram: items.filter((i) => i.source === "instagram").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Content Monitor</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Track YouTube and Instagram channels for content ideas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/monitor/channels"
            className="btn-outline px-3 py-2 text-sm flex items-center gap-1.5"
          >
            <Settings className="w-3.5 h-3.5" />
            Channels ({channelCount})
          </Link>
          <button
            onClick={handlePollNow}
            disabled={polling}
            className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5"
          >
            {polling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {polling ? "Polling..." : "Poll Now"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Items</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-semibold text-blue-600">{stats.new}</p>
          <p className="text-xs text-gray-500 mt-0.5">New / Unreviewed</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-1.5">
            <Youtube className="w-4 h-4 text-red-500" />
            <p className="text-2xl font-semibold text-gray-900">{stats.youtube}</p>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">YouTube Videos</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-1.5">
            <Instagram className="w-4 h-4 text-pink-500" />
            <p className="text-2xl font-semibold text-gray-900">{stats.instagram}</p>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Instagram Posts</p>
        </div>
      </div>

      {/* Latest in AI — explainer panel. Lives above the monitored items so
          it's the first thing the user sees when checking content sources. */}
      <div className="card p-4 mb-6 border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setExplainerCollapsed((v) => !v)}
            className="flex items-center gap-2 text-left"
          >
            {explainerCollapsed ? (
              <ChevronRight className="w-4 h-4 text-indigo-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-indigo-500" />
            )}
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">
              Latest in AI
            </h2>
            <span className="text-[11px] text-gray-500 font-normal">
              — new models, tools & tricks worth teaching
            </span>
            {explainerData && (
              <span className="text-[10px] text-gray-400 font-normal ml-1">
                {explainerData.cached
                  ? `cached ${formatDistanceToNow(new Date(explainerData.generatedAt), { addSuffix: true })}`
                  : "just refreshed"}
                {explainerData.stale && " (stale — live refresh failed)"}
              </span>
            )}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadExplainer(true)}
              disabled={explainerLoading}
              className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 disabled:opacity-50"
              title="Force live refresh (uses OpenAI search)"
            >
              {explainerLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {explainerLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {!explainerCollapsed && (
          <>
            {explainerError && !explainerData && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2.5">
                {explainerError}
              </div>
            )}

            {!explainerData && !explainerError && explainerLoading && (
              <div className="text-xs text-gray-500 flex items-center gap-2 py-4">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Pulling the latest AI developments from the web...
              </div>
            )}

            {explainerData && explainerData.topics.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {explainerData.topics.map((t, idx) => {
                  const isOpen = expandedTopicIdx === idx;
                  const catColor =
                    {
                      model: "bg-purple-100 text-purple-700",
                      tool: "bg-blue-100 text-blue-700",
                      skill: "bg-amber-100 text-amber-700",
                      workflow: "bg-pink-100 text-pink-700",
                      research: "bg-emerald-100 text-emerald-700",
                    }[t.category] || "bg-gray-100 text-gray-700";
                  // Color the growth score so the eye scans 8+ first.
                  const score = t.growthScore ?? 5;
                  const scoreColor =
                    score >= 8
                      ? "bg-emerald-100 text-emerald-700"
                      : score >= 6
                      ? "bg-amber-100 text-amber-700"
                      : "bg-gray-100 text-gray-600";
                  // Pretty label for bestFormat field.
                  const fmtLabel =
                    {
                      tutorial: "📚 Tutorial",
                      hot_take: "🔥 Hot take",
                      faceoff: "⚔️ Faceoff",
                      demo: "🎬 Demo",
                      list: "📋 List",
                      reaction: "👀 Reaction",
                    }[t.bestFormat || "demo"] || "🎬 Demo";
                  return (
                    <div
                      key={idx}
                      className="bg-white border border-indigo-100 rounded-lg p-3 hover:border-indigo-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h3 className="text-sm font-semibold text-gray-900 leading-snug">
                          {t.title}
                        </h3>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${scoreColor}`}
                            title="Growth score: how likely to drive follows for a small AI account"
                          >
                            {score}/10
                          </span>
                          <span
                            className={`text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded ${catColor}`}
                          >
                            {t.category}
                          </span>
                        </div>
                      </div>

                      {/* Hook line — what becomes the first 3 seconds of the
                          video. Always shown; this is the most important field. */}
                      {t.hook && (
                        <p className="text-[12px] font-medium text-gray-900 italic mb-1.5 leading-snug">
                          "{t.hook}"
                        </p>
                      )}

                      {/* Format + underexposed badge row */}
                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        <span className="text-[10px] text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded">
                          {fmtLabel}
                        </span>
                        {t.underexposed && (
                          <span
                            className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded font-medium"
                            title="Few creators have covered this — first-mover advantage"
                          >
                            ✨ Underexposed
                          </span>
                        )}
                      </div>

                      <p
                        className={`text-xs text-gray-700 leading-relaxed ${
                          isOpen ? "" : "line-clamp-2"
                        }`}
                      >
                        {t.summary}
                      </p>

                      {isOpen && (
                        <div className="mt-2 space-y-1.5">
                          {t.why && (
                            <p className="text-xs text-indigo-700 leading-relaxed">
                              <span className="font-medium">🎬 Show on camera: </span>
                              {t.why}
                            </p>
                          )}
                          {t.engagementBait && (
                            <p className="text-xs text-rose-700 leading-relaxed">
                              <span className="font-medium">💬 Comment bait: </span>
                              {t.engagementBait}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2 gap-2">
                        <button
                          onClick={() =>
                            setExpandedTopicIdx(isOpen ? null : idx)
                          }
                          className="text-[10px] text-indigo-600 hover:text-indigo-800"
                        >
                          {isOpen ? "Show less" : "Show angles"}
                        </button>
                        {t.sources.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            {t.sources.slice(0, 3).map((s, i) => {
                              let host = "";
                              try {
                                host = new URL(s).hostname.replace(/^www\./, "");
                              } catch {
                                host = "source";
                              }
                              return (
                                <a
                                  key={i}
                                  href={s}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="text-[10px] text-gray-500 hover:text-indigo-600 flex items-center gap-0.5"
                                >
                                  <ExternalLink className="w-2.5 h-2.5" />
                                  {host}
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Visuals panel — pulls OG hero images from the
                          source URLs + YouTube demo videos for entities the
                          model finds in the script. Server-cached 24h. */}
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => {
                              if (explainerVisuals[idx]) {
                                setVisualsOpenIdx(
                                  visualsOpenIdx === idx ? null : idx
                                );
                              } else {
                                findVisualsForTopic(idx, t);
                              }
                            }}
                            disabled={visualsLoadingIdx === idx}
                            className="text-[10px] text-indigo-700 hover:text-indigo-900 flex items-center gap-1 disabled:opacity-50"
                          >
                            {visualsLoadingIdx === idx ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <ImageIcon className="w-3 h-3" />
                            )}
                            {visualsLoadingIdx === idx
                              ? "Searching..."
                              : explainerVisuals[idx]
                              ? visualsOpenIdx === idx
                                ? "Hide visuals"
                                : `View visuals (${
                                    (explainerVisuals[idx].hero?.length || 0) +
                                    (explainerVisuals[idx].videos?.length || 0)
                                  })`
                              : "🖼️ Find visuals"}
                          </button>
                          {explainerVisuals[idx] && (
                            <button
                              onClick={() => findVisualsForTopic(idx, t)}
                              disabled={visualsLoadingIdx === idx}
                              className="text-[10px] text-gray-400 hover:text-gray-600"
                              title="Re-fetch (skips cache)"
                            >
                              ↻
                            </button>
                          )}
                        </div>
                        {visualsOpenIdx === idx &&
                          explainerVisuals[idx] &&
                          (() => {
                            const v = explainerVisuals[idx];
                            return (
                              <div className="mt-2 space-y-2.5">
                                {/* Entity chips — shows what we searched for
                                    so the user knows why these results came back. */}
                                {v.entities.length > 0 && (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className="text-[10px] text-gray-400">
                                      Searched:
                                    </span>
                                    {v.entities.map((e, i) => (
                                      <span
                                        key={i}
                                        className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded"
                                      >
                                        {e}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Tier 1: hero images grid */}
                                {v.hero.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-medium text-gray-600 mb-1">
                                      Hero shots ({v.hero.length})
                                    </p>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      {v.hero.map((h, i) =>
                                        h.image ? (
                                          <a
                                            key={i}
                                            href={h.image}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="group relative block bg-gray-100 rounded overflow-hidden border border-gray-200 hover:border-indigo-300"
                                            title={
                                              h.title
                                                ? `${h.title} — ${h.siteName}`
                                                : h.siteName || "open image"
                                            }
                                          >
                                            <img
                                              src={h.image}
                                              alt={h.title || ""}
                                              className="w-full aspect-video object-cover"
                                              loading="lazy"
                                            />
                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                                              <span className="text-[9px] text-white font-medium truncate block">
                                                {h.siteName || "source"}
                                              </span>
                                            </div>
                                            <button
                                              onClick={(e) => {
                                                e.preventDefault();
                                                copyToClipboard(
                                                  h.image!,
                                                  "Image URL"
                                                );
                                              }}
                                              className="absolute top-1 right-1 bg-white/90 hover:bg-white text-gray-700 text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                              Copy URL
                                            </button>
                                          </a>
                                        ) : null
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Tier 2: YouTube demo grid */}
                                {v.videos.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-medium text-gray-600 mb-1">
                                      YouTube demos ({v.videos.length})
                                    </p>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      {v.videos.map((vid) => (
                                        <a
                                          key={vid.videoId}
                                          href={vid.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="group relative block bg-gray-100 rounded overflow-hidden border border-gray-200 hover:border-indigo-300"
                                          title={`${vid.title} — ${vid.channelTitle}`}
                                        >
                                          <img
                                            src={vid.thumbnail}
                                            alt={vid.title}
                                            className="w-full aspect-video object-cover"
                                            loading="lazy"
                                          />
                                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity">
                                            <Play className="w-6 h-6 text-white drop-shadow" fill="currentColor" />
                                          </div>
                                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent p-1.5">
                                            <p className="text-[10px] text-white font-medium leading-tight line-clamp-2">
                                              {vid.title}
                                            </p>
                                            <p className="text-[9px] text-gray-300 truncate">
                                              {vid.channelTitle}
                                            </p>
                                          </div>
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {v.hero.length === 0 &&
                                  v.videos.length === 0 && (
                                    <p className="text-[10px] text-gray-500 italic">
                                      No visuals found.{" "}
                                      {v.warnings[0] ||
                                        "Try checking the source URLs manually."}
                                    </p>
                                  )}
                              </div>
                            );
                          })()}
                      </div>

                      {/* Dialogue-video generation panel — wires the topic
                          straight into /api/video/generate. Once a job is
                          spawned the card shows live status, script preview,
                          and the audio-upload step (same flow as monitored
                          items). */}
                      {(() => {
                        const jobId = explainerJobs[idx];
                        const job = jobId ? videoJobs[jobId] : null;
                        const status = job?.status;
                        const isStarting = explainerStartingIdx === idx;

                        if (!jobId) {
                          return (
                            <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1.5">
                              <select
                                value={
                                  explainerCharSet[idx] ||
                                  characterSets[0]?.id ||
                                  ""
                                }
                                onChange={(e) =>
                                  setExplainerCharSet((p) => ({
                                    ...p,
                                    [idx]: e.target.value,
                                  }))
                                }
                                className="text-[10px] border border-gray-200 rounded px-1.5 py-1 bg-white flex-1 min-w-0"
                              >
                                {characterSets.map((cs) => (
                                  <option key={cs.id} value={cs.id}>
                                    {cs.characterA.name} × {cs.characterB.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() =>
                                  startDialogueFromExplainer(idx, t)
                                }
                                disabled={isStarting || characterSets.length === 0}
                                className="text-[10px] px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1 flex-shrink-0"
                              >
                                {isStarting ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Film className="w-3 h-3" />
                                )}
                                {isStarting ? "Starting..." : "Generate dialogue"}
                              </button>
                            </div>
                          );
                        }

                        return (
                          <div className="mt-2 pt-2 border-t border-gray-100">
                            <div className="flex items-center justify-between mb-1.5">
                              <span
                                className={`text-[10px] flex items-center gap-1 ${
                                  status === "completed"
                                    ? "text-green-600"
                                    : status === "script_only"
                                    ? "text-amber-600"
                                    : status === "failed"
                                    ? "text-red-600"
                                    : "text-blue-600"
                                }`}
                              >
                                {(!status ||
                                  (status !== "completed" &&
                                    status !== "failed" &&
                                    status !== "script_only")) && (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                )}
                                {status === "completed" && (
                                  <CheckCircle className="w-3 h-3" />
                                )}
                                {status === "script_only" && (
                                  <CheckCircle className="w-3 h-3" />
                                )}
                                {status === "failed" && (
                                  <AlertCircle className="w-3 h-3" />
                                )}
                                <Film className="w-3 h-3" />
                                {VIDEO_STATUS_LABEL[status || "generating_script"] ||
                                  "Working..."}
                              </span>
                              <button
                                onClick={() => {
                                  setExplainerJobs((prev) => {
                                    const next = { ...prev };
                                    delete next[idx];
                                    try {
                                      localStorage.setItem(
                                        "explainerJobs",
                                        JSON.stringify(next)
                                      );
                                    } catch {}
                                    return next;
                                  });
                                }}
                                className="text-[10px] text-gray-400 hover:text-gray-600"
                                title="Detach this job (regenerate with a different cast)"
                              >
                                Reset
                              </button>
                            </div>
                            {job?.error && (
                              <p className="text-[10px] text-red-600 mb-1">
                                {job.error}
                              </p>
                            )}
                            {job?.scriptPreview && (
                              <details className="mb-1.5">
                                <summary className="text-[10px] text-indigo-600 cursor-pointer hover:text-indigo-800">
                                  View script
                                </summary>
                                <pre className="whitespace-pre-wrap font-mono text-[10px] text-gray-800 bg-white border border-gray-200 rounded p-2 mt-1 max-h-72 overflow-y-auto">
                                  {job.scriptPreview}
                                </pre>
                              </details>
                            )}
                            {status === "script_only" && (
                              <label
                                className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded border cursor-pointer ${
                                  finalizingJobId === jobId
                                    ? "bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed"
                                    : "bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700"
                                }`}
                              >
                                {finalizingJobId === jobId ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Rendering...
                                  </>
                                ) : (
                                  <>
                                    <Film className="w-3 h-3" />
                                    Upload audio & render
                                  </>
                                )}
                                <input
                                  type="file"
                                  accept="audio/*"
                                  className="hidden"
                                  disabled={finalizingJobId === jobId}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) finalizeWithAudio(jobId, f);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            )}
                            {status === "completed" && job?.downloadUrl && (
                              <a
                                href={job.downloadUrl}
                                download
                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] bg-indigo-600 text-white rounded hover:bg-indigo-700"
                              >
                                <Download className="w-3 h-3" /> Download video
                              </a>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}

            {explainerData && explainerData.topics.length === 0 && (
              <p className="text-xs text-gray-500 py-3">
                No topics returned. Try refreshing.
              </p>
            )}
          </>
        )}
      </div>

      {/* ─── Import Instagram Reel ─── */}
      <div className="card p-4 mb-6 border-pink-100 bg-gradient-to-br from-pink-50/50 to-white">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setReelCollapsed((v) => !v)}
            className="flex items-center gap-2 text-left"
          >
            {reelCollapsed ? (
              <ChevronRight className="w-4 h-4 text-pink-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-pink-500" />
            )}
            <Instagram className="w-4 h-4 text-pink-600" />
            <h2 className="text-sm font-semibold text-gray-900">
              Import Instagram Reel
            </h2>
            <span className="text-[11px] text-gray-500 font-normal">
              — paste a reel link, generate dialogue content
            </span>
          </button>
        </div>

        {!reelCollapsed && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Paste an Instagram reel or post URL below. We&apos;ll fetch the video, transcribe the audio,
              analyze the content, and create it as a monitored item — ready for dialogue video generation.
            </p>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={reelUrl}
                onChange={(e) => setReelUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !reelImporting) handleReelImport();
                }}
                placeholder="https://www.instagram.com/reel/..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-400 placeholder:text-gray-400"
                disabled={reelImporting}
              />
              <button
                onClick={handleReelImport}
                disabled={reelImporting || !reelUrl.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
              >
                {reelImporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Import Reel
                  </>
                )}
              </button>
              <button
                onClick={handleReelDownload}
                disabled={reelDownloading || !reelUrl.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-700 hover:bg-gray-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                title="Download HD video"
              >
                {reelDownloading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Download HD
                  </>
                )}
              </button>
            </div>

            {reelImporting && (
              <div className="flex items-center gap-2 text-xs text-pink-600 bg-pink-50 border border-pink-200 rounded-lg p-2.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Fetching reel → transcribing audio → analyzing content... This may take 30-60 seconds.
              </div>
            )}

            {reelImportResult && (
              <div
                className={`flex items-start gap-2 text-xs rounded-lg p-2.5 border ${
                  reelImportResult.success
                    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                    : "text-red-600 bg-red-50 border-red-200"
                }`}
              >
                {reelImportResult.success ? (
                  <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <p>{reelImportResult.message}</p>
                  {reelImportResult.success && reelImportResult.itemId && (
                    <p className="mt-1 text-gray-500">
                      Scroll down to find the imported item and click &quot;Dialogue Video&quot; to generate content with characters.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Filter className="w-3.5 h-3.5" />
          Filters:
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(["all", "youtube", "instagram"] as SourceFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setSourceFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                sourceFilter === f
                  ? "bg-white shadow-sm text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {f === "all" ? "All Sources" : f === "youtube" ? "YouTube" : "Instagram"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(["all", "new", "reviewed", "used", "dismissed"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                statusFilter === f
                  ? "bg-white shadow-sm text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content Feed */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <RefreshCw className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-900 mb-1">No content yet</h3>
          <p className="text-xs text-gray-500 mb-4">
            {channelCount === 0
              ? "Add some channels to monitor first."
              : "Click 'Poll Now' to fetch latest content from your tracked channels."}
          </p>
          {channelCount === 0 && (
            <Link
              href="/monitor/channels"
              className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5" />
              Add Channels
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div key={item.id} className="card-hover overflow-hidden">
                {/* Collapsed Row */}
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  {/* Source Icon */}
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      item.source === "youtube"
                        ? "bg-red-50 text-red-500"
                        : "bg-pink-50 text-pink-500"
                    }`}
                  >
                    {item.source === "youtube" ? (
                      <Youtube className="w-4 h-4" />
                    ) : (
                      <Instagram className="w-4 h-4" />
                    )}
                  </div>

                  {/* Thumbnail */}
                  {item.thumbnail && (
                    <div className="w-16 h-10 rounded overflow-hidden flex-shrink-0 bg-gray-100">
                      <img
                        src={item.thumbnail}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Title + Meta */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {item.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">
                        {item.source_channel_name}
                      </span>
                      <span className="text-xs text-gray-300">|</span>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(item.published_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Topics Tags */}
                  <div className="flex items-center gap-1 flex-shrink-0 max-w-xs overflow-hidden">
                    {(item.topics || []).slice(0, 3).map((topic, i) => (
                      <span
                        key={i}
                        className="badge bg-blue-50 text-blue-600 whitespace-nowrap"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`badge flex-shrink-0 ${
                      item.status === "new"
                        ? "bg-green-50 text-green-600"
                        : item.status === "reviewed"
                        ? "bg-blue-50 text-blue-600"
                        : item.status === "used"
                        ? "bg-purple-50 text-purple-600"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {item.status}
                  </span>

                  {/* Expand Icon */}
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  )}
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50/50 animate-fade-in">
                    {/* Generated Script (if exists) */}
                    {item.generated_script && (
                      <div className="mb-4 p-3 bg-white border border-purple-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <p className="section-title flex items-center gap-1 text-purple-600">
                            <Sparkles className="w-3 h-3" />
                            Generated Reel Script
                            {item.script_model && (
                              <span className="text-[10px] text-gray-400 font-normal ml-1">
                                ({item.script_model}
                                {item.script_generated_at &&
                                  " · " +
                                    formatDistanceToNow(new Date(item.script_generated_at), {
                                      addSuffix: true,
                                    })}
                                )
                              </span>
                            )}
                          </p>
                          <button
                            onClick={() =>
                              copyToClipboard(item.generated_script!, "Script")
                            }
                            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" /> Copy
                          </button>
                        </div>
                        <pre className="text-xs text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                          {item.generated_script}
                        </pre>
                        {item.generated_caption && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <div className="flex items-center justify-between mb-1">
                              <p className="section-title">Caption</p>
                              <button
                                onClick={() =>
                                  copyToClipboard(item.generated_caption!, "Caption")
                                }
                                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" /> Copy
                              </button>
                            </div>
                            <p className="text-xs text-gray-700 whitespace-pre-wrap">
                              {item.generated_caption}
                            </p>
                          </div>
                        )}
                        {item.generated_hashtags && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <div className="flex items-center justify-between mb-1">
                              <p className="section-title">Hashtags</p>
                              <button
                                onClick={() =>
                                  copyToClipboard(item.generated_hashtags!, "Hashtags")
                                }
                                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" /> Copy
                              </button>
                            </div>
                            <p className="text-xs text-blue-600 whitespace-pre-wrap">
                              {item.generated_hashtags}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Viral Hooks + AI Opener Clip — shown for BOTH the reel-script
                        and dialogue-video flows, since both now populate these. */}
                    {(item.generated_hooks ||
                      item.opener_clip_veo_prompt ||
                      item.opener_clip_higgsfield_prompt) && (
                      <div className="mb-4 p-3 bg-white border border-rose-200 rounded-lg">
                        {item.generated_hooks && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <p className="section-title flex items-center gap-1 text-rose-600">
                                <Sparkles className="w-3 h-3" /> Viral Hook Variants
                              </p>
                              <button
                                onClick={() =>
                                  copyToClipboard(item.generated_hooks!, "Hooks")
                                }
                                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" /> Copy
                              </button>
                            </div>
                            <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                              {item.generated_hooks}
                            </p>
                          </div>
                        )}

                        {(item.opener_clip_veo_prompt ||
                          item.opener_clip_higgsfield_prompt) && (
                          <div
                            className={
                              item.generated_hooks
                                ? "mt-3 pt-3 border-t border-gray-100"
                                : ""
                            }
                          >
                            <p className="section-title flex items-center gap-1 text-amber-600 mb-2">
                              <Film className="w-3 h-3" /> AI Opener Clip (~3s hook)
                            </p>
                            {item.opener_clip_concept && (
                              <p className="text-[11px] text-gray-500 italic mb-2">
                                {item.opener_clip_concept}
                              </p>
                            )}
                            {item.opener_clip_veo_prompt && (
                              <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                    Veo 3 / Gemini
                                  </p>
                                  <button
                                    onClick={() =>
                                      copyToClipboard(
                                        item.opener_clip_veo_prompt!,
                                        "Veo 3 prompt"
                                      )
                                    }
                                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                                  >
                                    <Copy className="w-3 h-3" /> Copy
                                  </button>
                                </div>
                                <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                                  {item.opener_clip_veo_prompt}
                                </p>
                              </div>
                            )}
                            {item.opener_clip_higgsfield_prompt && (
                              <div className="p-2 bg-violet-50 border border-violet-200 rounded">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                                    Higgsfield
                                  </p>
                                  <button
                                    onClick={() =>
                                      copyToClipboard(
                                        item.opener_clip_higgsfield_prompt!,
                                        "Higgsfield prompt"
                                      )
                                    }
                                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                                  >
                                    <Copy className="w-3 h-3" /> Copy
                                  </button>
                                </div>
                                <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                                  {item.opener_clip_higgsfield_prompt}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Hook clip cut from the SOURCE reel (real footage cold-open) */}
                    {item.source === "instagram" && item.url && (
                      <div className="mb-4 p-3 bg-white border border-emerald-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <p className="section-title flex items-center gap-1 text-emerald-600">
                            <Film className="w-3 h-3" /> Hook Clip from Source Reel
                          </p>
                          <button
                            onClick={() => extractHookClip(item.id)}
                            disabled={clippingId === item.id}
                            className="text-xs font-medium text-emerald-700 hover:text-emerald-900 disabled:opacity-50 flex items-center gap-1"
                          >
                            {clippingId === item.id
                              ? "Extracting…"
                              : item.hook_clip_path
                              ? "Re-extract"
                              : "Extract best ~3s"}
                          </button>
                        </div>
                        {!item.hook_clip_path && clippingId !== item.id && (
                          <p className="text-[11px] text-gray-500">
                            Downloads the original reel, finds the most
                            scroll-stopping moment, and cuts a ~3s clip you can drop
                            in as the cold-open.
                          </p>
                        )}
                        {item.hook_clip_path && (
                          <div>
                            <video
                              src={item.hook_clip_path}
                              controls
                              playsInline
                              className="w-full max-w-[220px] rounded-md border border-gray-200 bg-black mb-2"
                            />
                            {item.hook_clip_quote && (
                              <p className="text-xs text-gray-800 italic mb-1">
                                “{item.hook_clip_quote}”
                              </p>
                            )}
                            {item.hook_clip_reason && (
                              <p className="text-[11px] text-gray-500 mb-2">
                                {item.hook_clip_reason}
                              </p>
                            )}
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-gray-400">
                                {typeof item.hook_clip_start === "number" &&
                                typeof item.hook_clip_end === "number"
                                  ? `${item.hook_clip_start.toFixed(1)}s–${item.hook_clip_end.toFixed(1)}s`
                                  : ""}
                              </span>
                              <a
                                href={item.hook_clip_path}
                                download
                                className="text-xs text-emerald-700 hover:text-emerald-900 underline"
                              >
                                Download clip
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dialogue Video status (if a job exists) */}
                    {item.dialogue_video_job_id &&
                      (() => {
                        const job = videoJobs[item.dialogue_video_job_id];
                        const status =
                          job?.status || item.dialogue_video_status || "generating_script";
                        const downloadUrl = job?.downloadUrl || item.dialogue_video_url;
                        const isTerminal =
                          status === "completed" ||
                          status === "failed" ||
                          status === "script_only";
                        return (
                          <div className="mb-4 p-3 bg-white border border-indigo-200 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <p className="section-title flex items-center gap-1 text-indigo-600">
                                <Film className="w-3 h-3" />
                                Dialogue Video
                                {item.dialogue_video_character_set && (
                                  <span className="text-[10px] text-gray-400 font-normal ml-1">
                                    ({item.dialogue_video_character_set})
                                  </span>
                                )}
                              </p>
                              <span
                                className={`text-xs flex items-center gap-1 ${
                                  status === "completed"
                                    ? "text-green-600"
                                    : status === "script_only"
                                    ? "text-amber-600"
                                    : status === "failed"
                                    ? "text-red-600"
                                    : "text-blue-600"
                                }`}
                              >
                                {!isTerminal && (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                )}
                                {status === "completed" && (
                                  <CheckCircle className="w-3 h-3" />
                                )}
                                {status === "script_only" && (
                                  <CheckCircle className="w-3 h-3" />
                                )}
                                {status === "failed" && (
                                  <AlertCircle className="w-3 h-3" />
                                )}
                                {VIDEO_STATUS_LABEL[status] || status}
                              </span>
                            </div>
                            {/* View / hide full script — works for any status
                                as long as the script has been generated. */}
                            {job?.scriptPreview && (
                              <div className="flex items-center gap-2 mb-2">
                                <button
                                  onClick={() =>
                                    setScriptOpenJobId(
                                      scriptOpenJobId === item.dialogue_video_job_id
                                        ? null
                                        : item.dialogue_video_job_id!
                                    )
                                  }
                                  className="text-[11px] text-indigo-700 hover:text-indigo-900 flex items-center gap-1 font-medium"
                                >
                                  {scriptOpenJobId === item.dialogue_video_job_id ? (
                                    <>
                                      <ChevronDown className="w-3 h-3" /> Hide script
                                    </>
                                  ) : (
                                    <>
                                      <ChevronRight className="w-3 h-3" /> View script
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() =>
                                    copyToClipboard(job.scriptPreview!, "Script")
                                  }
                                  className="text-[11px] text-gray-500 hover:text-gray-700 flex items-center gap-1"
                                >
                                  <Copy className="w-3 h-3" /> Copy script
                                </button>
                                <button
                                  onClick={async () => {
                                    const jid = item.dialogue_video_job_id!;
                                    if (hindiScripts[jid]) {
                                      setHindiOpenJobId(hindiOpenJobId === jid ? null : jid);
                                      return;
                                    }
                                    setHindiLoadingJobId(jid);
                                    try {
                                      const res = await fetch("/api/monitor/translate-script", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ script: job.scriptPreview }),
                                      });
                                      const data = await res.json();
                                      if (!res.ok) {
                                        toast.error(data.error || "Translation failed");
                                      } else {
                                        setHindiScripts((prev) => ({ ...prev, [jid]: data.hindiScript }));
                                        setHindiOpenJobId(jid);
                                        toast.success("Hindi script ready!");
                                      }
                                    } catch (err: any) {
                                      toast.error(err.message || "Translation failed");
                                    } finally {
                                      setHindiLoadingJobId(null);
                                    }
                                  }}
                                  disabled={hindiLoadingJobId === item.dialogue_video_job_id}
                                  className="text-[11px] text-orange-600 hover:text-orange-800 flex items-center gap-1 font-medium disabled:opacity-50"
                                  title="Generate Hindi (Hinglish) version of the script"
                                >
                                  {hindiLoadingJobId === item.dialogue_video_job_id ? (
                                    <><Loader2 className="w-3 h-3 animate-spin" /> Translating...</>
                                  ) : hindiOpenJobId === item.dialogue_video_job_id && hindiScripts[item.dialogue_video_job_id!] ? (
                                    <><ChevronDown className="w-3 h-3" /> Hide Hindi</>
                                  ) : (
                                    <><ChevronRight className="w-3 h-3" /> Hindi script</>
                                  )}
                                </button>
                                {/* Original source toggle — shows the raw
                                    YouTube transcript / IG caption the
                                    dialogue was generated FROM. Lets the
                                    user verify the script captured the right
                                    facts before recording audio. */}
                                {item.raw_text && (
                                  <button
                                    onClick={() =>
                                      setOriginalOpenItemId(
                                        originalOpenItemId === item.id
                                          ? null
                                          : item.id
                                      )
                                    }
                                    className="text-[11px] text-amber-700 hover:text-amber-900 flex items-center gap-1 font-medium"
                                    title="Compare the generated dialogue against the original transcript/caption"
                                  >
                                    {originalOpenItemId === item.id ? (
                                      <>
                                        <ChevronDown className="w-3 h-3" /> Hide
                                        original
                                      </>
                                    ) : (
                                      <>
                                        <ChevronRight className="w-3 h-3" /> View
                                        original source
                                      </>
                                    )}
                                  </button>
                                )}
                                {item.source === "instagram" && item.url && (
                                  <button
                                    onClick={async () => {
                                      const toastId = toast.loading("Downloading HD reel...");
                                      try {
                                        const res = await fetch("/api/monitor/reel-download", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ url: item.url }),
                                        });
                                        if (!res.ok) {
                                          const d = await res.json().catch(() => ({ error: "Download failed" }));
                                          toast.error(d.error || "Download failed", { id: toastId });
                                          return;
                                        }
                                        const blob = await res.blob();
                                        const filename =
                                          res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ||
                                          "instagram-reel.mp4";
                                        const a = document.createElement("a");
                                        a.href = URL.createObjectURL(blob);
                                        a.download = filename;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        URL.revokeObjectURL(a.href);
                                        toast.success("Reel downloaded!", { id: toastId });
                                      } catch (err: any) {
                                        toast.error(err.message || "Download failed", { id: toastId });
                                      }
                                    }}
                                    className="text-[11px] text-pink-600 hover:text-pink-800 flex items-center gap-1 font-medium"
                                    title="Download the original reel in HD"
                                  >
                                    <Download className="w-3 h-3" /> Download HD
                                  </button>
                                )}
                              </div>
                            )}
                            {/* Original source panel — shows the raw_text
                                stored on the monitored item. For YouTube
                                this is the full transcript; for Instagram,
                                the post caption. Side-by-side compare with
                                the generated dialogue script above. */}
                            {originalOpenItemId === item.id && item.raw_text && (
                              <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-[10px] font-medium text-amber-800 flex items-center gap-1">
                                    📄 Original{" "}
                                    {item.source === "youtube"
                                      ? "transcript"
                                      : "caption"}
                                    <span className="text-[9px] text-amber-600 font-normal ml-1">
                                      ({item.raw_text.length.toLocaleString()}{" "}
                                      chars)
                                    </span>
                                  </p>
                                  <button
                                    onClick={() =>
                                      copyToClipboard(item.raw_text, "Original source")
                                    }
                                    className="text-[10px] text-amber-700 hover:text-amber-900 flex items-center gap-1"
                                  >
                                    <Copy className="w-3 h-3" /> Copy
                                  </button>
                                </div>
                                <pre className="whitespace-pre-wrap font-mono text-[10px] text-gray-800 bg-white border border-amber-100 rounded p-2 max-h-96 overflow-y-auto leading-relaxed">
                                  {item.raw_text}
                                </pre>
                              </div>
                            )}
                            {job?.error && (
                              <p className="text-xs text-red-600 mb-2">{job.error}</p>
                            )}
                            {status === "script_only" && (
                              <div className="mb-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded">
                                <p className="text-[11px] text-emerald-800 mb-2 leading-relaxed">
                                  Script is ready. Record/generate audio
                                  externally (any TTS or your own voice), then
                                  upload below — we'll mux it onto the
                                  Minecraft gameplay background and give you a
                                  vertical MP4 to post.
                                </p>
                                <p className="text-[10px] text-emerald-700 mb-2">
                                  Drop your gameplay clip at{" "}
                                  <code className="bg-white/60 px-1 rounded">
                                    public/backgrounds/minecraft.mp4
                                  </code>{" "}
                                  (any length — it loops). Accepted audio:
                                  mp3, wav, m4a, aac, ogg, webm.
                                </p>
                                <label
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border cursor-pointer transition-colors ${
                                    finalizingJobId ===
                                    item.dialogue_video_job_id
                                      ? "bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed"
                                      : "bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700"
                                  }`}
                                >
                                  {finalizingJobId ===
                                  item.dialogue_video_job_id ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      Rendering...
                                    </>
                                  ) : (
                                    <>
                                      <Film className="w-3 h-3" />
                                      Upload audio & render
                                    </>
                                  )}
                                  <input
                                    type="file"
                                    accept="audio/*"
                                    className="hidden"
                                    disabled={
                                      finalizingJobId ===
                                      item.dialogue_video_job_id
                                    }
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f && item.dialogue_video_job_id) {
                                        finalizeWithAudio(
                                          item.dialogue_video_job_id,
                                          f
                                        );
                                      }
                                      e.target.value = ""; // allow re-upload of same file
                                    }}
                                  />
                                </label>
                              </div>
                            )}
                            {job?.scriptPreview &&
                              (scriptOpenJobId === item.dialogue_video_job_id ||
                                status === "script_only") && (
                                <pre className="whitespace-pre-wrap font-mono rounded p-2 overflow-y-auto text-xs text-gray-800 bg-white border border-gray-200 max-h-96">
                                  {job.scriptPreview}
                                </pre>
                              )}
                            {hindiOpenJobId === item.dialogue_video_job_id &&
                              hindiScripts[item.dialogue_video_job_id!] && (
                                <div className="mb-2">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-[11px] font-medium text-orange-700">Hindi Script</p>
                                    <button
                                      onClick={() =>
                                        copyToClipboard(
                                          hindiScripts[item.dialogue_video_job_id!],
                                          "Hindi Script"
                                        )
                                      }
                                      className="text-[10px] text-gray-500 hover:text-gray-700 flex items-center gap-1"
                                    >
                                      <Copy className="w-3 h-3" /> Copy Hindi
                                    </button>
                                  </div>
                                  <pre className="whitespace-pre-wrap font-mono rounded p-2 overflow-y-auto text-xs text-gray-800 bg-orange-50 border border-orange-200 max-h-96">
                                    {hindiScripts[item.dialogue_video_job_id!]}
                                  </pre>
                                </div>
                              )}
                            {downloadUrl && status === "completed" && (
                              <a
                                href={downloadUrl}
                                download
                                className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                              >
                                <Download className="w-3 h-3" />
                                Download Video
                              </a>
                            )}

                            {status === "completed" &&
                              job?.timedLines &&
                              job.timedLines.length > 0 &&
                              (() => {
                                // Resolve real character names (Jon Snow / Daenerys / etc.)
                                // from the character set the video was generated with.
                                const csId =
                                  item.dialogue_video_character_set ||
                                  job.characterSetId ||
                                  "";
                                const cs = characterSets.find(
                                  (c) => c.id === csId
                                );
                                const aName = cs?.characterA.name || "Speaker A";
                                const bName = cs?.characterB.name || "Speaker B";
                                const formatTs = (sec: number) => {
                                  const m = Math.floor(sec / 60);
                                  const s = sec - m * 60;
                                  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
                                };
                                const quality = job.alignmentMatchQuality ?? 0;
                                const tsv = job.timedLines
                                  .map(
                                    (l) =>
                                      `${formatTs(l.start)}\t${formatTs(
                                        l.end
                                      )}\t${
                                        l.character === "A" ? aName : bName
                                      }\t${l.text}`
                                  )
                                  .join("\n");
                                return (
                                  <div className="mt-3 p-2.5 bg-white border border-indigo-200 rounded">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <p className="text-[11px] font-medium text-indigo-700 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        Per-line timestamps
                                        <span
                                          className={`ml-1 text-[10px] font-normal ${
                                            quality >= 0.7
                                              ? "text-green-600"
                                              : quality >= 0.4
                                              ? "text-amber-600"
                                              : "text-red-600"
                                          }`}
                                          title="% of script words confidently matched in the audio transcript"
                                        >
                                          {(quality * 100).toFixed(0)}% match
                                        </span>
                                      </p>
                                      <button
                                        onClick={() =>
                                          copyToClipboard(tsv, "Timestamps (TSV)")
                                        }
                                        className="text-[10px] text-gray-500 hover:text-gray-700 flex items-center gap-1"
                                      >
                                        <Copy className="w-3 h-3" /> Copy TSV
                                      </button>
                                    </div>
                                    <div className="max-h-56 overflow-y-auto">
                                      <table className="w-full text-[11px] font-mono">
                                        <thead className="text-[10px] text-gray-400 uppercase tracking-wider">
                                          <tr>
                                            <th className="text-left py-1 pr-2">
                                              Start
                                            </th>
                                            <th className="text-left py-1 pr-2">
                                              End
                                            </th>
                                            <th className="text-left py-1 pr-2">
                                              Speaker
                                            </th>
                                            <th className="text-left py-1">Line</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {job.timedLines.map((l) => (
                                            <tr
                                              key={l.index}
                                              className="border-t border-gray-100"
                                            >
                                              <td className="py-1 pr-2 text-gray-700">
                                                {formatTs(l.start)}
                                              </td>
                                              <td className="py-1 pr-2 text-gray-700">
                                                {formatTs(l.end)}
                                              </td>
                                              <td
                                                className={`py-1 pr-2 font-semibold ${
                                                  l.character === "A"
                                                    ? "text-blue-700"
                                                    : "text-rose-700"
                                                }`}
                                              >
                                                {l.character === "A"
                                                  ? aName
                                                  : bName}
                                              </td>
                                              <td className="py-1 text-gray-600 font-sans">
                                                {l.text}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                                      Use these timestamps in CapCut to drop
                                      the {aName} / {bName} cutout on screen
                                      while each line is spoken. Whisper
                                      typically aligns to ~100ms accuracy.
                                    </p>
                                  </div>
                                );
                              })()}
                          </div>
                        );
                      })()}

                    {/* Dialogue Video form (inline, toggled by the button) */}
                    {dialoguePanelId === item.id && (
                      <div className="mb-4 p-3 bg-indigo-50/50 border border-indigo-200 rounded-lg space-y-3">
                        <p className="section-title flex items-center gap-1 text-indigo-700">
                          <Users className="w-3 h-3" />
                          Configure Dialogue Video
                        </p>
                        <div>
                          <label className="text-xs text-gray-600 block mb-1">
                            Characters
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {characterSets.map((cs) => (
                              <button
                                key={cs.id}
                                onClick={() =>
                                  setDialogueForm((p) => ({
                                    ...p,
                                    characterSetId: cs.id,
                                  }))
                                }
                                className={`p-2 rounded-lg border text-left text-xs transition-all ${
                                  dialogueForm.characterSetId === cs.id
                                    ? "border-indigo-500 bg-white shadow-sm"
                                    : "border-gray-200 bg-white/50 hover:border-indigo-300"
                                }`}
                              >
                                <div className="font-semibold text-gray-900">
                                  {cs.theme}
                                </div>
                                <div className="text-[10px] text-gray-500">
                                  {cs.characterA.name} vs {cs.characterB.name}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-gray-400" />
                            <label className="text-xs text-gray-600">Duration:</label>
                            <select
                              value={dialogueForm.targetDuration}
                              onChange={(e) =>
                                setDialogueForm((p) => ({
                                  ...p,
                                  targetDuration: Number(e.target.value),
                                }))
                              }
                              className="text-xs bg-white border border-gray-200 rounded px-2 py-1"
                            >
                              <option value={30}>30s</option>
                              <option value={45}>45s</option>
                              <option value={60}>60s</option>
                              <option value={90}>90s</option>
                              <option value={120}>2m</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Film className="w-3 h-3 text-gray-400" />
                            <label className="text-xs text-gray-600">Background:</label>
                            <select
                              value={dialogueForm.backgroundVideoPath}
                              onChange={(e) =>
                                setDialogueForm((p) => ({
                                  ...p,
                                  backgroundVideoPath: e.target.value,
                                }))
                              }
                              className="text-xs bg-white border border-gray-200 rounded px-2 py-1"
                              disabled={backgrounds.length === 0}
                            >
                              {backgrounds.length === 0 ? (
                                <option value="">No backgrounds</option>
                              ) : (
                                backgrounds.map((b) => (
                                  <option key={b.path} value={b.path}>
                                    {b.name}
                                  </option>
                                ))
                              )}
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startDialogueVideo(item.id)}
                            disabled={
                              dialogueStartingId === item.id ||
                              !dialogueForm.characterSetId
                            }
                            className="px-3 py-1.5 text-xs flex items-center gap-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {dialogueStartingId === item.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Play className="w-3 h-3" />
                            )}
                            Start Pipeline
                          </button>
                          <button
                            onClick={() => setDialoguePanelId(null)}
                            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                          <p className="text-[10px] text-gray-400 ml-auto">
                            Script → ElevenLabs voices → Remotion render · ~2–5 min
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      {/* Left: Summary + Insights */}
                      <div className="space-y-3">
                        {item.summary && (
                          <div>
                            <p className="section-title">Summary</p>
                            <p className="text-sm text-gray-700">{item.summary}</p>
                          </div>
                        )}

                        {item.key_insights && item.key_insights.length > 0 && (
                          <div>
                            <p className="section-title flex items-center gap-1">
                              <Lightbulb className="w-3 h-3" />
                              Key Insights
                            </p>
                            <ul className="space-y-1">
                              {item.key_insights.map((insight, i) => (
                                <li
                                  key={i}
                                  className="text-xs text-gray-600 flex items-start gap-1.5"
                                >
                                  <span className="text-blue-400 mt-0.5">-</span>
                                  {insight}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {item.content_ideas && item.content_ideas.length > 0 && (
                          <div>
                            <p className="section-title flex items-center gap-1">
                              <Lightbulb className="w-3 h-3 text-amber-500" />
                              Content Ideas
                            </p>
                            <ul className="space-y-1">
                              {item.content_ideas.map((idea, i) => (
                                <li
                                  key={i}
                                  className="text-xs text-gray-600 bg-amber-50 rounded px-2 py-1"
                                >
                                  {idea}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Right: Tools + Actions */}
                      <div className="space-y-3">
                        {item.tools_mentioned && item.tools_mentioned.length > 0 && (
                          <div>
                            <p className="section-title flex items-center gap-1">
                              <Wrench className="w-3 h-3" />
                              Tools Mentioned
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {item.tools_mentioned.map((tool, i) => (
                                <span
                                  key={i}
                                  className="badge bg-purple-50 text-purple-600"
                                >
                                  {tool}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {item.topics && item.topics.length > 0 && (
                          <div>
                            <p className="section-title flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              Topics
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {item.topics.map((topic, i) => (
                                <span
                                  key={i}
                                  className="badge bg-blue-50 text-blue-600"
                                >
                                  {topic}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {item.content_type && (
                          <div>
                            <p className="section-title">Content Type</p>
                            <span className="badge bg-gray-100 text-gray-600">
                              {item.content_type}
                            </span>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="pt-2 border-t border-gray-200">
                          <p className="section-title">Actions</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-outline px-3 py-1.5 text-xs flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Open Original
                            </a>
                            <button
                              onClick={() => generateScript(item.id)}
                              disabled={generatingId === item.id}
                              className="px-3 py-1.5 text-xs flex items-center gap-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                            >
                              {generatingId === item.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Sparkles className="w-3 h-3" />
                              )}
                              {item.generated_script ? "Regenerate Script" : "Generate Script"}
                            </button>
                            <button
                              onClick={() =>
                                setDialoguePanelId(
                                  dialoguePanelId === item.id ? null : item.id
                                )
                              }
                              className="px-3 py-1.5 text-xs flex items-center gap-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                            >
                              <Film className="w-3 h-3" />
                              {item.dialogue_video_job_id
                                ? "New Dialogue Video"
                                : "Generate Dialogue Video"}
                            </button>
                            {item.status !== "reviewed" && (
                              <button
                                onClick={() => updateStatus(item.id, "reviewed")}
                                className="px-3 py-1.5 text-xs flex items-center gap-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                              >
                                <Eye className="w-3 h-3" />
                                Mark Reviewed
                              </button>
                            )}
                            {item.status !== "used" && (
                              <button
                                onClick={() => updateStatus(item.id, "used")}
                                className="px-3 py-1.5 text-xs flex items-center gap-1 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors"
                              >
                                <CheckCircle className="w-3 h-3" />
                                Mark Used
                              </button>
                            )}
                            {item.status !== "dismissed" && (
                              <button
                                onClick={() => updateStatus(item.id, "dismissed")}
                                className="px-3 py-1.5 text-xs flex items-center gap-1 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 transition-colors"
                              >
                                <X className="w-3 h-3" />
                                Dismiss
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
