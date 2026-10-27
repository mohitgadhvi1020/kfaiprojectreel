"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Play, Rocket, CheckCircle, AlertCircle, Loader2, RefreshCw, Clock,
  Film, Sparkles, DollarSign, Tag, Users, Twitter, ExternalLink,
  ChevronDown, ChevronRight, Eye, Zap, Flame, Plus, X,
  Star, Search, Square, CheckSquare, Linkedin,
} from "lucide-react";
import toast from "react-hot-toast";
import { format, formatDistanceToNow } from "date-fns";

interface Startup {
  id: string;
  name: string;
  description: string;
  funding_amount: string;
  funding_round: string;
  investor: string;
  tech: string;
  builder_value: string;
  scale: string;
  is_used: boolean;
  reel_created: boolean;
  run_id: string | null;
  discovered_at: string;
  content_status: string;
  has_content: boolean;
  content_count: number;
  quality_score: string | null;
}

interface XTip {
  id: string;
  author: string;
  post_summary: string;
  practical_takeaway: string;
  reel_potential: string;
  post_url: string;
  is_used: boolean;
  run_id: string | null;
  discovered_at: string;
  has_content: boolean;
  content_count: number;
  quality_score: string | null;
}

interface Run {
  id: string;
  status: string;
  created_at: string;
  startups_found: number;
  x_tips_found: number;
  trending_found: number;
}

interface DashboardData {
  startups: Startup[];
  xTips: XTip[];
  runs: Run[];
  stats: {
    total_startups: number;
    total_x_tips: number;
    content_ready: number;
    reels_created: number;
    pending: number;
    in_progress: number;
  };
}

type SourceTab = "startups" | "x_tips";
type FilterType =
  | "all"
  | "pending"
  | "in_progress"
  | "content_ready"
  | "reel_done"
  | "priority"
  | "selected";

const PRIORITY_STORAGE_KEY = "dashboard.priorityIds";
const SELECTED_STORAGE_KEY = "dashboard.selectedIds";

function loadIdSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function saveIdSet(key: string, set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    /* localStorage full or disabled — silently ignore */
  }
}

