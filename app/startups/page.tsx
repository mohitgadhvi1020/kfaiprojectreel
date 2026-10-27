"use client";

import { useEffect, useState } from "react";
import { Database, DollarSign, Users, Tag, Zap, Search, Film, CheckCircle, CircleDashed, Star } from "lucide-react";
import toast from "react-hot-toast";

interface Startup {
  id: string; name: string; description: string; funding_amount: string;
  funding_round: string; investor: string; tech: string; builder_value: string;
  scale: string; is_used: boolean; reel_created: boolean; created_at: string;
}

type ScaleFilter = "all" | "small" | "medium";
type ReelFilter = "all" | "pending" | "created";

function parseFundingAmount(amount: string): number {
  const cleaned = amount.replace(/[^0-9.MBKmb]/g, "");
  const num = parseFloat(cleaned.replace(/[MBKmb]/g, ""));
  if (isNaN(num)) return 0;
  if (/b/i.test(amount)) return num * 1000;
  if (/m/i.test(amount)) return num;
  if (/k/i.test(amount)) return num / 1000;
  return num;
}

export default function StartupsDBPage() {
  const [startups, setStartups] = useState<Startup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [scaleFilter, setScaleFilter] = useState<ScaleFilter>("all");
  const [reelFilter, setReelFilter] = useState<ReelFilter>("all");
  const [sortBy, setSortBy] = useState<"recent" | "funding">("recent");

  useEffect(() => {
    fetch("/api/startups").then(r => r.ok ? r.json() : []).then(setStartups).finally(() => setLoading(false));
  }, []);

  const toggleReelCreated = async (id: string, current: boolean) => {
    const newVal = !current;
    try {
      const res = await fetch("/api/startups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, reel_created: newVal }),
      });
      if (!res.ok) throw new Error();
      setStartups(prev => prev.map(s => s.id === id ? { ...s, reel_created: newVal } : s));
      toast.success(newVal ? "Marked as reel created" : "Unmarked reel");
    } catch {
      toast.error("Failed to update");
    }
  };

  const filtered = startups
    .filter(s => {
      if (scaleFilter !== "all" && s.scale !== scaleFilter) return false;
      if (reelFilter === "pending" && s.reel_created) return false;
      if (reelFilter === "created" && !s.reel_created) return false;
      if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.description.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "funding") return parseFundingAmount(b.funding_amount) - parseFundingAmount(a.funding_amount);
      return 0;
    });

  const fundingStartups = startups.filter(s => s.funding_amount && s.funding_amount !== "Unknown");
  const reelPending = startups.filter(s => s.is_used && !s.reel_created);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="spinner" /></div>;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Startups Database</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {startups.length} startups discovered &middot;
            {" "}{fundingStartups.length} funded &middot;
            {" "}{reelPending.length} reels pending
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><Database className="w-3.5 h-3.5 text-blue-600" /></div>
            <span className="text-xs text-gray-400">Total</span>
          </div>
          <p className="text-xl font-semibold text-gray-900">{startups.length}</p>
        </div>
        <div className="card p-4 border-amber-200 bg-amber-50/30">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center"><Star className="w-3.5 h-3.5 text-amber-600" /></div>
            <span className="text-xs text-amber-600 font-medium">Funded</span>
          </div>
          <p className="text-xl font-semibold text-amber-700">{fundingStartups.length}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center"><Film className="w-3.5 h-3.5 text-green-600" /></div>
            <span className="text-xs text-gray-400">Reels Created</span>
          </div>
          <p className="text-xl font-semibold text-gray-900">{startups.filter(s => s.reel_created).length}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center"><CircleDashed className="w-3.5 h-3.5 text-red-500" /></div>
            <span className="text-xs text-gray-400">Reels Pending</span>
          </div>
          <p className="text-xl font-semibold text-gray-900">{reelPending.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search startups..." className="input-field pl-10" />
        </div>

        {/* Scale Filter */}
        <div className="flex gap-1.5">
          <span className="text-xs text-gray-400 self-center mr-1">Scale:</span>
          {(["all", "small", "medium"] as const).map(f => (
            <button key={f} onClick={() => setScaleFilter(f)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${scaleFilter === f ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-blue-300"}`}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Reel Status Filter */}
        <div className="flex gap-1.5">
          <span className="text-xs text-gray-400 self-center mr-1">Reel:</span>
          {(["all", "pending", "created"] as const).map(f => (
            <button key={f} onClick={() => setReelFilter(f)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${reelFilter === f
                ? f === "created" ? "bg-green-600 text-white" : f === "pending" ? "bg-amber-500 text-white" : "bg-blue-600 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:border-blue-300"}`}>
              {f === "all" ? "All" : f === "pending" ? "Pending" : "Created"}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex gap-1.5">
          <span className="text-xs text-gray-400 self-center mr-1">Sort:</span>
          <button onClick={() => setSortBy("recent")}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${sortBy === "recent" ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-blue-300"}`}>
            Recent
          </button>
          <button onClick={() => setSortBy("funding")}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${sortBy === "funding" ? "bg-amber-500 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-blue-300"}`}>
            Funding
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16">
          <Database className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">{search ? "No matches found." : "No startups yet."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const fundingNum = parseFundingAmount(s.funding_amount);
            const isFundingPremium = fundingNum > 0 && s.funding_amount !== "Unknown";

            return (
              <div key={s.id} className={`card p-5 transition-all ${s.reel_created ? "opacity-60 border-green-200" : ""} ${isFundingPremium ? "border-l-4 border-l-amber-400" : ""}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-gray-900">{s.name}</h3>

                    {/* Premium Funding Badge */}
                    {isFundingPremium && (
                      <span className="badge bg-amber-100 text-amber-700 border border-amber-300">
                        <DollarSign className="w-2.5 h-2.5" />{s.funding_amount}
                        <Star className="w-2.5 h-2.5 ml-0.5" />
                      </span>
                    )}
                    {!isFundingPremium && (
                      <span className="badge bg-blue-50 text-blue-600"><DollarSign className="w-2.5 h-2.5" />{s.funding_amount}</span>
                    )}

                    <span className="badge bg-gray-100 text-gray-600">{s.funding_round}</span>
                    <span className={`badge capitalize ${s.scale === "medium" ? "bg-violet-100 text-violet-700" : "bg-indigo-50 text-indigo-600"}`}>{s.scale}</span>

                    {s.reel_created && <span className="badge bg-green-100 text-green-700"><CheckCircle className="w-2.5 h-2.5" />Reel Created</span>}
                    {s.is_used && !s.reel_created && <span className="badge bg-amber-100 text-amber-700"><Film className="w-2.5 h-2.5" />Content Generated</span>}
                  </div>

                  {/* Reel Created Toggle */}
                  <button
                    onClick={() => toggleReelCreated(s.id, s.reel_created)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 flex-shrink-0 ml-4 transition-all ${
                      s.reel_created
                        ? "bg-green-50 text-green-700 border border-green-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                        : "bg-white text-gray-600 border border-gray-200 hover:border-green-400 hover:text-green-700 hover:bg-green-50"
                    }`}
                    title={s.reel_created ? "Click to unmark reel" : "Did you create a reel for this?"}
                  >
                    {s.reel_created ? (
                      <><CheckCircle className="w-3 h-3" />Reel Done</>
                    ) : (
                      <><Film className="w-3 h-3" />Mark Reel Created</>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-2">{s.description}</p>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  {s.investor && s.investor !== "Unknown" && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{s.investor}</span>}
                  {s.tech && s.tech !== "Unknown" && <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{s.tech}</span>}
                  {s.builder_value && <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{s.builder_value}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
