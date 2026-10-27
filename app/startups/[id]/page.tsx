"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, CheckCircle, AlertCircle, Sparkles,
  Copy, Check, Film, LayoutGrid, MessageSquare,
  ChevronDown, RefreshCw, DollarSign, Tag, Users, Zap, Clock, ExternalLink,
  Send, Pencil, GraduationCap, ChevronUp, Linkedin,
} from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";

interface Startup {
  id: string; name: string; description: string; funding_amount: string;
  funding_round: string; investor: string; tech: string; builder_value: string;
  scale: string; is_used: boolean; reel_created: boolean; run_id: string | null;
  content_status: string; website?: string;
  hooks_cache?: any; // 10 hooks waiting for user to pick one (stage-1 output)
  layman_explanation?: string | null;
  layman_generated_at?: string | null;
}
interface Content {
  id: string; content_type: string; content: string; hooks: any;
  selected_hook: any; quality_score: string; reviewer_notes: string;
  is_refined?: boolean; tag_targets?: any;
}
interface StartupData {
  startup: Startup;
  content: Content[];
  research: any;
}

const statusLabels: Record<string, string> = {
  none: "No content generated yet",
  researching: "Running deep research (5 parallel streams)...",
  generating: "Researching startup details...",
  hooks: "Generating 10 hook options...",
  hooks_ready: "Pick a hook to build the script",
  scripting: "Writing Reel + Carousel + Caption...",
  refining: "Refinement pass...",
  completed: "Content package ready",
  failed: "Generation failed - try again",
};

