import { MONITOR_PROMPTS } from "@/config/api-keys";

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  maxTokens: number = 2048
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

interface AnalysisResult {
  summary: string;
  topics: string[];
  tools_mentioned: string[];
  content_ideas: string[];
  key_insights: string[];
  content_type: string;
}

function parseAnalysis(raw: string): AnalysisResult {
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      summary: raw.substring(0, 500),
      topics: [],
      tools_mentioned: [],
      content_ideas: [],
      key_insights: [],
      content_type: "unknown",
    };
  }
}

export async function analyzeVideoContent(
  title: string,
  transcript: string,
  channelName: string,
  openaiKey: string
): Promise<AnalysisResult> {
  if (!transcript || transcript.length < 50) {
    return {
      summary: `Video "${title}" by ${channelName}. Transcript not available for analysis.`,
      topics: [],
      tools_mentioned: [],
      content_ideas: [`Research "${title}" topic and create our own take`],
      key_insights: [],
      content_type: "unknown",
    };
  }

  const trimmed = transcript.substring(0, 15000);
  const userPrompt = `Video Title: "${title}"
Channel: ${channelName}

Transcript:
${trimmed}`;

  const raw = await callOpenAI(
    MONITOR_PROMPTS.summarize_video,
    userPrompt,
    openaiKey
  );

  return parseAnalysis(raw);
}

export async function analyzeInstagramContent(
  caption: string,
  username: string,
  openaiKey: string
): Promise<AnalysisResult> {
  if (!caption || caption.length < 10) {
    return {
      summary: `Post by @${username}. Caption too short for analysis.`,
      topics: [],
      tools_mentioned: [],
      content_ideas: [],
      key_insights: [],
      content_type: "unknown",
    };
  }

  const userPrompt = `Instagram Post by @${username}:

${caption}`;

  const raw = await callOpenAI(
    MONITOR_PROMPTS.summarize_instagram,
    userPrompt,
    openaiKey
  );

  return parseAnalysis(raw);
}