const contentStatusConfig: Record<string, { color: string; bg: string; label: string; showSpinner?: boolean }> = {
  none: { color: "text-gray-500", bg: "bg-gray-50", label: "No Content" },
  researching: { color: "text-blue-600", bg: "bg-blue-50", label: "Deep Research...", showSpinner: true },
  generating: { color: "text-violet-600", bg: "bg-violet-50", label: "Researching...", showSpinner: true },
  hooks: { color: "text-indigo-600", bg: "bg-indigo-50", label: "Creating Hooks...", showSpinner: true },
  scripting: { color: "text-pink-600", bg: "bg-pink-50", label: "Writing Scripts...", showSpinner: true },
  refining: { color: "text-orange-600", bg: "bg-orange-50", label: "Refining...", showSpinner: true },
  completed: { color: "text-green-600", bg: "bg-green-50", label: "Content Ready" },
  failed: { color: "text-red-600", bg: "bg-red-50", label: "Failed" },
};

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [linkedinId, setLinkedinId] = useState<string | null>(null);
  const [sourceTab, setSourceTab] = useState<SourceTab>("startups");
  const [filter, setFilter] = useState<FilterType>("all");
  const [discoveriesOpen, setDiscoveriesOpen] = useState(false);
  const [motivation, setMotivation] = useState<{ message: string; subtext: string } | null>(null);
  const [motivationLoading, setMotivationLoading] = useState(true);
  const [motivationRefreshing, setMotivationRefreshing] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualHint, setManualHint] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);

  // Search + workflow flags. Priority and selection are stored in localStorage
  // (no DB column needed — these are personal workflow markers per browser).
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityIds, setPriorityIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Hydrate from localStorage once the component mounts (avoids SSR mismatch).
  useEffect(() => {
    setPriorityIds(loadIdSet(PRIORITY_STORAGE_KEY));
    setSelectedIds(loadIdSet(SELECTED_STORAGE_KEY));
  }, []);

  const togglePriority = useCallback((id: string) => {
    setPriorityIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveIdSet(PRIORITY_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveIdSet(SELECTED_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    saveIdSet(SELECTED_STORAGE_KEY, new Set());
  }, []);

  const submitManualStartup = async () => {
    const name = manualName.trim();
    if (!name) { toast.error("Enter a startup name first"); return; }
    setManualSubmitting(true);
    try {
      const res = await fetch("/api/startups/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, hint: manualHint.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || "Failed to add startup"); return; }
      toast.success(`Added ${name}. Look in the Startups list.`);
      setManualName("");
      setManualHint("");
      setManualOpen(false);
      fetchDashboard();
    } catch {
      toast.error("Failed to add startup");
    } finally {
      setManualSubmitting(false);
    }
  };

  const fetchMotivation = useCallback(async (force = false) => {
    try {
      if (force) setMotivationRefreshing(true);
      const res = await fetch(`/api/daily-motivation${force ? "?force=1" : ""}`);
      if (res.ok) {
        const d = await res.json();
        setMotivation({ message: d.message, subtext: d.subtext });
      }
    } catch {} finally {
      setMotivationLoading(false);
      setMotivationRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchMotivation(); }, [fetchMotivation]);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const i = setInterval(fetchDashboard, 4000);
    return () => clearInterval(i);
  }, [fetchDashboard]);

  const triggerRun = async () => {
    setTriggering(true);
    try {
      const res = await fetch("/api/runs", { method: "POST" });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error); return; }
      toast.success("Discovery started! New startups & X tips will appear shortly.");
      fetchDashboard();
    } catch { toast.error("Failed to trigger discovery."); }
    finally { setTriggering(false); }
  };

  const generateStartupContent = async (startup: Startup) => {
    if (!startup.run_id) { toast.error("No run associated with this startup."); return; }
    setGeneratingId(startup.id);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: startup.run_id, startup_id: startup.id, type: "startup" }),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error || "Generation failed"); return; }
      toast.success(`Content ready for ${startup.name}! Quality: ${result.qualityScore}/10`);
      fetchDashboard();
    } catch { toast.error("Failed to generate content"); }
    finally { setGeneratingId(null); }
  };

  // Generate a LinkedIn post directly from a Content Pipeline card. Reuses existing
  // research (or runs it if none), then jumps to the startup's LinkedIn tab.
  const generateLinkedInFor = async (startup: Startup) => {
    setLinkedinId(startup.id);
    const toastId = toast.loading(`Writing LinkedIn post for ${startup.name}...`);
    try {
      const res = await fetch(`/api/startups/${startup.id}/linkedin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed");
      const v = result.verification;
      toast.success(
        v?.verified ? "LinkedIn post ready — fact-check passed ✓"
          : v?.flagged?.length ? `LinkedIn ready — fact-check adjusted ${v.flagged.length} claim(s)`
          : "LinkedIn post ready",
        { id: toastId }
      );
      router.push(`/startups/${startup.id}?tab=linkedin_post`);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate LinkedIn post", { id: toastId });
    } finally {
      setLinkedinId(null);
    }
  };

  const generateXTipContent = async (tip: XTip) => {
    if (!tip.run_id) { toast.error("No run associated with this X tip."); return; }
    setGeneratingId(tip.id);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: tip.run_id, x_tip_id: tip.id, type: "x_tip" }),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error || "Generation failed"); return; }
      toast.success(`Content ready! Quality: ${result.qualityScore}/10`);
      fetchDashboard();
    } catch { toast.error("Failed to generate content"); }
    finally { setGeneratingId(null); }
  };

  const toggleReelCreated = async (startup: Startup) => {
    try {
      const res = await fetch("/api/startups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: startup.id, reel_created: !startup.reel_created }),
      });
      if (!res.ok) throw new Error();
      toast.success(!startup.reel_created ? "Marked as reel created!" : "Unmarked reel");
      fetchDashboard();
    } catch { toast.error("Failed to update"); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="spinner" /></div>;

  const stats = data?.stats || { total_startups: 0, total_x_tips: 0, content_ready: 0, reels_created: 0, pending: 0, in_progress: 0 };
  const startups = data?.startups || [];
  const xTips = data?.xTips || [];
  const runs = data?.runs || [];

  const isActiveStatus = (s: string) => ["researching", "generating", "hooks", "scripting", "refining"].includes(s);
  const formatAuthor = (author: string) => author.startsWith("@") ? author : `@${author}`;

  const q = searchQuery.trim().toLowerCase();
  const matchesSearch = (s: Startup): boolean => {
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.description || "").toLowerCase().includes(q) ||
      (s.tech || "").toLowerCase().includes(q) ||
      (s.investor || "").toLowerCase().includes(q) ||
      (s.funding_round || "").toLowerCase().includes(q)
    );
  };

  const filteredStartups = startups.filter((s) => {
    if (!matchesSearch(s)) return false;
    switch (filter) {
      case "pending": return s.content_status === "none" && !s.has_content && !s.reel_created;
      case "in_progress": return isActiveStatus(s.content_status);
      case "content_ready": return (s.content_status === "completed" || s.has_content) && !s.reel_created;
      case "reel_done": return s.reel_created;
      case "priority": return priorityIds.has(s.id);
      case "selected": return selectedIds.has(s.id);
      default: return true;
    }
  });

  // Keep priority items at the top regardless of filter (unless we're already
  // filtering by priority — in which case ordering doesn't matter).
  filteredStartups.sort((a, b) => {
    const aP = priorityIds.has(a.id) ? 1 : 0;
    const bP = priorityIds.has(b.id) ? 1 : 0;
    return bP - aP;
  });

  // Bulk-generate content for everything in the selection.
  const generateAllSelected = async () => {
    const targets = startups.filter(
      (s) =>
        selectedIds.has(s.id) &&
        s.content_status !== "completed" &&
        !s.has_content &&
        !isActiveStatus(s.content_status)
    );
    if (targets.length === 0) {
      toast("Nothing in selection that's ready to generate", { icon: "ℹ️" });
      return;
    }
    toast.success(`Queuing ${targets.length} startup${targets.length === 1 ? "" : "s"}…`);
    for (const s of targets) {
      // Fire-and-forget; each call kicks off async work server-side. No await
      // chain so we don't block the UI on N sequential generation requests.
      generateStartupContent(s);
    }
  };

  const filteredXTips = xTips.filter((t) => {
    switch (filter) {
      case "pending": return !t.has_content && !t.is_used;
      case "content_ready": return t.has_content || t.is_used;
      case "in_progress": return false;
      case "reel_done": return false;
      default: return true;
    }
  });

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Content Pipeline</h1>
          <p className="text-sm text-gray-400 mt-0.5">Discover startups & X tips &middot; Generate content for each one</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setManualOpen(true)}
            className="px-4 py-2.5 flex items-center gap-2 text-sm rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 text-gray-700 transition-colors"
            title="Manually add a startup by name"
          >
            <Plus className="w-4 h-4" />Add Startup
          </button>
          <button onClick={triggerRun} disabled={triggering}
            className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm disabled:opacity-50">
            {triggering ? <><Loader2 className="w-4 h-4 animate-spin" />Discovering...</> : <><Play className="w-4 h-4" />Run Discovery</>}
          </button>
        </div>
      </div>

      {/* Manual add-startup modal */}
      {manualOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !manualSubmitting && setManualOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => !manualSubmitting && setManualOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"
              disabled={manualSubmitting}
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <Rocket className="w-4 h-4 text-indigo-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Add Startup by Name</h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              We'll look up the funding + tech info via Perplexity and add it to your pipeline.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Startup name *</label>
                <input
                  type="text"
                  autoFocus
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !manualSubmitting) submitManualStartup();
                  }}
                  placeholder="e.g. Simile, Hypatos, PlayerZero"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50"
                  disabled={manualSubmitting}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Context <span className="text-gray-400">(optional — helps disambiguate)</span>
                </label>
                <input
                  type="text"
                  value={manualHint}
                  onChange={(e) => setManualHint(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !manualSubmitting) submitManualStartup();
                  }}
                  placeholder="e.g. they raised from YC W25, AI agents for healthcare"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50"
                  disabled={manualSubmitting}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => setManualOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                disabled={manualSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={submitManualStartup}
                disabled={manualSubmitting || !manualName.trim()}
                className="btn-primary px-5 py-2 flex items-center gap-2 text-sm disabled:opacity-50"
              >
                {manualSubmitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Looking up...</>
                ) : (
                  <><Plus className="w-4 h-4" />Add & Research</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Daily Motivation — one Gemini call per day, cached on disk */}
      <div className="mb-6 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 p-4 flex items-start gap-3 group">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center shadow-sm flex-shrink-0">
          <Flame className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700">Today's nudge</span>
            <button
              onClick={() => fetchMotivation(true)}
              disabled={motivationRefreshing}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-700 disabled:opacity-50"
              title="Regenerate today's motivation"
            >
              <RefreshCw className={`w-3 h-3 ${motivationRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
          {motivationLoading ? (
            <div className="h-5 w-64 bg-amber-100 rounded animate-pulse" />
          ) : motivation ? (
            <>
              <p className="text-sm font-semibold text-gray-900 leading-snug">{motivation.message}</p>
              {motivation.subtext && (
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{motivation.subtext}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">50k AI-niche followers unlocks $5-10k/mo in sponsor deals. One reel closer today.</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: "Startups", value: stats.total_startups, icon: Rocket, color: "text-blue-600 bg-blue-50" },
          { label: "X Tips", value: stats.total_x_tips, icon: Twitter, color: "text-sky-600 bg-sky-50" },
          { label: "Pending", value: stats.pending, icon: Clock, color: "text-amber-600 bg-amber-50" },
          { label: "Content Ready", value: stats.content_ready, icon: Sparkles, color: "text-green-600 bg-green-50" },
          { label: "Reels Created", value: stats.reels_created, icon: Film, color: "text-pink-600 bg-pink-50" },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className={`w-7 h-7 rounded-lg ${s.color} flex items-center justify-center`}>
                <s.icon className="w-3.5 h-3.5" />
              </div>
              <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">{s.label}</span>
            </div>
            <p className="text-xl font-semibold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Source Tabs: Startups / X Tips */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-6 border-b border-gray-200">
          <button onClick={() => setSourceTab("startups")} className={sourceTab === "startups" ? "tab-active" : "tab-inactive"}>
            <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Startups ({startups.length})</span>
          </button>
          <button onClick={() => setSourceTab("x_tips")} className={sourceTab === "x_tips" ? "tab-active" : "tab-inactive"}>
            <span className="flex items-center gap-1.5"><Twitter className="w-3.5 h-3.5" />X Tips ({xTips.length})</span>
          </button>
        </div>
      </div>

      {/* Search + Filter Pills (startups only — keeps X-Tips area unchanged) */}
      {sourceTab === "startups" && (
        <div className="mb-5 flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, tech, investor, round…"
                className="w-full pl-9 pr-9 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                  aria-label="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-xl">
              {([
                { key: "all" as FilterType, label: "All" },
                { key: "pending" as FilterType, label: "Pending" },
                { key: "in_progress" as FilterType, label: "In Progress" },
                { key: "content_ready" as FilterType, label: "Content Ready" },
                { key: "reel_done" as FilterType, label: "Reel Done" },
                { key: "priority" as FilterType, label: `Priority${priorityIds.size ? ` (${priorityIds.size})` : ""}` },
                { key: "selected" as FilterType, label: `Selected${selectedIds.size ? ` (${selectedIds.size})` : ""}` },
              ]).map((f) => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filter === f.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk action bar — visible only when at least one row is selected */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200">
              <CheckSquare className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-blue-900">
                <span className="font-semibold">{selectedIds.size}</span> selected for content creation
              </span>
              <div className="flex-1" />
              <button
                onClick={generateAllSelected}
                className="btn-primary px-3.5 py-1.5 text-xs flex items-center gap-1.5"
              >
                <Sparkles className="w-3 h-3" />
                Generate Content for Selection
              </button>
              <button
                onClick={clearSelection}
                className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* X-Tips uses the original simpler filter row */}
      {sourceTab === "x_tips" && (
        <div className="flex items-center gap-1 mb-5 bg-gray-50 p-1 rounded-xl w-fit">
          {([
            { key: "all" as FilterType, label: "All" },
            { key: "pending" as FilterType, label: "Pending" },
            { key: "content_ready" as FilterType, label: "Content Ready" },
          ]).map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === f.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* ===== STARTUPS TAB ===== */}
      {sourceTab === "startups" && (
        <>
          {filteredStartups.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center mb-8">
              <Rocket className="w-10 h-10 text-gray-300 mb-3" />
              {startups.length === 0 ? (
                <>
                  <p className="text-sm text-gray-400 mb-4">No startups discovered yet. Run your first discovery!</p>
                  <button onClick={triggerRun} disabled={triggering}
                    className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
                    <Play className="w-3.5 h-3.5" />Start First Discovery
                  </button>
                </>
              ) : (
                <p className="text-sm text-gray-400">No startups match this filter.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 mb-8">
              {filteredStartups.map((s) => {
                const statusCfg = contentStatusConfig[s.content_status] || contentStatusConfig.none;
                const isActive = isActiveStatus(s.content_status);
                const hasFunding = s.funding_amount && s.funding_amount !== "Unknown";
                const isGenerating = generatingId === s.id || isActive;
                const canGenerate = !isGenerating && s.content_status !== "completed" && !s.has_content;
                const canRegenerate = !isGenerating && (s.content_status === "completed" || s.has_content || s.content_status === "failed");

                return (
                  <div key={s.id}
                    onClick={() => router.push(`/startups/${s.id}`)}
                    className={`card p-5 transition-all hover:shadow-sm cursor-pointer ${
                      isActive ? "border-blue-200 ring-1 ring-blue-100" :
                      s.reel_created ? "border-green-200 bg-green-50/20" :
                      s.content_status === "completed" || s.has_content ? "border-green-200" : ""
                    }`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleSelected(s.id); }}
                            className={`p-0.5 rounded transition-colors ${
                              selectedIds.has(s.id)
                                ? "text-blue-600 hover:text-blue-700"
                                : "text-gray-300 hover:text-gray-500"
                            }`}
                            title={selectedIds.has(s.id) ? "Deselect" : "Select for content creation"}
                            aria-label="Toggle selection"
                          >
                            {selectedIds.has(s.id)
                              ? <CheckSquare className="w-4 h-4" />
                              : <Square className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); togglePriority(s.id); }}
                            className={`p-0.5 rounded transition-colors ${
                              priorityIds.has(s.id)
                                ? "text-amber-500 hover:text-amber-600"
                                : "text-gray-300 hover:text-amber-400"
                            }`}
                            title={priorityIds.has(s.id) ? "Unmark priority" : "Mark as priority"}
                            aria-label="Toggle priority"
                          >
                            <Star
                              className="w-4 h-4"
                              fill={priorityIds.has(s.id) ? "currentColor" : "none"}
                            />
                          </button>
                          <h3 className="text-sm font-semibold text-gray-900">{s.name}</h3>
                          {hasFunding && (
                            <span className="badge bg-amber-100 text-amber-700 border border-amber-200">
                              <DollarSign className="w-2.5 h-2.5" />{s.funding_amount}
                            </span>
                          )}
                          <span className="badge bg-gray-100 text-gray-600">{s.funding_round}</span>
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2">{s.description}</p>
                      </div>
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap ml-3 ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusCfg.showSpinner && <Loader2 className="w-3 h-3 animate-spin" />}
                        {s.content_status === "completed" && <CheckCircle className="w-3 h-3" />}
                        {s.content_status === "failed" && <AlertCircle className="w-3 h-3" />}
                        {s.reel_created && <Film className="w-3 h-3 text-green-600" />}
                        {s.reel_created ? "Reel Done" : statusCfg.label}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-gray-400 mb-3">
                      {s.tech && s.tech !== "Unknown" && <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{s.tech}</span>}
                      {s.investor && s.investor !== "Unknown" && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{s.investor}</span>}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />{formatDistanceToNow(new Date(s.discovered_at), { addSuffix: true })}
                      </span>
                    </div>

                    {s.quality_score && (
                      <div className="flex items-center gap-1.5 mb-3">
                        <span className="badge bg-green-50 text-green-600"><CheckCircle className="w-2.5 h-2.5" />Quality: {s.quality_score}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      {canGenerate && (
                        <button onClick={() => generateStartupContent(s)}
                          className="btn-primary px-3 py-1.5 text-xs flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3" />Generate Content
                        </button>
                      )}
                      {canRegenerate && (
                        <button onClick={() => generateStartupContent(s)}
                          className="btn-outline px-3 py-1.5 text-xs flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3" />Regenerate
                        </button>
                      )}
                      {isGenerating && (
                        <span className="text-xs text-blue-600 flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin" />Generating...
                        </span>
                      )}
                      {(s.content_status === "completed" || s.has_content) && (
                        <button onClick={() => router.push(`/startups/${s.id}`)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors flex items-center gap-1.5">
                          <Eye className="w-3 h-3" />View Content
                        </button>
                      )}
                      {!isGenerating && (
                        <button onClick={() => generateLinkedInFor(s)} disabled={linkedinId === s.id}
                          title="Generate a LinkedIn post for this startup"
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[#0a66c2] hover:bg-[#0a5aab] border border-[#0a66c2] disabled:opacity-50 transition-colors flex items-center gap-1.5">
                          {linkedinId === s.id
                            ? <><Loader2 className="w-3 h-3 animate-spin" />LinkedIn...</>
                            : <><Linkedin className="w-3 h-3" />LinkedIn</>}
                        </button>
                      )}
                      <div className="flex-1" />
                      {(s.content_status === "completed" || s.has_content) && (
                        <button onClick={() => toggleReelCreated(s)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                            s.reel_created
                              ? "bg-green-50 text-green-700 border border-green-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                              : "bg-white text-gray-600 border border-gray-200 hover:border-green-400 hover:text-green-700 hover:bg-green-50"
                          }`}>
                          {s.reel_created ? <><CheckCircle className="w-3 h-3" />Reel Done</> : <><Film className="w-3 h-3" />Mark Reel Done</>}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ===== X TIPS TAB ===== */}
      {sourceTab === "x_tips" && (
        <>
          {filteredXTips.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center mb-8">
              <Twitter className="w-10 h-10 text-gray-300 mb-3" />
              {xTips.length === 0 ? (
                <>
                  <p className="text-sm text-gray-400 mb-4">No X tips discovered yet. Run a discovery to find builder tips!</p>
                  <button onClick={triggerRun} disabled={triggering}
                    className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
                    <Play className="w-3.5 h-3.5" />Start Discovery
                  </button>
                </>
              ) : (
                <p className="text-sm text-gray-400">No X tips match this filter.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 mb-8">
              {filteredXTips.map((tip) => {
                const isGenerating = generatingId === tip.id;
                const hasContent = tip.has_content || tip.is_used;

                return (
                  <div key={tip.id}
                    onClick={() => { if (tip.run_id) router.push(`/runs/${tip.run_id}`); }}
                    className={`card p-5 transition-all hover:shadow-sm cursor-pointer ${
                      hasContent ? "border-green-200" : ""
                    }`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <div className="w-6 h-6 rounded-full bg-sky-100 flex items-center justify-center">
                            <Twitter className="w-3 h-3 text-sky-600" />
                          </div>
                          <h3 className="text-sm font-semibold text-gray-900">{formatAuthor(tip.author)}</h3>
                          <span className={`badge ${
                            tip.reel_potential?.toLowerCase().includes("high") ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
                          }`}>{tip.reel_potential}</span>
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2 mb-1.5">{tip.post_summary}</p>
                        {tip.practical_takeaway && (
                          <p className="text-xs text-blue-600 line-clamp-1">Takeaway: {tip.practical_takeaway}</p>
                        )}
                      </div>
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap ml-3 ${
                        hasContent ? "bg-green-50 text-green-600" : "bg-gray-50 text-gray-500"
                      }`}>
                        {hasContent ? <><CheckCircle className="w-3 h-3" />Content Ready</> : "No Content"}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-gray-400 mb-3">
                      {tip.post_url && (
                        <a href={tip.post_url} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                          <ExternalLink className="w-3 h-3" />View original post
                        </a>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />{formatDistanceToNow(new Date(tip.discovered_at), { addSuffix: true })}
                      </span>
                    </div>

                    {tip.quality_score && (
                      <div className="flex items-center gap-1.5 mb-3">
                        <span className="badge bg-green-50 text-green-600"><CheckCircle className="w-2.5 h-2.5" />Quality: {tip.quality_score}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      {!hasContent && !isGenerating && (
                        <button onClick={() => generateXTipContent(tip)}
                          className="btn-primary px-3 py-1.5 text-xs flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3" />Generate Content
                        </button>
                      )}
                      {hasContent && !isGenerating && (
                        <button onClick={() => generateXTipContent(tip)}
                          className="btn-outline px-3 py-1.5 text-xs flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3" />Regenerate
                        </button>
                      )}
                      {isGenerating && (
                        <span className="text-xs text-blue-600 flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin" />Generating...
                        </span>
                      )}
                      {hasContent && tip.run_id && (
                        <button onClick={() => router.push(`/runs/${tip.run_id}`)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors flex items-center gap-1.5">
                          <Eye className="w-3 h-3" />View Content
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Recent Discoveries (collapsible) */}
      <div className="card overflow-hidden">
        <button onClick={() => setDiscoveriesOpen(!discoveriesOpen)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2.5">
            <Rocket className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Recent Discoveries</span>
            <span className="text-xs text-gray-400">{runs.length} runs</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${discoveriesOpen ? "rotate-180" : ""}`} />
        </button>
        {discoveriesOpen && (
          <div className="border-t border-gray-100 divide-y divide-gray-50">
            {runs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No discoveries yet.</p>
            ) : runs.map((run) => {
              const isRunActive = run.status === "researching";
              return (
                <div key={run.id} onClick={() => router.push(`/runs/${run.id}`)}
                  className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`badge ${
                      isRunActive ? "bg-blue-50 text-blue-600" :
                      run.status === "ready" || run.status === "completed" ? "bg-green-50 text-green-600" :
                      "bg-red-50 text-red-600"
                    }`}>
                      {isRunActive && <Loader2 className="w-3 h-3 animate-spin" />}
                      {(run.status === "ready" || run.status === "completed") && <CheckCircle className="w-3 h-3" />}
                      {run.status === "failed" && <AlertCircle className="w-3 h-3" />}
                      {isRunActive ? "Discovering" : run.status === "ready" || run.status === "completed" ? "Done" : "Failed"}
                    </span>
                    <span className="text-xs text-gray-500">{format(new Date(run.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{run.startups_found || 0} startups</span>
                    <span>{run.x_tips_found || 0} tips</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