export default function StartupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const startupId = params.id as string;

  const [data, setData] = useState<StartupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeContentTab, setActiveContentTab] = useState("reel_script");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hooksOpen, setHooksOpen] = useState(false);
  const [hookRegenerating, setHookRegenerating] = useState(false);
  const [revisionText, setRevisionText] = useState("");
  const [revising, setRevising] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [quickPreview, setQuickPreview] = useState<{ content: string; citations: { title?: string; url: string }[] } | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explainOpen, setExplainOpen] = useState(true);
  const [linkedinGenerating, setLinkedinGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/startups/${startupId}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch { toast.error("Failed to load startup"); }
    finally { setLoading(false); }
  }, [startupId]);

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 4000);
    return () => clearInterval(i);
  }, [fetchData]);

  // Open the sub-tab requested via ?tab=... (e.g. the pipeline's "LinkedIn" button).
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab) setActiveContentTab(tab);
  }, []);

  const generateContent = async () => {
    if (!data?.startup.run_id) { toast.error("No run associated with this startup."); return; }
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: data.startup.run_id, startup_id: startupId, type: "startup" }),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error || "Generation failed"); return; }
      toast.success(`Content ready! Quality: ${result.qualityScore}/10`);
      fetchData();
    } catch { toast.error("Failed to generate content"); }
    finally { setGenerating(false); }
  };

  // Generate / regenerate the Sorai Tech LinkedIn post. Reuses existing research
  // (or runs it if none) and anchors on the currently selected hook when present.
  const generateLinkedIn = async (hook?: any) => {
    setLinkedinGenerating(true);
    const toastId = toast.loading("Writing LinkedIn post (Sorai Tech)...");
    try {
      const res = await fetch(`/api/startups/${startupId}/linkedin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected_hook: hook || null }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed");
      const v = result.verification;
      toast.success(
        v?.verified ? "LinkedIn post ready — fact-check passed ✓"
          : v?.flagged?.length ? `LinkedIn post ready — fact-check adjusted ${v.flagged.length} claim(s)`
          : "LinkedIn post ready",
        { id: toastId }
      );
      setActiveContentTab("linkedin_post");
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to generate LinkedIn post", { id: toastId });
    } finally {
      setLinkedinGenerating(false);
    }
  };

  const explainInSimpleTerms = async () => {
    if (!data) return;
    setExplaining(true);
    const toastId = toast.loading("Generating plain-English explainer with Gemini...");
    try {
      const res = await fetch(`/api/startups/${startupId}/explain`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed");
      toast.success("Learn mode ready", { id: toastId });
      setExplainOpen(true);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to generate explainer", { id: toastId });
    } finally {
      setExplaining(false);
    }
  };

  const toggleReelCreated = async () => {
    if (!data) return;
    try {
      const res = await fetch("/api/startups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: startupId, reel_created: !data.startup.reel_created }),
      });
      if (!res.ok) throw new Error();
      toast.success(!data.startup.reel_created ? "Marked as reel created!" : "Unmarked reel");
      fetchData();
    } catch { toast.error("Failed to update"); }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const fetchQuickPreview = async () => {
    if (quickLoading) return;
    setQuickLoading(true);
    const toastId = toast.loading("Running quick preview (~15s)...");
    try {
      const res = await fetch("/api/quick-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startup_id: startupId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Quick preview failed");
      setQuickPreview({ content: result.content, citations: result.citations || [] });
      toast.success("Preview ready!", { id: toastId });
    } catch (e: any) {
      toast.error(e.message || "Failed to load preview", { id: toastId });
    } finally {
      setQuickLoading(false);
    }
  };

  const copyCleanSpeakingScript = async (contentId: string) => {
    if (cleaning) return;
    setCleaning(true);
    const toastId = toast.loading("Polishing script for camera...");
    try {
      const res = await fetch("/api/clean-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_id: contentId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to clean script");
      await navigator.clipboard.writeText(result.cleaned);
      setCopiedId("header-script");
      toast.success("Clean speaking script copied!", { id: toastId });
      setTimeout(() => setCopiedId(null), 2500);
    } catch (e: any) {
      toast.error(e.message || "Failed to polish script", { id: toastId });
    } finally {
      setCleaning(false);
    }
  };

  const regenerateWithHook = async (hook: any) => {
    if (!data || hookRegenerating || !data.startup.run_id) return;
    setHookRegenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: data.startup.run_id,
          startup_id: startupId,
          type: "startup",
          stage: "script",
          selected_hook: hook,
          regenerate_hook: hook, // legacy alias
        }),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error || "Failed to regenerate"); return; }
      toast.success(`Script regenerated! Quality: ${result.qualityScore}/10`);
      setHooksOpen(false);
      fetchData();
    } catch { toast.error("Failed to regenerate"); }
    finally { setHookRegenerating(false); }
  };

  const reviseCurrentContent = async () => {
    if (!revisionText.trim() || revising || !data || data.content.length === 0) return;
    const activeItem = data.content.find((c) => c.content_type === activeContentTab);
    if (!activeItem) { toast.error("No content selected to revise"); return; }
    setRevising(true);
    try {
      const res = await fetch("/api/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_id: activeItem.id, instructions: revisionText.trim() }),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error || "Revision failed"); return; }
      toast.success("Content revised!");
      setRevisionText("");
      setRevisionOpen(false);
      fetchData();
    } catch { toast.error("Failed to revise content"); }
    finally { setRevising(false); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="spinner" /></div>;
  if (!data) return <div className="p-8 text-center text-gray-400">Startup not found.</div>;

  const { startup, content } = data;
  const isActive = ["researching", "generating", "hooks", "scripting", "refining"].includes(startup.content_status);
  // Stage 1 complete: 10 hooks in startups.hooks_cache, script not built yet.
  const scriptRows = content;
  const cachedHooks: any[] = (() => {
    const raw = startup.hooks_cache;
    if (!raw) return [];
    try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return []; }
  })();
  const awaitingHookPick =
    scriptRows.length === 0 &&
    cachedHooks.length > 0 &&
    (startup.content_status === "hooks_ready" || startup.content_status === "hooks");
  const hasContent = scriptRows.length > 0;
  const hasFunding = startup.funding_amount && startup.funding_amount !== "Unknown";
  const reelScriptItem = content.find((c) => c.content_type === "reel_script");

  let allHooks: any[] = cachedHooks;
  let selectedHook: any = null;
  if (scriptRows[0]) {
    try {
      const scriptHooks = typeof scriptRows[0].hooks === "string" ? JSON.parse(scriptRows[0].hooks) : scriptRows[0].hooks;
      if (scriptHooks && scriptHooks.length > 0) allHooks = scriptHooks;
      selectedHook = typeof scriptRows[0].selected_hook === "string" ? JSON.parse(scriptRows[0].selected_hook) : scriptRows[0].selected_hook;
    } catch {}
  }

  const contentLabels: Record<string, string> = { reel_script: "Reel Script", carousel_text: "Carousel", caption_hashtags: "Caption", linkedin_post: "LinkedIn Post" };
  const linkedinItem = content.find((c) => c.content_type === "linkedin_post");
  const canGenerate = !generating && !isActive && !hasContent && startup.content_status !== "completed";
  const canRegenerate = !generating && !isActive && (hasContent || startup.content_status === "completed" || startup.content_status === "failed");

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push("/")}
          className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-gray-900">{startup.name}</h1>
          <p className="text-xs text-gray-400">{format(new Date(startup.discovered_at || Date.now()), "EEEE, MMMM d, yyyy")}</p>
        </div>
        {reelScriptItem && (
          <button
            onClick={() => copyCleanSpeakingScript(reelScriptItem.id)}
            disabled={cleaning}
            className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2 disabled:opacity-60"
          >
            {cleaning ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Polishing...</>
            ) : copiedId === "header-script" ? (
              <><Check className="w-4 h-4" />Copied!</>
            ) : (
              <><Copy className="w-4 h-4" />Copy Script</>
            )}
          </button>
        )}
        <span className={`badge text-xs ${
          startup.content_status === "completed" || startup.reel_created ? "bg-green-50 text-green-600" :
          startup.content_status === "failed" ? "bg-red-50 text-red-600" :
          isActive ? "bg-blue-50 text-blue-600" :
          "bg-gray-100 text-gray-600"
        }`}>
          {isActive && <Loader2 className="w-3 h-3 animate-spin" />}
          {startup.content_status === "completed" && <CheckCircle className="w-3 h-3" />}
          {startup.reel_created ? "Reel Created" : statusLabels[startup.content_status] || "No Content"}
        </span>
      </div>

      {/* Startup Info Card */}
      <div className={`card p-5 mb-6 ${hasFunding ? "border-l-4 border-l-amber-400" : ""}`}>
        <p className="text-sm text-gray-600 mb-3">{startup.description}</p>
        <div className="flex items-center gap-3 flex-wrap">
          {hasFunding && (
            <span className="badge bg-amber-100 text-amber-700 border border-amber-200">
              <DollarSign className="w-2.5 h-2.5" />{startup.funding_amount}
            </span>
          )}
          <span className="badge bg-gray-100 text-gray-600">{startup.funding_round}</span>
          <span className={`badge capitalize ${startup.scale === "medium" ? "bg-violet-100 text-violet-700" : "bg-indigo-50 text-indigo-600"}`}>{startup.scale}</span>
          {startup.tech && startup.tech !== "Unknown" && (
            <span className="badge bg-blue-50 text-blue-600"><Tag className="w-2.5 h-2.5" />{startup.tech}</span>
          )}
          {startup.investor && startup.investor !== "Unknown" && (
            <span className="badge bg-gray-50 text-gray-600"><Users className="w-2.5 h-2.5" />{startup.investor}</span>
          )}
          {startup.builder_value && (
            <span className="badge bg-green-50 text-green-600"><Zap className="w-2.5 h-2.5" />{startup.builder_value}</span>
          )}
          {startup.website && (
            <a href={startup.website} target="_blank" rel="noopener noreferrer"
              className="badge bg-white text-blue-600 border border-blue-200 hover:bg-blue-50 cursor-pointer">
              <ExternalLink className="w-2.5 h-2.5" />Website
            </a>
          )}
        </div>
      </div>

      {/* Quick Preview row — D model, fast/cheap sanity check before deep generation */}
      <div className="flex items-center justify-between mb-6 -mt-2">
        <button
          onClick={fetchQuickPreview}
          disabled={quickLoading}
          className="btn-outline px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-60"
        >
          {quickLoading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />Previewing...</>
          ) : (
            <><Sparkles className="w-3.5 h-3.5" />Quick Preview (~15s)</>
          )}
        </button>
        <span className="text-[10px] text-gray-400">
          Fast scan using GPT-4o web search. Decide if this startup is worth the 2-3 min deep research.
        </span>
      </div>

      {quickPreview && (
        <div className="card p-5 mb-6 border-violet-200 bg-violet-50/30 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-medium text-violet-900">Quick preview</span>
              <span className="badge bg-violet-100 text-violet-700 text-[10px]">gpt-4o-search</span>
            </div>
            <button
              onClick={() => setQuickPreview(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Dismiss
            </button>
          </div>
          <div className="prose prose-sm max-w-none text-gray-800 leading-relaxed text-sm">
            <ReactMarkdown>{quickPreview.content}</ReactMarkdown>
          </div>
          {quickPreview.citations.length > 0 && (
            <div className="mt-4 pt-3 border-t border-violet-200">
              <p className="text-[10px] uppercase tracking-wider text-violet-700/70 mb-2">Sources</p>
              <div className="flex flex-wrap gap-1.5">
                {quickPreview.citations.slice(0, 10).map((c, i) => (
                  <a
                    key={i}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="badge bg-white border border-violet-200 text-violet-700 hover:bg-violet-100 text-[10px] max-w-xs truncate"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    {c.title || new URL(c.url).hostname}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress Banner */}
      {isActive && (
        <div className="card p-5 mb-6 border-blue-200 bg-blue-50/50">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            <div>
              <p className="text-sm font-medium text-blue-900">{statusLabels[startup.content_status]}</p>
              <p className="text-xs text-blue-600/70 mt-0.5">This may take 2-5 minutes depending on research depth.</p>
            </div>
          </div>
        </div>
      )}

      {/* Stage 1 complete: 10 hooks ready, user must pick one to generate the script */}
      {awaitingHookPick && !isActive && (
        <div className="card overflow-hidden mb-6 animate-fade-in">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-br from-violet-50 to-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
                <Sparkles className="w-4.5 h-4.5 text-violet-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  Pick a hook to build the script
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {allHooks.length} options — the script is built entirely around whichever you pick. Research is already cached, so pick-a-different-hook is cheap.
                </p>
              </div>
              {hookRegenerating && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
              <button
                onClick={generateContent}
                disabled={generating || hookRegenerating}
                title="Re-research + generate 10 new hooks (slower — burns a Perplexity call)"
                className="btn-outline px-3 py-1.5 text-[11px] flex items-center gap-1.5"
              >
                {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                New hooks
              </button>
            </div>
          </div>
          <div className="p-4 space-y-2 bg-gray-50/50">
            {allHooks.length === 0 && (
              <p className="text-xs text-gray-400 px-2 py-4">
                No hooks returned. Click &ldquo;New hooks&rdquo; above to retry.
              </p>
            )}
            {allHooks.map((h: any, i: number) => (
              <button
                key={i}
                disabled={hookRegenerating || generating}
                onClick={() => regenerateWithHook(h)}
                className={`w-full text-left p-4 rounded-lg border text-xs transition-all ${
                  hookRegenerating || generating
                    ? "border-gray-100 bg-white opacity-50 cursor-not-allowed"
                    : "border-gray-200 bg-white hover:border-violet-400 hover:bg-violet-50/40 cursor-pointer"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="badge bg-violet-50 text-violet-600 text-[10px]">{h.style}</span>
                  <span className="text-[10px] text-gray-400">#{i + 1}</span>
                </div>
                <p className="text-gray-800 leading-relaxed text-sm">&ldquo;{h.hook}&rdquo;</p>
                {h.why_it_works && (
                  <p className="text-gray-400 mt-1.5 text-[10px]">{h.why_it_works}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No Content Yet */}
      {!hasContent && !awaitingHookPick && !isActive && (
        <div className="card flex flex-col items-center justify-center py-16 text-center mb-6">
          <Sparkles className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400 mb-1">No content generated for {startup.name} yet.</p>
          <p className="text-xs text-gray-400 mb-4">Generate a reel script, carousel text, and caption.</p>
          {canGenerate && (
            <button onClick={generateContent}
              className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4" />Generate Content
            </button>
          )}
          {canRegenerate && (
            <button onClick={generateContent}
              className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />Retry Generation
            </button>
          )}
        </div>
      )}

      {/* Content Section */}
      {hasContent && (
        <div className="space-y-6">
          {/* Reel Created Prompt */}
          {!startup.reel_created && (
            <div className="card p-5 border-amber-200 bg-amber-50/30 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                    <Film className="w-4.5 h-4.5 text-amber-700" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-amber-900">Have you created a reel for {startup.name}?</p>
                    <p className="text-xs text-amber-600/80 mt-0.5">Mark it once you've posted the reel so it moves to the done pile.</p>
                  </div>
                </div>
                <button onClick={toggleReelCreated}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 flex items-center gap-1.5 transition-colors">
                  <CheckCircle className="w-3.5 h-3.5" />Yes, Reel Created
                </button>
              </div>
            </div>
          )}
          {startup.reel_created && (
            <div className="card p-4 border-green-200 bg-green-50/30 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <p className="text-sm font-medium text-green-800">Reel created for {startup.name}</p>
                </div>
                <button onClick={toggleReelCreated}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors">Undo</button>
              </div>
            </div>
          )}

          {/* Regenerate Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              {scriptRows[0]?.quality_score && (
                <span className="badge bg-green-50 text-green-600 text-xs py-1 px-3">
                  <CheckCircle className="w-3 h-3" />Quality: {scriptRows[0].quality_score}
                </span>
              )}
              {scriptRows[0]?.reviewer_notes && (
                <details className="text-xs text-gray-500">
                  <summary className="cursor-pointer hover:text-gray-700">Reviewer Notes</summary>
                  <p className="mt-2 whitespace-pre-wrap text-xs bg-gray-50 p-3 rounded-lg border border-gray-100">{scriptRows[0].reviewer_notes}</p>
                </details>
              )}
            </div>
            {canRegenerate && (
              <button onClick={generateContent} disabled={generating || hookRegenerating}
                className="btn-outline px-3.5 py-2 text-xs flex items-center gap-1.5">
                {generating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Regenerating...</>
                  : <><RefreshCw className="w-3.5 h-3.5" />Full Regenerate</>}
              </button>
            )}
          </div>

          {/* Hook Selector */}
          {allHooks.length > 0 && (
            <div className="card overflow-hidden animate-fade-in">
              <button onClick={() => setHooksOpen(!hooksOpen)}
                className="w-full flex items-center justify-between px-5 py-3.5 bg-white hover:bg-gray-50 transition-colors border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-medium text-gray-900">Selected Hook</p>
                    <p className="text-xs text-gray-500 mt-0.5 max-w-lg truncate">
                      {selectedHook ? `"${selectedHook.hook}"` : "No hook selected"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hookRegenerating && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
                  <span className="badge bg-violet-50 text-violet-600 text-[10px]">{allHooks.length} hooks</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${hooksOpen ? "rotate-180" : ""}`} />
                </div>
              </button>
              {hooksOpen && (
                <div className="p-4 space-y-2 bg-gray-50/50">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-1 mb-3">
                    Select a hook to regenerate the script
                  </p>
                  {allHooks.map((h: any, i: number) => {
                    const isSelected = selectedHook?.hook === h.hook;
                    return (
                      <button key={i} disabled={hookRegenerating || generating || isSelected}
                        onClick={() => { if (!isSelected) regenerateWithHook(h); }}
                        className={`w-full text-left p-3.5 rounded-lg border text-xs transition-all ${
                          isSelected ? "border-blue-300 bg-blue-50/70 cursor-default"
                          : hookRegenerating || generating ? "border-gray-100 bg-white opacity-50 cursor-not-allowed"
                          : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer"
                        }`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="badge bg-violet-50 text-violet-600 text-[10px]">{h.style}</span>
                            {isSelected && <span className="badge bg-blue-100 text-blue-700 text-[10px]">Current</span>}
                          </div>
                        </div>
                        <p className="text-gray-800 leading-relaxed">&ldquo;{h.hook}&rdquo;</p>
                        {h.why_it_works && <p className="text-gray-400 mt-1 text-[10px]">{h.why_it_works}</p>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Content Sub-tabs */}
          <div className="flex gap-2">
            {["reel_script", "carousel_text", "caption_hashtags"].map((ct) => {
              const item = content.find((c) => c.content_type === ct);
              if (!item) return null;
              return (
                <button key={ct} onClick={() => setActiveContentTab(ct)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                    activeContentTab === ct ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-blue-300"
                  }`}>
                  {ct === "reel_script" && <Film className="w-3.5 h-3.5" />}
                  {ct === "carousel_text" && <LayoutGrid className="w-3.5 h-3.5" />}
                  {ct === "caption_hashtags" && <MessageSquare className="w-3.5 h-3.5" />}
                  {contentLabels[ct]}
                </button>
              );
            })}
            {/* LinkedIn tab is always shown (even before generation) so the user can
                trigger a Sorai Tech post on demand from the same startup. */}
            <button onClick={() => setActiveContentTab("linkedin_post")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                activeContentTab === "linkedin_post" ? "bg-[#0a66c2] text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-[#0a66c2]"
              }`}>
              <Linkedin className="w-3.5 h-3.5" />
              LinkedIn Post
            </button>
          </div>

          {/* LinkedIn empty state — generate on demand. The auto-draft on script-gen
              usually fills this in already, but this covers regen / standalone use. */}
          {activeContentTab === "linkedin_post" && !linkedinItem && (
            <div className="card p-8 text-center border-dashed">
              <Linkedin className="w-8 h-8 text-[#0a66c2]/40 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-1">No LinkedIn post for {startup.name} yet.</p>
              <p className="text-xs text-gray-400 mb-4">A single ready-to-paste post in the Sorai Tech company voice, built from the same research.</p>
              <button
                onClick={() => generateLinkedIn(selectedHook)}
                disabled={linkedinGenerating}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-[#0a66c2] text-white hover:bg-[#0a5aab] disabled:opacity-50"
              >
                {linkedinGenerating
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Writing...</>
                  : <><Sparkles className="w-3.5 h-3.5" />Generate LinkedIn Post</>}
              </button>
            </div>
          )}

          {/* Content Display */}
          {content.filter((c) => c.content_type === activeContentTab).map((item) => (
            <div key={item.id} className="card">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{contentLabels[item.content_type]}</span>
                  {item.is_refined && <span className="badge bg-green-50 text-green-600 text-[10px]">Refined</span>}
                </div>
                <div className="flex items-center gap-2">
                  {item.content_type === "linkedin_post" && (
                    <button onClick={() => generateLinkedIn(selectedHook)}
                      disabled={linkedinGenerating}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-[#0a66c2] hover:bg-blue-50 border border-gray-200 transition-colors disabled:opacity-50">
                      {linkedinGenerating
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Writing...</>
                        : <><RefreshCw className="w-3.5 h-3.5" />Regenerate</>}
                    </button>
                  )}
                  <button onClick={() => setRevisionOpen(!revisionOpen)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                      revisionOpen ? "text-blue-600 bg-blue-50 border-blue-200" : "text-gray-500 hover:text-blue-600 hover:bg-blue-50 border-gray-200"
                    }`}>
                    <Pencil className="w-3.5 h-3.5" />Revise
                  </button>
                  <button onClick={() => copyToClipboard(item.content, item.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 transition-colors">
                    {copiedId === item.id ? <><Check className="w-3.5 h-3.5 text-green-600" />Copied!</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
                  </button>
                </div>
              </div>
              <div className="p-6 prose prose-sm max-w-none text-gray-800 leading-relaxed text-sm">
                <ReactMarkdown>{item.content}</ReactMarkdown>
              </div>
              {/* Agentic fact-check result (LinkedIn posts only) */}
              {item.content_type === "linkedin_post" && item.reviewer_notes && (() => {
                const passed = item.reviewer_notes.startsWith("Fact-check passed");
                return (
                  <div className={`mx-5 mb-5 rounded-lg border px-4 py-3 text-xs ${
                    passed ? "border-green-200 bg-green-50/50 text-green-800" : "border-amber-200 bg-amber-50/50 text-amber-800"
                  }`}>
                    <div className="flex items-center gap-1.5 font-medium mb-1">
                      {passed ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      Fact-check
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{item.reviewer_notes}</p>
                  </div>
                );
              })()}
              {/* Tag helper (LinkedIn posts only) — LinkedIn mentions must be typed
                  in the composer, so we surface who to tag + links to find them. */}
              {item.content_type === "linkedin_post" && item.tag_targets && (() => {
                const t = typeof item.tag_targets === "string" ? JSON.parse(item.tag_targets) : item.tag_targets;
                const people = [
                  ...(t.company?.name ? [{ ...t.company, _label: "Company" }] : []),
                  ...((t.founders || []).map((f: any) => ({ ...f, _label: f.title || "Founder" }))),
                ];
                if (people.length === 0) return null;
                return (
                  <div className="mx-5 mb-5 rounded-lg border border-[#0a66c2]/30 bg-[#0a66c2]/5 px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[#0a66c2] mb-1">
                      <Linkedin className="w-3.5 h-3.5" />Tag when posting
                    </div>
                    <p className="text-[11px] text-gray-500 mb-2.5">
                      LinkedIn mentions can&apos;t be pasted — type <span className="font-medium">@</span> in the composer and pick each person. Click a name to find their profile.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {people.map((p: any, i: number) => (
                        <a key={i} href={p.linkedin_url || p.search_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-[#0a66c2]/30 text-xs text-gray-700 hover:border-[#0a66c2] hover:text-[#0a66c2] transition-colors">
                          <span className="text-[10px] text-gray-400">{p._label}:</span>
                          <span className="font-medium">{p.name}</span>
                          {p.linkedin_url
                            ? <Check className="w-3 h-3 text-green-600" />
                            : <ExternalLink className="w-3 h-3 opacity-60" />}
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          ))}

          {/* Revision Input */}
          {revisionOpen && (
            <div className="card p-5 border-blue-200 bg-blue-50/20 animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <Pencil className="w-4 h-4 text-blue-600" />
                <p className="text-sm font-medium text-gray-900">Revise {contentLabels[activeContentTab]}</p>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Describe what changes you want. For example: &ldquo;Change the hook to something more shocking&rdquo;, &ldquo;Include more technical details about their ML pipeline&rdquo;, or &ldquo;Make the tone more casual&rdquo;.
              </p>
              <div className="flex gap-2">
                <textarea
                  value={revisionText}
                  onChange={(e) => setRevisionText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !revising) { e.preventDefault(); reviseCurrentContent(); } }}
                  placeholder="What changes do you want to make to this content?"
                  rows={3}
                  className="input-field flex-1 resize-none"
                  disabled={revising}
                />
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-[10px] text-gray-400">Press Enter to send, Shift+Enter for new line. Your saved preferences are automatically included.</p>
                <button onClick={reviseCurrentContent}
                  disabled={revising || !revisionText.trim()}
                  className="btn-primary px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50">
                  {revising ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Revising...</>
                    : <><Send className="w-3.5 h-3.5" />Apply Changes</>}
                </button>
              </div>
            </div>
          )}

          {/* Learn Mode — plain-English walkthrough + glossary (Gemini) */}
          {content.length > 0 && (
            <div className="card border-emerald-200">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-emerald-50/40">
                <button
                  onClick={() => setExplainOpen((v) => !v)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-900"
                >
                  <GraduationCap className="w-4 h-4 text-emerald-600" />
                  Learn Mode — Explain in Simple Terms
                  {startup.layman_generated_at && (
                    <span className="text-[10px] text-gray-400 font-normal ml-1">
                      (updated {format(new Date(startup.layman_generated_at), "MMM d, HH:mm")})
                    </span>
                  )}
                  {explainOpen ? (
                    <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </button>
                <div className="flex items-center gap-2">
                  {startup.layman_explanation && (
                    <button
                      onClick={() => copyToClipboard(startup.layman_explanation!, "learn")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 border border-gray-200 transition-colors"
                    >
                      {copiedId === "learn" ? (
                        <><Check className="w-3.5 h-3.5 text-green-600" />Copied!</>
                      ) : (
                        <><Copy className="w-3.5 h-3.5" />Copy</>
                      )}
                    </button>
                  )}
                  <button
                    onClick={explainInSimpleTerms}
                    disabled={explaining}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {explaining ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" />Thinking…</>
                    ) : (
                      <><Sparkles className="w-3.5 h-3.5" />{startup.layman_explanation ? "Regenerate" : "Explain Everything"}</>
                    )}
                  </button>
                </div>
              </div>
              {explainOpen && (
                startup.layman_explanation ? (
                  <div className="p-6 prose prose-sm max-w-none text-gray-800 leading-relaxed text-sm">
                    <ReactMarkdown>{startup.layman_explanation}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="p-6 text-center text-sm text-gray-500">
                    <GraduationCap className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                    <p>Click <strong>Explain Everything</strong> to get a plain-English walkthrough + a glossary of every technical term, acronym, and framework in the generated content.</p>
                    <p className="text-[11px] text-gray-400 mt-1">Powered by Gemini 2.5 Pro · ~20s</p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
