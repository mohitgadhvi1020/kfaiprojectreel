"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, CheckCircle, Clock, AlertCircle, Sparkles,
  Copy, Check, ExternalLink, Users, Tag, Zap, Film,
  LayoutGrid, MessageSquare, Twitter, Flame,
  DollarSign, ChevronRight, Eye, RefreshCw, ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";
import { format, formatDistanceToNow } from "date-fns";
import ReactMarkdown from "react-markdown";

interface Startup {
  id: string; name: string; description: string; funding_amount: string;
  funding_round: string; investor: string; tech: string; builder_value: string;
  scale: string; is_used: boolean; reel_created: boolean; content_status?: string;
}
interface XTip {
  id: string; author: string; post_summary: string; practical_takeaway: string;
  reel_potential: string; post_url: string; post_snippet?: string; is_used: boolean;
}
interface Trending { id: string; topic: string; platform: string; angle: string; }
interface Content {
  id: string; content_type: string; content: string; hooks: any;
  selected_hook: any; quality_score: string; reviewer_notes: string;
  startup_id?: string; x_tip_id?: string; is_refined?: boolean;
}
interface RunData {
  run: { id: string; status: string; created_at: string; startups_found: number; x_tips_found: number; trending_found: number; content_type: string | null; selected_startup_id: string | null; selected_x_tip_id: string | null; };
  startups: Startup[]; xTips: XTip[]; trending: Trending[]; content: Content[]; research: any;
}

const statusLabels: Record<string, string> = {
  researching: "Discovering startups & X insights...",
  ready: "Discovery complete — select a startup or X tip to generate content",
  completed: "Discovery complete",
  failed: "Discovery failed",
};

