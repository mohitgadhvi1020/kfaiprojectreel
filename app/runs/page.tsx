"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, CheckCircle, AlertCircle, ChevronRight, Rocket,
  ChevronDown, Zap, Film, Sparkles, Twitter, ExternalLink,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface Run {
  id: string; status: string; created_at: string; completed_at: string | null;
  startups_found: number; x_tips_found: number; trending_found: number;
}

interface Startup {
  id: string; name: string; description: string; funding_amount: string;
  content_status: string; reel_created: boolean; run_id: string | null;
}

interface XTip {
  id: string; author: string; post_summary: string; reel_potential: string;
  is_used: boolean; run_id: string | null;
}

export default function DiscoveryHistoryPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [startups, setStartups] = useState<Startup[]>([]);
  const [xTips, setXTips] = useState<XTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.ok ? r.json() : { startups: [], xTips: [], runs: [] }).then((data) => {
      setRuns(data.runs || []);
      setStartups(data.startups || []);
      setXTips(data.xTips || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="spinner" /></div>;

  const startupsByRun = new Map<string, Startup[]>();
  for (const s of startups) {
    if (s.run_id) {
      if (!startupsByRun.has(s.run_id)) startupsByRun.set(s.run_id, []);
      startupsByRun.get(s.run_id)!.push(s);
    }
  }

  const xTipsByRun = new Map<string, XTip[]>();
  for (const t of xTips) {
    if (t.run_id) {
      if (!xTipsByRun.has(t.run_id)) xTipsByRun.set(t.run_id, []);
      xTipsByRun.get(t.run_id)!.push(t);
    }
  }

  const contentStatusIcon = (status: string, reelCreated: boolean) => {
    if (reelCreated) return <Film className="w-3 h-3 text-green-600" />;
    if (status === "completed") return <CheckCircle className="w-3 h-3 text-green-600" />;
    if (["researching", "generating", "hooks", "scripting", "refining"].includes(status))
      return <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />;
    return <span className="w-3 h-3 rounded-full bg-gray-200 inline-block" />;
  };

  const formatAuthor = (author: string) => author.startsWith("@") ? author : `@${author}`;

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Discovery History</h1>
        <p className="text-sm text-gray-400 mt-0.5">Each discovery run finds new startups, X tips, and trending topics</p>
      </div>

      {runs.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16">
          <Rocket className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">No discoveries yet. Go to Dashboard to start one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => {
            const isRunActive = run.status === "researching";
            const isDone = run.status === "ready" || run.status === "completed";
            const isFailed = run.status === "failed";
            const runStartups = startupsByRun.get(run.id) || [];
            const runXTips = xTipsByRun.get(run.id) || [];
            const isExpanded = expandedRun === run.id;

            return (
              <div key={run.id} className="card overflow-hidden">
                {/* Run Header */}
                <div className="flex items-center">
                  <button
                    onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                    className="flex-1 flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`badge ${
                        isRunActive ? "bg-blue-50 text-blue-600" :
                        isDone ? "bg-green-50 text-green-600" :
                        "bg-red-50 text-red-600"
                      }`}>
                        {isRunActive && <Loader2 className="w-3 h-3 animate-spin" />}
                        {isDone && <CheckCircle className="w-3 h-3" />}
                        {isFailed && <AlertCircle className="w-3 h-3" />}
                        {isRunActive ? "Discovering" : isDone ? "Completed" : "Failed"}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Discovery &middot; {format(new Date(run.created_at), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{run.startups_found || 0} startups</span>
                        <span className="flex items-center gap-1"><Twitter className="w-3 h-3" />{run.x_tips_found || 0} tips</span>
                        <span>{run.trending_found || 0} trending</span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  <button
                    onClick={() => router.push(`/runs/${run.id}`)}
                    className="px-4 py-4 border-l border-gray-100 hover:bg-blue-50 transition-colors text-xs text-blue-600 font-medium flex items-center gap-1"
                    title="View full details"
                  >
                    Details <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                {/* Expanded: Show Startups + X Tips from this Run */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50/50">
                    {runStartups.length === 0 && runXTips.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-6">
                        {isRunActive ? "Discovering content sources..." : "No items found in this run."}
                      </p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {/* Startups */}
                        {runStartups.length > 0 && (
                          <div className="px-5 pt-3 pb-1">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                              <Zap className="w-3 h-3" />Startups ({runStartups.length})
                            </p>
                          </div>
                        )}
                        {runStartups.map((s) => (
                          <div key={s.id}
                            onClick={() => router.push(`/startups/${s.id}`)}
                            className="flex items-center justify-between px-5 py-3 hover:bg-white cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              {contentStatusIcon(s.content_status || "none", s.reel_created)}
                              <div>
                                <p className="text-sm font-medium text-gray-900">{s.name}</p>
                                <p className="text-xs text-gray-400 max-w-md truncate">{s.description}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {s.funding_amount && s.funding_amount !== "Unknown" && (
                                <span className="badge bg-amber-50 text-amber-600 text-[10px]">{s.funding_amount}</span>
                              )}
                              {s.reel_created ? (
                                <span className="badge bg-green-50 text-green-600 text-[10px]"><Film className="w-2.5 h-2.5" />Reel Done</span>
                              ) : (s.content_status || "none") === "completed" ? (
                                <span className="badge bg-green-50 text-green-600 text-[10px]"><Sparkles className="w-2.5 h-2.5" />Content Ready</span>
                              ) : (
                                <span className="badge bg-gray-100 text-gray-500 text-[10px]">Pending</span>
                              )}
                              <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                            </div>
                          </div>
                        ))}

                        {/* X Tips */}
                        {runXTips.length > 0 && (
                          <div className="px-5 pt-3 pb-1">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                              <Twitter className="w-3 h-3" />X Tips ({runXTips.length})
                            </p>
                          </div>
                        )}
                        {runXTips.map((t) => (
                          <div key={t.id}
                            onClick={() => router.push(`/runs/${run.id}`)}
                            className="flex items-center justify-between px-5 py-3 hover:bg-white cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-6 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0">
                                <Twitter className="w-3 h-3 text-sky-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{formatAuthor(t.author)}</p>
                                <p className="text-xs text-gray-400 max-w-md truncate">{t.post_summary}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`badge text-[10px] ${
                                t.reel_potential?.toLowerCase().includes("high") ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
                              }`}>{t.reel_potential}</span>
                              {t.is_used ? (
                                <span className="badge bg-green-50 text-green-600 text-[10px]"><Sparkles className="w-2.5 h-2.5" />Content Ready</span>
                              ) : (
                                <span className="badge bg-gray-100 text-gray-500 text-[10px]">Pending</span>
                              )}
                              <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
