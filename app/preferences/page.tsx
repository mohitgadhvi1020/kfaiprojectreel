"use client";

import { useEffect, useState } from "react";
import {
  ThumbsUp, ThumbsDown, Palette, Lightbulb,
  Plus, X, Clock, BookOpen,
} from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";

interface Preference {
  id: string;
  note: string;
  category: "like" | "dislike" | "style" | "instruction";
  created_at: string;
}

const CATEGORIES = [
  { value: "like" as const, label: "What I Like", icon: ThumbsUp, color: "bg-green-50 text-green-600 border-green-200", chipColor: "bg-green-100 text-green-700" },
  { value: "dislike" as const, label: "What I Dislike", icon: ThumbsDown, color: "bg-red-50 text-red-600 border-red-200", chipColor: "bg-red-100 text-red-700" },
  { value: "style" as const, label: "Style / Tone", icon: Palette, color: "bg-violet-50 text-violet-600 border-violet-200", chipColor: "bg-violet-100 text-violet-700" },
  { value: "instruction" as const, label: "Instructions", icon: Lightbulb, color: "bg-amber-50 text-amber-600 border-amber-200", chipColor: "bg-amber-100 text-amber-700" },
];

export default function PreferencesPage() {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<Preference["category"]>("like");
  const [saving, setSaving] = useState(false);

  const fetchPreferences = async () => {
    try {
      const res = await fetch("/api/preferences");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPreferences(data.preferences || []);
    } catch { toast.error("Failed to load preferences"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPreferences(); }, []);

  const addPreference = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim(), category }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast.success("Preference saved");
      setNote("");
      fetchPreferences();
    } catch (err: any) { toast.error(err.message || "Failed to save"); }
    finally { setSaving(false); }
  };

  const deletePreference = async (id: string) => {
    try {
      const res = await fetch(`/api/preferences?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Removed");
      setPreferences((prev) => prev.filter((p) => p.id !== id));
    } catch { toast.error("Failed to delete"); }
  };

  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    items: preferences.filter((p) => p.category === cat.value),
  }));

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="spinner" /></div>;

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          Content Preferences
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Tell us what you like and dislike about generated content. These preferences are automatically applied to all future generations.
        </p>
      </div>

      {/* Add New Preference */}
      <div className="card p-5 mb-8">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Add a preference</p>

        <div className="flex gap-2 mb-3">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = category === cat.value;
            return (
              <button key={cat.value} onClick={() => setCategory(cat.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  isActive ? cat.color : "border-gray-200 text-gray-400 hover:border-gray-300"
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {cat.label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !saving) addPreference(); }}
            placeholder={
              category === "like" ? "e.g. I like when hooks use a specific number or stat" :
              category === "dislike" ? "e.g. I dislike generic filler phrases and long intros" :
              category === "style" ? "e.g. Keep tone conversational, like talking to a friend" :
              "e.g. Always mention the founders' background in reels"
            }
            className="input-field flex-1"
            disabled={saving}
          />
          <button onClick={addPreference} disabled={saving || !note.trim()}
            className="btn-primary px-4 py-2.5 text-sm flex items-center gap-1.5 disabled:opacity-50">
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      </div>

      {/* Grouped Preferences */}
      {preferences.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">No preferences yet.</p>
          <p className="text-xs text-gray-400 mt-1">Add notes about what you like or dislike in generated content.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.filter((g) => g.items.length > 0).map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.value}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-4 h-4 text-gray-400" />
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{group.label}</p>
                  <span className="badge bg-gray-100 text-gray-500 text-[10px]">{group.items.length}</span>
                </div>
                <div className="space-y-2">
                  {group.items.map((pref) => (
                    <div key={pref.id} className="card p-3.5 flex items-start justify-between gap-3 animate-fade-in">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800">{pref.note}</p>
                        <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {format(new Date(pref.created_at), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      <button onClick={() => deletePreference(pref.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* How it works */}
      {preferences.length > 0 && (
        <div className="mt-8 p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
          <p className="text-xs font-medium text-blue-800 mb-1">How preferences work</p>
          <p className="text-xs text-blue-600/80 leading-relaxed">
            Your preferences are automatically injected into every content generation prompt (hooks, scripts, carousel, captions, and refinement).
            When you revise content using the input box on a startup page, preferences are included there too.
          </p>
        </div>
      )}
    </div>
  );
}
