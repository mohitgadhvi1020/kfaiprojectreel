"use client";

import { useEffect, useState } from "react";
import { Save, Loader2, Key, MessageSquare, Eye, EyeOff, CheckCircle, Plus, X, Shield, Twitter, User } from "lucide-react";
import toast from "react-hot-toast";

interface Settings {
  id?: string; perplexity_api_key: string; openai_api_key: string;
  supabase_url: string; supabase_anon_key: string; supabase_service_key: string;
  instagram_handle: string; creator_name: string; creator_bio: string;
  x_tracked_accounts: string[]; content_tone: string;
}

const defaults: Settings = {
  perplexity_api_key: "", openai_api_key: "",
  supabase_url: "", supabase_anon_key: "", supabase_service_key: "",
  instagram_handle: "mohit.builds.ai", creator_name: "Mohit",
  creator_bio: "IIT Bombay engineer, 6 years in tech",
  x_tracked_accounts: ["@karpathy","@dair_ai","@rasbt","@svpino","@_philschmid","@hwchung27","@ClementDelworker","@TheAITimeline","@ai_for_success"],
  content_tone: "Builder explaining architecture to a smart friend. Confident, not salesy. Fast-paced, zero filler.",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [newAccount, setNewAccount] = useState("");

  useEffect(() => {
    fetch("/api/settings").then(r => r.ok ? r.json() : defaults).then(d => setSettings({ ...defaults, ...d })).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Settings saved!");
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setSaving(false); }
  };

  const set = (f: keyof Settings, v: any) => setSettings(p => ({ ...p, [f]: v }));

  const KeyField = ({ label, field, placeholder, desc, required }: { label: string; field: keyof Settings; placeholder: string; desc?: string; required?: boolean }) => {
    const val = settings[field] as string;
    const vis = showKeys[field as string];
    return (
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
          {label}{required && <span className="text-red-400">*</span>}
          {val && !val.startsWith("••••") && <CheckCircle className="w-3 h-3 text-green-500" />}
        </label>
        {desc && <p className="text-xs text-gray-400 mb-1.5">{desc}</p>}
        <div className="relative">
          <input
            type={vis ? "text" : "password"}
            value={val}
            onChange={e => set(field, e.target.value)}
            placeholder={placeholder}
            className="input-field pr-10"
            name={`apikey_${field as string}_${Math.random().toString(36).slice(2, 8)}`}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            spellCheck={false}
          />
          <button type="button" onClick={() => setShowKeys(p => ({ ...p, [field as string]: !p[field as string] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {vis ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
    );
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="spinner" /></div>;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-400 mt-0.5">API keys, brand identity, tracked accounts</p>
        </div>
        <button onClick={save} disabled={saving} className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><Save className="w-4 h-4" />Save</>}
        </button>
      </div>

      <div className="space-y-6">
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5"><Key className="w-4 h-4 text-blue-600" /><h2 className="text-sm font-semibold text-gray-900">AI Provider Keys</h2></div>
          <div className="space-y-4">
            <KeyField label="Perplexity API Key" field="perplexity_api_key" placeholder="pplx-..." required desc="Discovery & deep research (sonar-pro)" />
            <KeyField label="OpenAI API Key" field="openai_api_key" placeholder="sk-proj-..." required desc="Hook generation, script writing & refinement (GPT-4o)" />
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5"><User className="w-4 h-4 text-blue-600" /><h2 className="text-sm font-semibold text-gray-900">Brand Identity</h2></div>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Instagram Handle</label>
              <input type="text" value={settings.instagram_handle} onChange={e => set("instagram_handle", e.target.value)} className="input-field" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Creator Name</label>
                <input type="text" value={settings.creator_name} onChange={e => set("creator_name", e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Creator Bio</label>
                <input type="text" value={settings.creator_bio} onChange={e => set("creator_bio", e.target.value)} className="input-field" />
              </div>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5"><Twitter className="w-4 h-4 text-blue-600" /><h2 className="text-sm font-semibold text-gray-900">Tracked X Accounts</h2></div>
          <div className="flex flex-wrap gap-2 mb-3">
            {settings.x_tracked_accounts.map(h => (
              <span key={h} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-xs text-gray-700">
                {h}
                <button onClick={() => set("x_tracked_accounts", settings.x_tracked_accounts.filter(a => a !== h))} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newAccount} onChange={e => setNewAccount(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newAccount.trim()) { const h = newAccount.trim().startsWith("@") ? newAccount.trim() : "@" + newAccount.trim(); if (!settings.x_tracked_accounts.includes(h)) set("x_tracked_accounts", [...settings.x_tracked_accounts, h]); setNewAccount(""); } }}
              placeholder="@username" className="input-field flex-1" />
            <button onClick={() => { if (newAccount.trim()) { const h = newAccount.trim().startsWith("@") ? newAccount.trim() : "@" + newAccount.trim(); if (!settings.x_tracked_accounts.includes(h)) set("x_tracked_accounts", [...settings.x_tracked_accounts, h]); setNewAccount(""); }}}
              className="px-3 py-2 border border-gray-200 rounded-lg text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors"><Plus className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5"><MessageSquare className="w-4 h-4 text-blue-600" /><h2 className="text-sm font-semibold text-gray-900">Content Tone</h2></div>
          <textarea value={settings.content_tone} onChange={e => set("content_tone", e.target.value)} rows={3} className="input-field resize-none" />
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5"><Shield className="w-4 h-4 text-blue-600" /><h2 className="text-sm font-semibold text-gray-900">Supabase (Optional)</h2></div>
          <p className="text-xs text-gray-400 mb-4">Leave empty to use local storage. Set these to enable cloud database.</p>
          <div className="space-y-4">
            <div><label className="text-sm font-medium text-gray-700 mb-1 block">Supabase URL</label>
              <input type="text" value={settings.supabase_url} onChange={e => set("supabase_url", e.target.value)} placeholder="https://your-project.supabase.co" className="input-field" /></div>
            <KeyField label="Supabase Anon Key" field="supabase_anon_key" placeholder="eyJ..." />
            <KeyField label="Supabase Service Key" field="supabase_service_key" placeholder="eyJ..." />
          </div>
        </div>
      </div>
    </div>
  );
}
