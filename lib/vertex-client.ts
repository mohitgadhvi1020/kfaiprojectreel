/**
 * LLM client for content generation (hooks, scripts, carousel, refinement).
 *
 * NOTE: This module used to call Google Vertex AI (Gemini). It now delegates to
 * OpenAI so the whole app runs on a single provider. The exported names
 * (`callVertex`, `vertexPing`) are kept unchanged so existing call sites don't
 * need to be touched.
 *
 * Auth: OPENAI_API_KEY env var.
 * Default model: gpt-4o. Override per-call via the `model` param or globally
 * via OPENAI_MODEL env (VERTEX_MODEL is still honored as a fallback for
 * backwards compatibility, but only if it names an OpenAI model).
 */

const DEFAULT_MODEL =
  process.env.OPENAI_MODEL ||
  (process.env.VERTEX_MODEL && /^gpt|^o\d/i.test(process.env.VERTEX_MODEL)
    ? process.env.VERTEX_MODEL
    : "gpt-4o");

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Parse "Please try again in 6.596s" from OpenAI 429 messages
function parseRetryDelayMs(errText: string): number | null {
  const m = errText.match(/try again in ([\d.]+)s/i);
  if (m) return Math.ceil(parseFloat(m[1]) * 1000);
  const ms = errText.match(/try again in (\d+)ms/i);
  if (ms) return parseInt(ms[1], 10);
  return null;
}

export interface VertexCallOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

/**
 * Send a system + user prompt to OpenAI and return the raw text.
 * Retries on 429 / 5xx with exponential backoff + jitter.
 */
export async function callVertex(
  systemPrompt: string,
  userPrompt: string,
  options: VertexCallOptions = {}
): Promise<string> {
  const {
    maxTokens = 8192,
    temperature = 0.7,
    model = DEFAULT_MODEL,
  } = options;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenAI: OPENAI_API_KEY not set. Check .env.local and restart the dev server."
    );
  }

  const MAX_ATTEMPTS = 4;
  let lastErr = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
    } catch (err: any) {
      // Network-level error -- treat as retryable
      lastErr = String(err?.message || err);
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`OpenAI API error (network) on attempt ${attempt}: ${lastErr}`);
      }
      const waitMs = Math.min(30000, 1000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 500);
      console.warn(`[llm] network error on attempt ${attempt}/${MAX_ATTEMPTS}; retrying in ${waitMs}ms`);
      await sleep(waitMs);
      continue;
    }

    if (response.ok) {
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";
      if (!text || text.trim().length === 0) {
        // Empty response -- treat as retryable
        lastErr = "OpenAI returned empty text";
        if (attempt === MAX_ATTEMPTS) throw new Error(lastErr);
        await sleep(1000 * attempt);
        continue;
      }
      return text;
    }

    const err = await response.text();
    lastErr = err;

    // Retry on 429 (rate limit) and 5xx (transient server errors)
    const retryable = response.status === 429 || (response.status >= 500 && response.status < 600);
    if (!retryable || attempt === MAX_ATTEMPTS) {
      throw new Error(`OpenAI API error (${response.status}) on attempt ${attempt}: ${err}`);
    }

    // Prefer server-provided delay; otherwise exponential backoff with jitter
    const retryAfterHeader = response.headers.get("retry-after");
    const hintedMs = retryAfterHeader
      ? parseInt(retryAfterHeader, 10) * 1000
      : parseRetryDelayMs(err);
    const backoffMs = hintedMs ?? Math.min(30000, 1000 * 2 ** (attempt - 1));
    const waitMs = backoffMs + Math.floor(Math.random() * 500);

    console.warn(
      `[llm] ${response.status} on attempt ${attempt}/${MAX_ATTEMPTS}; retrying in ${waitMs}ms`
    );
    await sleep(waitMs);
  }

  throw new Error(`OpenAI API error (exhausted retries): ${lastErr}`);
}

/**
 * Smoke-test target for the Settings page "test connection" flow.
 * Sends "ping" to OpenAI and returns true if we got any text back.
 */
export async function vertexPing(): Promise<{
  ok: boolean;
  model: string;
  project: string;
  location: string;
  message?: string;
}> {
  try {
    const text = await callVertex("You respond with one word only.", "ping", {
      maxTokens: 16,
      temperature: 0,
    });
    return {
      ok: true,
      model: DEFAULT_MODEL,
      project: "openai",
      location: "-",
      message: text.trim().slice(0, 80),
    };
  } catch (err: any) {
    return {
      ok: false,
      model: DEFAULT_MODEL,
      project: "openai",
      location: "-",
      message: String(err?.message || err).slice(0, 200),
    };
  }
}
