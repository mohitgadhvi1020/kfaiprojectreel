"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Film, Play, Download, Loader2, CheckCircle, AlertCircle, Users, Clock, Sparkles, Image as ImageIcon } from "lucide-react";

interface CharacterSet {
  id: string;
  theme: string;
  description: string;
  characterA: { name: string; avatarPath: string };
  characterB: { name: string; avatarPath: string };
}

type JobStatus =
  | "generating_script"
  | "generating_voices"
  | "rendering"
  | "completed"
  | "script_only"
  | "failed";

interface JobInfo {
  id: string;
  status: JobStatus;
  topic: string;
  characterSetId: string;
  scriptPreview: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  downloadUrl: string | null;
}

const STATUS_LABELS: Record<JobStatus, string> = {
  generating_script: "Writing Dialogue Script...",
  generating_voices: "Generating Character Voices...",
  rendering: "Rendering Video...",
  completed: "Video Ready!",
  script_only: "Script Ready (no ElevenLabs key)",
  failed: "Generation Failed",
};

const STEP_ORDER: JobStatus[] = [
  "generating_script",
  "generating_voices",
  "rendering",
  "completed",
];

export default function VideoPage() {
  const [characterSets, setCharacterSets] = useState<CharacterSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<string>("");
  const [topic, setTopic] = useState("");
  const [targetDuration, setTargetDuration] = useState(60);
  const [backgrounds, setBackgrounds] = useState<{ path: string; name: string }[]>([]);
  const [backgroundPath, setBackgroundPath] = useState<string>("backgrounds/bg-short.mp4");
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobInfo | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch("/api/video/character-sets")
      .then((r) => r.json())
      .then((data) => {
        setCharacterSets(data.characterSets || []);
      })
      .catch(console.error);
    fetch("/api/video/backgrounds")
      .then((r) => r.json())
      .then((data) => {
        const list = data.backgrounds || [];
        setBackgrounds(list);
        if (list.length && !list.some((b: any) => b.path === "backgrounds/bg-short.mp4")) {
          setBackgroundPath(list[0].path);
        }
      })
      .catch(console.error);
  }, []);

  const pollJob = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    const poll = async () => {
      try {
        const res = await fetch(`/api/video/${id}`);
        const data: JobInfo = await res.json();
        setJob(data);
        if (
          data.status === "completed" ||
          data.status === "failed" ||
          data.status === "script_only"
        ) {
          if (pollRef.current) clearInterval(pollRef.current);
          setLoading(false);
        }
      } catch {
        // Keep polling on network errors
      }
    };

    poll();
    pollRef.current = setInterval(poll, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleGenerate = async () => {
    if (!topic.trim() || !selectedSet) return;

    setLoading(true);
    setJob(null);
    setJobId(null);

    try {
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          characterSetId: selectedSet,
          targetDuration,
          backgroundVideoPath: backgroundPath,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setLoading(false);
        setJob({
          id: "",
          status: "failed",
          topic: topic.trim(),
          characterSetId: selectedSet,
          scriptPreview: null,
          error: data.error || "Unknown error",
          createdAt: new Date().toISOString(),
          completedAt: null,
          downloadUrl: null,
        });
        return;
      }

      setJobId(data.jobId);
      pollJob(data.jobId);
    } catch (err: any) {
      setLoading(false);
      setJob({
        id: "",
        status: "failed",
        topic: topic.trim(),
        characterSetId: selectedSet,
        scriptPreview: null,
        error: err.message || "Network error",
        createdAt: new Date().toISOString(),
        completedAt: null,
        downloadUrl: null,
      });
    }
  };

  const selectedCharSet = characterSets.find((cs) => cs.id === selectedSet);

  const currentStepIndex = job ? STEP_ORDER.indexOf(job.status) : -1;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Film className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Video Generator</h1>
            <p className="text-sm text-gray-500">
              Generate character dialogue videos with AI voices
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Character Selection */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Choose Characters
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {characterSets.map((cs) => (
                <button
                  key={cs.id}
                  onClick={() => setSelectedSet(cs.id)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    selectedSet === cs.id
                      ? "border-purple-500 bg-purple-50 shadow-sm"
                      : "border-gray-200 hover:border-purple-300 bg-white"
                  }`}
                >
                  <div className="text-sm font-semibold text-gray-900 mb-1">
                    {cs.theme}
                  </div>
                  <div className="text-xs text-gray-500">
                    {cs.characterA.name} vs {cs.characterB.name}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Topic Input */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Topic / Content
            </h2>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Enter the topic for the dialogue... e.g., 'AI is replacing software engineers' or 'Bitcoin hitting $100k' or paste content from your pipeline"
              className="input-field min-h-[120px] resize-y"
              rows={4}
            />

            <div className="mt-4 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <label className="text-sm text-gray-600">Duration:</label>
                <select
                  value={targetDuration}
                  onChange={(e) => setTargetDuration(Number(e.target.value))}
                  className="input-field w-auto py-1.5 px-3"
                >
                  <option value={30}>30 sec</option>
                  <option value={45}>45 sec</option>
                  <option value={60}>60 sec</option>
                  <option value={90}>90 sec</option>
                  <option value={120}>2 min</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-gray-400" />
                <label className="text-sm text-gray-600">Background:</label>
                <select
                  value={backgroundPath}
                  onChange={(e) => setBackgroundPath(e.target.value)}
                  className="input-field w-auto py-1.5 px-3"
                  disabled={backgrounds.length === 0}
                >
                  {backgrounds.length === 0 ? (
                    <option value="">No backgrounds found</option>
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
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !topic.trim() || !selectedSet}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Generate Video
              </>
            )}
          </button>
        </div>

        {/* Right column: Status & Preview */}
        <div className="space-y-6">
          {/* Selected Characters Info */}
          {selectedCharSet && (
            <div className="card p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Selected Theme
              </h3>
              <p className="text-sm font-semibold text-gray-900 mb-1">
                {selectedCharSet.theme}
              </p>
              <p className="text-xs text-gray-500 mb-3">
                {selectedCharSet.description}
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">
                    {selectedCharSet.characterA.name.charAt(0)}
                  </div>
                  <span className="text-sm text-gray-700">
                    {selectedCharSet.characterA.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-xs font-bold text-pink-600">
                    {selectedCharSet.characterB.name.charAt(0)}
                  </div>
                  <span className="text-sm text-gray-700">
                    {selectedCharSet.characterB.name}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Progress / Status */}
          {job && (
            <div className="card p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Pipeline Status
              </h3>

              {/* Progress Steps */}
              <div className="space-y-3 mb-4">
                {STEP_ORDER.map((step, i) => {
                  const isActive = job.status === step;
                  const isDone = currentStepIndex > i;
                  const isFailed = job.status === "failed";
                  return (
                    <div
                      key={step}
                      className="flex items-center gap-3"
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isDone
                            ? "bg-green-100"
                            : isActive
                              ? isFailed
                                ? "bg-red-100"
                                : "bg-blue-100"
                              : "bg-gray-100"
                        }`}
                      >
                        {isDone ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : isActive && !isFailed ? (
                          <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                        ) : isActive && isFailed ? (
                          <AlertCircle className="w-4 h-4 text-red-600" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-gray-300" />
                        )}
                      </div>
                      <span
                        className={`text-sm ${
                          isDone
                            ? "text-green-700 font-medium"
                            : isActive
                              ? isFailed
                                ? "text-red-700 font-medium"
                                : "text-blue-700 font-medium"
                              : "text-gray-400"
                        }`}
                      >
                        {STATUS_LABELS[step]}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Error */}
              {job.status === "failed" && job.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {job.error}
                </div>
              )}

              {/* Download */}
              {job.status === "completed" && job.downloadUrl && (
                <a
                  href={job.downloadUrl}
                  className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-sm mt-3"
                  download
                >
                  <Download className="w-4 h-4" />
                  Download Video
                </a>
              )}
            </div>
          )}

          {/* Script Preview */}
          {job?.scriptPreview && (
            <div className="card p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Script Preview
              </h3>
              <div className="text-xs text-gray-600 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed font-mono bg-gray-50 rounded-lg p-3">
                {job.scriptPreview}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
