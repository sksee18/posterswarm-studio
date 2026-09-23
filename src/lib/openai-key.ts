// no imports on purpose: ai-usage.ts imports this file, and pulling the db in
// the other direction would make the standalone key test need a database
const OPENAI_MODEL = process.env.LLM_MODEL ?? "gpt-5.6-luna";

export const DEFAULT_AI_BASE_URL = "https://api.openai.com/v1";

/** Any base that speaks the OpenAI **Responses** API is fine: OpenAI itself,
 *  OpenRouter (https://openrouter.ai/api/v1), an Azure or self-hosted gateway.
 *  chatJson only ever speaks Responses, so a chat-completions-only provider
 *  fails verification here rather than at generate time. */
export function normalizeBaseUrl(raw: string): string {
  const url = raw.trim().replace(/\/+$/, "");
  if (!url) return DEFAULT_AI_BASE_URL;
  // https only: the key travels in the Authorization header
  if (!/^https:\/\//i.test(url)) throw new Error("Base URL must start with https://");
  // a paste of the full endpoint is the obvious mistake, so accept it
  return url.replace(/\/responses$/, "");
}

export async function verifyAiKey(
  key: string,
  baseUrl: string = DEFAULT_AI_BASE_URL,
  model: string = OPENAI_MODEL,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const rejected = new Error(
    `${new URL(baseUrl).host} could not verify this key for ${model}.`,
  );
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "low" },
        input: "Reply with OK.",
        max_output_tokens: 16,
      }),
    });
  } catch {
    throw rejected;
  }
  if (!response.ok) throw rejected;
}
