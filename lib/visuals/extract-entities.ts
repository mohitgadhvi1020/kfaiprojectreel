/**
 * Pull the searchable entities out of a script or topic blob — tool names,
 * model names, brand names. Used to build YouTube search queries.
 *
 * Why an LLM and not regex? Tool names don't follow a pattern: "Cursor",
 * "Claude 4 Code", "DeepSeek V4", "PixVerse 3", "Whisper Turbo" — proper-noun
 * detection is exactly what models are good at. We use gpt-4o-mini so it
 * stays cheap (<$0.001 per call typically).
 *
 * Returns at most `max` entities, dedup'd, in the order the model surfaces
 * them (which is roughly importance order). If the model fails, we fall back
 * to a quick capitalized-word extractor so the caller still gets something.
 */

const SYSTEM = `You extract searchable entities from AI/tech content. Return ONLY a JSON array of strings, no prose. Each string is a specific tool, model, product, or brand name that someone could search for on YouTube to find a demo. Skip generic words ("AI", "model", "the user"). Skip people's names unless they are the subject. Maximum 5 entities.`;

export async function extractEntities(
  text: string,
  openaiKey: string,
  max: number = 5
): Promise<string[]> {
  const trimmed = text.slice(0, 4000);
  if (!openaiKey) return naiveExtract(trimmed, max);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Extract entities from this content. Return JSON array only:\n\n${trimmed}`,
          },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error("[entities] OpenAI failed:", res.status);
      return naiveExtract(trimmed, max);
    }
    const data = await res.json();
    let raw: string = data.choices?.[0]?.message?.content || "";
    // We asked for json_object → model will wrap the array, e.g. {"entities":[..]}.
    // Be lenient about the shape it picks.
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return naiveExtract(trimmed, max);
    }
    let arr: any[] = [];
    if (Array.isArray(parsed)) arr = parsed;
    else if (Array.isArray(parsed.entities)) arr = parsed.entities;
    else if (Array.isArray(parsed.items)) arr = parsed.items;
    else if (Array.isArray(parsed.values)) arr = parsed.values;
    else {
      // Take the first array value we find in the object.
      for (const v of Object.values(parsed)) {
        if (Array.isArray(v)) {
          arr = v;
          break;
        }
      }
    }
    const cleaned = arr
      .map((x) => String(x || "").trim())
      .filter((s) => s.length > 1 && s.length < 60);
    return Array.from(new Set(cleaned)).slice(0, max);
  } catch (err) {
    console.error("[entities] error:", err);
    return naiveExtract(trimmed, max);
  }
}

/**
 * Cheap fallback: pull capitalized noun phrases. Good enough to keep the
 * pipeline running if OpenAI is down. Filters generic capitalized words.
 */
const STOPWORDS = new Set([
  "AI",
  "API",
  "I",
  "The",
  "A",
  "An",
  "This",
  "That",
  "It",
  "Demo",
  "Tool",
  "Model",
  "App",
]);

function naiveExtract(text: string, max: number): string[] {
  const matches = text.match(/[A-Z][a-zA-Z0-9]+(?:\s[A-Z0-9][a-zA-Z0-9]+){0,3}/g) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const t = m.trim();
    if (STOPWORDS.has(t)) continue;
    if (t.length < 3) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
