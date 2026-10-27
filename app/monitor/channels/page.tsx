"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus, Trash2, Youtube, Instagram, Twitter, Loader2,
  ArrowLeft, Clock, ToggleLeft, ToggleRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";

interface MonitoredChannel {
  id: string;
  platform: "youtube" | "instagram" | "twitter";
  channel_id: string;
  channel_name: string;
  channel_url: string | null;
  added_at: string;
  last_polled_at: string | null;
  is_active: boolean;
}

type Platform = "youtube" | "instagram";

export default function ChannelsPage() {
  const [channels, setChannels] = useState<MonitoredChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formPlatform, setFormPlatform] = useState<Platform>("youtube");
  const [formUrl, setFormUrl] = useState("");
  const [formNameOverride, setFormNameOverride] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/monitor/channels");
      const data = await res.json();
      setChannels(data.channels || []);
    } catch {
      toast.error("Failed to load channels");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const handleAdd = async () => {
    const url = formUrl.trim();
    if (!url) {
      toast.error("Paste a channel URL (or @handle)");
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading("Resolving channel…");
    try {
      const res = await fetch("/api/monitor/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: formPlatform,
          url,
          // If the user wants a custom display name, pass it — otherwise server picks from og:title
          channel_name: formNameOverride.trim() || undefined,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to add channel");

      toast.success(`Added ${payload.channel?.channel_name || "channel"}`, { id: toastId });
      setFormUrl("");
      setFormNameOverride("");
      setShowForm(false);
      await fetchChannels();
    } catch (err: any) {
      toast.error(err.message || "Failed to add channel", { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkAdd = async () => {
    // Parse one URL/handle/ID per line. Strip blanks, comments (#…), trim.
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    if (lines.length === 0) {
      toast.error("Paste at least one URL or @handle");
      return;
    }

    setSubmitting(true);
    setBulkProgress({ done: 0, total: lines.length });

    let added = 0;
    const failed: { line: string; reason: string }[] = [];

    // Sequential to avoid hammering the channel-resolver (it makes outbound
    // fetches per row). For 100 rows this still finishes well under a minute.
    for (let i = 0; i < lines.length; i++) {
      const url = lines[i];
      try {
        const res = await fetch("/api/monitor/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: formPlatform, url }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          failed.push({ line: url, reason: payload.error || `HTTP ${res.status}` });
        } else {
          added++;
        }
      } catch (err: any) {
        failed.push({ line: url, reason: err.message || "Network error" });
      }
      setBulkProgress({ done: i + 1, total: lines.length });
    }

    setSubmitting(false);
    setBulkProgress(null);

    if (added > 0 && failed.length === 0) {
      toast.success(`Added ${added} channel${added === 1 ? "" : "s"}`);
      setBulkText("");
      setShowForm(false);
    } else if (added > 0 && failed.length > 0) {
      toast(`Added ${added}, ${failed.length} failed — check console for details`, {
        icon: "⚠️",
      });
      console.warn("[bulk-add] failures:", failed);
    } else {
      toast.error(`All ${failed.length} entries failed — check console`);
      console.error("[bulk-add] all failed:", failed);
    }

    await fetchChannels();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from monitoring?`)) return;

    try {
      await fetch(`/api/monitor/channels?id=${id}`, { method: "DELETE" });
      toast.success(`Removed ${name}`);
      setChannels((prev) => prev.filter((c) => c.id !== id));
    } catch {
      toast.error("Failed to remove channel");
    }
  };

  const handleToggle = async (id: string, currentlyActive: boolean) => {
    try {
      await fetch("/api/monitor/channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !currentlyActive }),
      });
      setChannels((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, is_active: !currentlyActive } : c
        )
      );
    } catch {
      toast.error("Failed to toggle channel");
    }
  };

  const platformIcon = (platform: string) => {
    switch (platform) {
      case "youtube":
        return <Youtube className="w-4 h-4 text-red-500" />;
      case "instagram":
        return <Instagram className="w-4 h-4 text-pink-500" />;
      case "twitter":
        return <Twitter className="w-4 h-4 text-sky-500" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/monitor"
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Monitored Channels
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Add YouTube channels and Instagram accounts to track
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Channel
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="card p-5 mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-900">
              {bulkMode ? "Bulk Add Channels" : "Add New Channel"}
            </h3>
            {/* Mode toggle */}
            <div className="flex items-center gap-1 text-xs bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setBulkMode(false)}
                disabled={submitting}
                className={`px-3 py-1 rounded-md transition-all ${
                  !bulkMode
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Single
              </button>
              <button
                onClick={() => setBulkMode(true)}
                disabled={submitting}
                className={`px-3 py-1 rounded-md transition-all ${
                  bulkMode
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Bulk paste
              </button>
            </div>
          </div>

          {/* Platform Selector */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 block mb-1.5">
              Platform {bulkMode && <span className="text-gray-300">(applies to all rows)</span>}
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFormPlatform("youtube")}
                className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                  formPlatform === "youtube"
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                <Youtube className="w-4 h-4" />
                YouTube
              </button>
              <button
                onClick={() => setFormPlatform("instagram")}
                className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                  formPlatform === "instagram"
                    ? "bg-pink-50 text-pink-600 border border-pink-200"
                    : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                <Instagram className="w-4 h-4" />
                Instagram
              </button>
            </div>
          </div>

          {bulkMode ? (
            <>
              <div className="mb-4">
                <label className="text-xs font-medium text-gray-500 block mb-1.5">
                  Paste one URL, @handle, or ID per line
                </label>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={10}
                  placeholder={
                    formPlatform === "youtube"
                      ? "https://www.youtube.com/@nateherk\n@gregisenberg\nUCAM8mXlq6gw0QXHR30CkKbg\n# lines starting with # are skipped"
                      : "https://instagram.com/ai_daily_tools\n@hubermanlab\nrowancheung"
                  }
                  className="input-field font-mono text-xs"
                  style={{ minHeight: 200 }}
                  disabled={submitting}
                  autoFocus
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Blank lines and lines starting with <code>#</code> are ignored.
                  Each row is added one at a time — failures are logged to the
                  browser console.
                </p>
              </div>
              {bulkProgress && (
                <div className="mb-4 p-2 bg-blue-50 border border-blue-100 rounded text-xs text-blue-700 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Adding {bulkProgress.done} of {bulkProgress.total}…
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkAdd}
                  disabled={submitting}
                  className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5"
                >
                  {submitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  {submitting
                    ? `Adding (${bulkProgress?.done ?? 0}/${bulkProgress?.total ?? 0})`
                    : "Add All"}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  disabled={submitting}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-4">
                <label className="text-xs font-medium text-gray-500 block mb-1.5">
                  {formPlatform === "youtube" ? "Channel URL or @handle" : "Profile URL or username"}
                </label>
                <input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !submitting) handleAdd(); }}
                  placeholder={
                    formPlatform === "youtube"
                      ? "https://www.youtube.com/@nateherk"
                      : "https://instagram.com/ai_daily_tools"
                  }
                  className="input-field"
                  autoFocus
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  {formPlatform === "youtube"
                    ? "Paste the full channel URL, @handle, or a UC… ID. Server auto-resolves the channel ID + name."
                    : "Username, @username, or the full profile URL — all work."}
                </p>
              </div>

              <div className="mb-4">
                <label className="text-xs font-medium text-gray-500 block mb-1.5">
                  Display name <span className="text-gray-300">(optional — auto-detected if blank)</span>
                </label>
                <input
                  type="text"
                  value={formNameOverride}
                  onChange={(e) => setFormNameOverride(e.target.value)}
                  placeholder="Leave blank to use the channel's real name"
                  className="input-field"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleAdd}
                  disabled={submitting}
                  className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5"
                >
                  {submitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  {submitting ? "Adding..." : "Add Channel"}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Channels List */}
      {channels.length === 0 ? (
        <div className="card p-12 text-center">
          <Youtube className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-900 mb-1">
            No channels tracked yet
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Add YouTube channels or Instagram accounts to start monitoring their content.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Your First Channel
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className={`card p-4 flex items-center gap-3 ${
                !ch.is_active ? "opacity-50" : ""
              }`}
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  ch.platform === "youtube"
                    ? "bg-red-50"
                    : ch.platform === "instagram"
                    ? "bg-pink-50"
                    : "bg-sky-50"
                }`}
              >
                {platformIcon(ch.platform)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-gray-900">
                    {ch.channel_name}
                  </h3>
                  <span className="badge bg-gray-100 text-gray-500">
                    {ch.platform}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-gray-400 font-mono">
                    {ch.channel_id.length > 30
                      ? ch.channel_id.substring(0, 30) + "..."
                      : ch.channel_id}
                  </span>
                  {ch.last_polled_at && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last polled{" "}
                      {formatDistanceToNow(new Date(ch.last_polled_at), {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                </div>
              </div>

              {/* Toggle Active */}
              <button
                onClick={() => handleToggle(ch.id, ch.is_active)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title={ch.is_active ? "Pause monitoring" : "Resume monitoring"}
              >
                {ch.is_active ? (
                  <ToggleRight className="w-6 h-6 text-green-500" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-gray-400" />
                )}
              </button>

              {/* Delete */}
              <button
                onClick={() => handleDelete(ch.id, ch.channel_name)}
                className="p-1.5 hover:bg-red-50 rounded transition-colors text-gray-400 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Help Text */}
      <div className="mt-8 card p-5">
        <h3 className="text-sm font-medium text-gray-900 mb-3">
          What to paste
        </h3>
        <div className="space-y-3 text-xs text-gray-600">
          <div>
            <p className="font-medium text-gray-700 mb-1">YouTube</p>
            <p>Any of these work — the server figures out the UC… ID for you:</p>
            <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-gray-500 pl-4 list-disc">
              <li>https://www.youtube.com/@nateherk</li>
              <li>@nateherk</li>
              <li>https://www.youtube.com/channel/UC2ojq-nuP8ceeHqiroeKhBA</li>
              <li>UC2ojq-nuP8ceeHqiroeKhBA</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-gray-700 mb-1">Instagram</p>
            <p>
              Paste the profile URL or just the username. Instagram polling uses Apify,
              so make sure <code className="bg-gray-100 px-1 py-0.5 rounded">apify_api_key</code> is
              set in Settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