const contentStatusLabel: Record<string, { color: string; label: string }> = {
  none: { color: "bg-gray-100 text-gray-500", label: "Pending" },
  researching: { color: "bg-blue-50 text-blue-600", label: "Researching" },
  generating: { color: "bg-violet-50 text-violet-600", label: "Generating" },
  hooks: { color: "bg-indigo-50 text-indigo-600", label: "Hooks" },
  scripting: { color: "bg-pink-50 text-pink-600", label: "Writing" },
  refining: { color: "bg-orange-50 text-orange-600", label: "Refining" },
  completed: { color: "bg-green-50 text-green-600", label: "Content Ready" },
  failed: { color: "bg-red-50 text-red-600", label: "Failed" },
};

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.id as string;

  const [data, setData] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"startups" | "x_tips" | "trending" | "content">("startups");
  const [activeContentTab, setActiveContentTab] = useState("reel_script");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hooksOpen, setHooksOpen] = useState(false);
  const [hookRegenerating, setHookRegenerating] = useState(false);
  const [initialTabSet, setInitialTabSet] = useState(false);

  const fetchRunData = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) throw new Error();
      const result = await res.json();
      setData(result);
      if (!initialTabSet && result.content?.length > 0) {
        setActiveTab("content");
        setInitialTabSet(true);
      }
    } catch { toast.error("Failed to load run"); }
    finally { setLoading(false); }
  }, [runId, initialTabSet]);

  useEffect(() => {
    fetchRunData();
    const i = setInterval(fetchRunData, 4000);
    return () => clearInterval(i);
  }, [fetchRunData]);

  const generateContent = async (id: string, type: "startup" | "x_tip") => {
    setGenerating(true);
    setSelectedId(id);
    try {
      const body: any = { run_id: runId, type };
      if (type === "startup") body.startup_id = id; else body.x_tip_id = id;
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error || "Generation failed"); return; }
      toast.success(`Content generated! Quality: ${result.qualityScore}/10`);
      setActiveTab("content");
      setInitialTabSet(true);
      fetchRunData();
    } catch { toast.error("Failed to generate content"); }
    finally { setGenerating(false); }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const regenerateWithHook = async (hook: any) => {
    if (!data || hookRegenerating) return;
    const { content } = data;
    const startupId = content[0]?.startup_id;
    const xTipId = content[0]?.x_tip_id;
    const type = xTipId ? "x_tip" : "startup";

    setHookRegenerating(true);
    try {
      const body: any = { run_id: runId, type, regenerate_hook: hook };
      if (type === "startup") body.startup_id = startupId; else body.x_tip_id = xTipId;
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error || "Failed to regenerate with hook"); return; }
      toast.success(`Script regenerated! Quality: ${result.qualityScore}/10`);
      setHooksOpen(false);
      fetchRunData();
    } catch { toast.error("Failed to regenerate"); }
    finally { setHookRegenerating(false); }
  };

  const formatAuthor = (author: string) => author.startsWith("@") ? author : `@${author}`;

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="spinner" /></div>;
  if (!data) return <div className="p-8 text-center text-gray-400">Run not found.</div>;

  const { run, startups, xTips, trending, content } = data;
  const isDiscovering = run.status === "researching";
  const hasContent = content.length > 0;

  const contentStartupId = hasContent ? content[0].startup_id : null;
  const contentXTipId = hasContent ? content[0].x_tip_id : null;
  const contentStartup = contentStartupId ? startups.find(s => s.id === contentStartupId) : null;
  const contentXTip = contentXTipId ? xTips.find(t => t.id === contentXTipId) : null;
  const contentSourceLabel = contentStartup?.name || (contentXTip ? formatAuthor(contentXTip.author) : null);

  let allHooks: any[] = [];
  let selectedHook: any = null;
  if (hasContent) {
    try {
      allHooks = typeof content[0].hooks === "string" ? JSON.parse(content[0].hooks) : content[0].hooks || [];
      selectedHook = typeof content[0].selected_hook === "string" ? JSON.parse(content[0].selected_hook) : content[0].selected_hook;
    } catch {}
  }

  const contentLabels: Record<string, string> = { reel_script: "Reel Script", carousel_text: "Carousel", caption_hashtags: "Caption" };
  const canGenerate = !generating && (run.status === "ready" || run.status === "completed" || run.status === "failed");

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push("/runs")}
          className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-gray-900">
            Discovery &middot; {format(new Date(run.created_at), "MMM d, yyyy")}
          </h1>
          <p className="text-xs text-gray-400">{format(new Date(run.created_at), "EEEE 'at' h:mm a")} &middot; {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}</p>
        </div>
        <span className={`badge text-xs ${
          isDiscovering ? "bg-blue-50 text-blue-600" :
          run.status === "failed" ? "bg-red-50 text-red-600" :
          "bg-green-50 text-green-600"
        }`}>
          {isDiscovering && <Loader2 className="w-3 h-3 animate-spin" />}
          {(run.status === "ready" || run.status === "completed") && <CheckCircle className="w-3 h-3" />}
          {run.status === "failed" && <AlertCircle className="w-3 h-3" />}
          {statusLabels[run.status] || run.status}
        </span>
      </div>

      {isDiscovering && (
        <div className="card p-5 mb-6 border-blue-200 bg-blue-50/50">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            <div>
              <p className="text-sm font-medium text-blue-900">Discovering new startups and X insights...</p>
              <p className="text-xs text-blue-600/70 mt-0.5">This usually takes 30-60 seconds.</p>
            </div>
          </div>
        </div>
      )}

      {!isDiscovering && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="card p-4 text-center">
            <p className="text-xl font-semibold text-gray-900">{startups.length}</p>
            <p className="text-xs text-gray-400">Startups Found</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xl font-semibold text-gray-900">{xTips.length}</p>
            <p className="text-xs text-gray-400">X Tips</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xl font-semibold text-gray-900">{trending.length}</p>
            <p className="text-xs text-gray-400">Trending Topics</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      {!isDiscovering && (
        <>
          <div className="flex gap-6 border-b border-gray-200 mb-6">
            {hasContent && (
              <button onClick={() => setActiveTab("content")} className={activeTab === "content" ? "tab-active" : "tab-inactive"}>
                <span className="flex items-center gap-1.5"><Film className="w-3.5 h-3.5" />Generated Content</span>
              </button>
            )}
            <button onClick={() => setActiveTab("startups")} className={activeTab === "startups" ? "tab-active" : "tab-inactive"}>
              <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Startups ({startups.length})</span>
            </button>
            <button onClick={() => setActiveTab("x_tips")} className={activeTab === "x_tips" ? "tab-active" : "tab-inactive"}>
              <span className="flex items-center gap-1.5"><Twitter className="w-3.5 h-3.5" />X Tips ({xTips.length})</span>
            </button>
            <button onClick={() => setActiveTab("trending")} className={activeTab === "trending" ? "tab-active" : "tab-inactive"}>
              <span className="flex items-center gap-1.5"><Flame className="w-3.5 h-3.5" />Trending ({trending.length})</span>
            </button>
          </div>

          {/* STARTUPS TAB */}
          {activeTab === "startups" && (
            <div className="space-y-3">
              {startups.length === 0 ? (
                <p className="text-sm text-gray-400 py-12 text-center">No startups found in this discovery.</p>
              ) : startups.map((s) => {
                const hasFunding = s.funding_amount && s.funding_amount !== "Unknown";
                const status = s.content_status || "none";
                const stCfg = contentStatusLabel[status] || contentStatusLabel.none;
                const isActive = ["researching", "generating", "hooks", "scripting", "refining"].includes(status);
                const canGen = canGenerate && !isActive && status !== "completed";

                return (
                  <div key={s.id}
                    onClick={() => router.push(`/startups/${s.id}`)}
                    className={`card p-5 transition-all cursor-pointer hover:shadow-sm ${
                      s.reel_created ? "border-green-200 bg-green-50/20" :
                      status === "completed" ? "border-green-200" :
                      isActive ? "border-blue-200 ring-1 ring-blue-100" : ""
                    } ${hasFunding ? "border-l-4 border-l-amber-400" : ""}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <h3 className="text-sm font-semibold text-gray-900">{s.name}</h3>
                          {hasFunding && (
                            <span className="badge bg-amber-100 text-amber-700 border border-amber-300">
                              <DollarSign className="w-2.5 h-2.5" />{s.funding_amount}
                            </span>
                          )}
                          <span className="badge bg-gray-100 text-gray-600">{s.funding_round}</span>
                          <span className={`badge ${stCfg.color}`}>
                            {isActive && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                            {s.reel_created ? <><Film className="w-2.5 h-2.5" />Reel Done</> : stCfg.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mb-2">{s.description}</p>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          {s.investor && s.investor !== "Unknown" && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{s.investor}</span>}
                          {s.tech && s.tech !== "Unknown" && <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{s.tech}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
                        {(status === "completed" || s.reel_created) && (
                          <button onClick={() => router.push(`/startups/${s.id}`)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors flex items-center gap-1.5">
                            <Eye className="w-3 h-3" />View Content
                          </button>
                        )}
                        {canGen && (
                          <button onClick={() => generateContent(s.id, "startup")} disabled={generating}
                            className="btn-primary px-3.5 py-2 text-xs flex items-center gap-1.5">
                            {generating && selectedId === s.id
                              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating...</>
                              : status === "failed"
                                ? <><RefreshCw className="w-3.5 h-3.5" />Retry</>
                                : <><Sparkles className="w-3.5 h-3.5" />Generate</>}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* X TIPS TAB */}
          {activeTab === "x_tips" && (
            <div className="space-y-3">
              {xTips.length === 0 ? (
                <p className="text-sm text-gray-400 py-12 text-center">No X builder tips found.</p>
              ) : xTips.map((tip) => {
                const isCurrentContent = contentXTipId === tip.id;
                return (
                  <div key={tip.id} className={`card p-5 ${isCurrentContent ? "border-blue-200 bg-blue-50/30" : ""}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-6 h-6 rounded-full bg-sky-100 flex items-center justify-center">
                            <Twitter className="w-3 h-3 text-sky-600" />
                          </div>
                          <h3 className="text-sm font-semibold text-gray-900">{formatAuthor(tip.author)}</h3>
                          <span className={`badge ${tip.reel_potential?.toLowerCase().includes("high") ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"}`}>
                            {tip.reel_potential}
                          </span>
                          {isCurrentContent && <span className="badge bg-blue-100 text-blue-700">Content Generated</span>}
                        </div>
                        <p className="text-xs text-gray-500 mb-1">{tip.post_summary}</p>
                        {tip.practical_takeaway && <p className="text-xs text-blue-600">Takeaway: {tip.practical_takeaway}</p>}
                        {tip.post_url && (
                          <a href={tip.post_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 mt-1">
                            View post <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      {canGenerate && (
                        <button onClick={() => generateContent(tip.id, "x_tip")} disabled={generating}
                          className={`${isCurrentContent ? "btn-outline" : "btn-primary"} px-3.5 py-2 text-xs flex items-center gap-1.5 flex-shrink-0 ml-4`}>
                          {generating && selectedId === tip.id
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating...</>
                            : isCurrentContent
                              ? <><RefreshCw className="w-3.5 h-3.5" />Regenerate</>
                              : <><Sparkles className="w-3.5 h-3.5" />Generate</>}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TRENDING TAB */}
          {activeTab === "trending" && (
            <div className="space-y-3">
              {trending.length === 0 ? (
                <p className="text-sm text-gray-400 py-12 text-center">No trending topics found.</p>
              ) : trending.map((t) => (
                <div key={t.id} className="card p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="badge bg-orange-50 text-orange-600">{t.platform}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{t.topic}</p>
                  {t.angle && <p className="text-xs text-gray-400 mt-1">{t.angle}</p>}
                </div>
              ))}
              <p className="text-xs text-gray-400 text-center py-2">Trending topics are for inspiration only.</p>
            </div>
          )}

          {/* CONTENT TAB */}
          {activeTab === "content" && hasContent && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  {contentSourceLabel && (
                    <span className="text-xs text-gray-500">
                      Content for: <span className="font-medium text-gray-900">{contentSourceLabel}</span>
                    </span>
                  )}
                  {content[0].quality_score && (
                    <span className="badge bg-green-50 text-green-600 text-xs py-1 px-3">
                      <CheckCircle className="w-3 h-3" />Quality: {content[0].quality_score}
                    </span>
                  )}
                  {content[0].reviewer_notes && (
                    <details className="text-xs text-gray-500">
                      <summary className="cursor-pointer hover:text-gray-700">Reviewer Notes</summary>
                      <p className="mt-2 whitespace-pre-wrap text-xs bg-gray-50 p-3 rounded-lg border border-gray-100">{content[0].reviewer_notes}</p>
                    </details>
                  )}
                </div>
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
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-1 mb-3">Select a hook to regenerate the script</p>
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
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="badge bg-violet-50 text-violet-600 text-[10px]">{h.style}</span>
                              {isSelected && <span className="badge bg-blue-100 text-blue-700 text-[10px]">Current</span>}
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
              </div>

              {content.filter((c) => c.content_type === activeContentTab).map((item) => (
                <div key={item.id} className="card">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{contentLabels[item.content_type]}</span>
                      {item.is_refined && <span className="badge bg-green-50 text-green-600 text-[10px]">Refined</span>}
                    </div>
                    <button onClick={() => copyToClipboard(item.content, item.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 transition-colors">
                      {copiedId === item.id ? <><Check className="w-3.5 h-3.5 text-green-600" />Copied!</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
                    </button>
                  </div>
                  <div className="p-6 prose prose-sm max-w-none text-gray-800 leading-relaxed text-sm">
                    <ReactMarkdown>{item.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
