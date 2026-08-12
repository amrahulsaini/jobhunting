import { vertexConfigured, vertexEndpoint, vertexHeaders } from "./vertex";

/**
 * Single entry point for every model call.
 *
 * Two transports sit behind it — Vertex AI (service-account / ADC auth, the
 * production path) and the Gemini API (API key, useful for quick local work).
 * The request and response bodies are identical between them; only the URL and
 * the auth header differ, so callers never need to know which is in use.
 */

const AI_STUDIO_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type Provider = "vertex" | "gemini";

export function provider(): Provider {
  const explicit = process.env.AI_PROVIDER?.toLowerCase();
  if (explicit === "vertex" || explicit === "gemini") return explicit;
  // Prefer Vertex whenever a project is configured; fall back to the API key.
  return vertexConfigured() ? "vertex" : "gemini";
}

export class GeminiError extends Error {}

/**
 * Model selection, per task.
 *
 * Benchmarked against the real briefing prompt (same evidence, same schema):
 *
 *   model                  time    raw $     projects  caught a planted inconsistency
 *   gemini-3.1-flash-lite   7.2s   $0.0021      6/6    yes
 *   gemini-3.5-flash-lite   6.0s   $0.0041      6/6    yes
 *   gemini-2.5-flash       25.0s   $0.0119      6/6    NO
 *   gemini-3.5-flash       19.5s   $0.0390      6/6    yes
 *   gemini-3.6-flash       26.4s   $0.0441      6/6    yes
 *   gemini-3.1-pro-preview  ~60s   $0.0640      6/6    yes
 *
 * flash-lite won outright: ~30x cheaper and ~8x faster than pro, with no loss
 * of analytical quality on this task. Pro is also the first model to hit
 * project quota, so it fails under load precisely when it matters.
 *
 * Each task is separately overridable, so a harder step can be promoted to a
 * bigger model without moving everything.
 */
export const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";

export const MODELS = {
  /** Structured extraction from a PDF — mechanical, needs no reasoning depth. */
  parse: process.env.GEMINI_MODEL_PARSE ?? DEFAULT_MODEL,
  /** The briefing — the most analytical step in the product. */
  briefing: process.env.GEMINI_MODEL_BRIEFING ?? DEFAULT_MODEL,
  /** Outreach drafting. */
  draft: process.env.GEMINI_MODEL_DRAFT ?? DEFAULT_MODEL,
} as const;

export interface GeneratePart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  provider: Provider;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface GenerateResult {
  text: string;
  usage: TokenUsage;
  /** Queries the model actually ran, when search grounding is enabled. */
  searchQueries?: string[];
  sources?: GroundingSource[];
}

async function target(model: string): Promise<{ url: string; headers: Record<string, string> }> {
  if (provider() === "vertex") {
    return { url: vertexEndpoint(model), headers: await vertexHeaders() };
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("GEMINI_API_KEY is not set.");
  return {
    url: `${AI_STUDIO_BASE}/models/${model}:generateContent?key=${key}`,
    headers: { "Content-Type": "application/json" },
  };
}

export async function generate({
  model = DEFAULT_MODEL,
  parts,
  schema,
  system,
  maxOutputTokens = 4096,
  tools,
}: {
  model?: string;
  parts: GeneratePart[];
  schema?: Record<string, unknown>;
  system?: string;
  maxOutputTokens?: number;
  /** e.g. [{ googleSearch: {} }] to ground the answer in live search results. */
  tools?: Record<string, unknown>[];
}): Promise<GenerateResult> {
  const { url, headers } = await target(model);

  const body = JSON.stringify({
    // Vertex requires an explicit role; the Gemini API accepts it too.
    contents: [{ role: "user", parts }],
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    ...(tools ? { tools } : {}),
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens,
      ...(schema ? { responseMimeType: "application/json", responseSchema: schema } : {}),
    },
  });

  /**
   * Quota (429) and transient backend errors (500/503) are worth retrying —
   * shared project quota recovers within seconds, and losing a minute of
   * crawling to a momentary limit would be a poor trade. Anything else is a
   * real error and fails immediately.
   */
  let json: Record<string, unknown> = {};
  let lastError = "";

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(180_000),
    });
    json = await res.json();

    if (res.ok) { lastError = ""; break; }

    const error = json?.error as { message?: string } | undefined;
    lastError = error?.message ?? `${provider()} HTTP ${res.status}`;

    const retryable = res.status === 429 || res.status === 500 || res.status === 503;
    if (!retryable || attempt === 3) throw new GeminiError(lastError);

    // Exponential backoff with jitter, so parallel calls don't retry in lockstep.
    const wait = 2000 * 2 ** attempt + Math.random() * 1000;
    await new Promise(r => setTimeout(r, wait));
  }

  if (lastError) throw new GeminiError(lastError);

  const payload = json as {
    candidates?: {
      content?: { parts?: GeneratePart[] };
      finishReason?: string;
      groundingMetadata?: { webSearchQueries?: string[]; groundingChunks?: { web?: { uri?: string; title?: string } }[] };
    }[];
    usageMetadata?: Record<string, number>;
  };
  const text: string = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((p: GeneratePart) => p.text ?? "")
    .join("");

  if (!text) {
    const reason = payload.candidates?.[0]?.finishReason ?? "empty response";
    throw new GeminiError(`Model returned no text (${reason})`);
  }

  // Token counts come back on every response; billing reads these rather than
  // estimating, so what we charge always matches what we were charged.
  const meta = payload.usageMetadata ?? {};
  const grounding = payload.candidates?.[0]?.groundingMetadata;

  return {
    text,
    searchQueries: grounding?.webSearchQueries ?? [],
    sources: (grounding?.groundingChunks ?? [])
      .map(c => ({ title: c.web?.title ?? "", uri: c.web?.uri ?? "" }))
      .filter(s => s.uri),
    usage: {
      model,
      inputTokens: Number(meta.promptTokenCount ?? 0),
      // Thinking tokens bill as output, so they must be included.
      outputTokens:
        Number(meta.candidatesTokenCount ?? 0) + Number(meta.thoughtsTokenCount ?? 0),
      provider: provider(),
    },
  };
}

export async function generateJson<T>(
  args: Parameters<typeof generate>[0]
): Promise<{ data: T; usage: TokenUsage }> {
  const { text, usage } = await generate(args);
  try {
    return { data: JSON.parse(text.replace(/^```json\s*|```$/g, "").trim()) as T, usage };
  } catch {
    throw new GeminiError(`Model returned unparseable JSON: ${text.slice(0, 200)}`);
  }
}
