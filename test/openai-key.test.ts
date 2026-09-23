import assert from "node:assert/strict";
import { DEFAULT_AI_BASE_URL, normalizeBaseUrl, verifyAiKey } from "../src/lib/openai-key";

async function main() {
  let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;
  const ok = async (input: RequestInfo | URL, init?: RequestInit) => {
    request = { input, init };
    return new Response("{}", { status: 200 });
  };

  await verifyAiKey("sk-secret-value", undefined, undefined, ok);
  assert.equal(request?.input, "https://api.openai.com/v1/responses");
  assert.equal(new Headers(request?.init?.headers).get("Authorization"), "Bearer sk-secret-value");
  const body = JSON.parse(String(request?.init?.body));
  assert.equal(body.store, false);
  assert.equal(body.reasoning.effort, "low");

  // a non-OpenAI provider: base and model both travel
  await verifyAiKey("sk-or-1", "https://openrouter.ai/api/v1", "openai/gpt-5.6", ok);
  assert.equal(request?.input, "https://openrouter.ai/api/v1/responses");
  assert.equal(JSON.parse(String(request?.init?.body)).model, "openai/gpt-5.6");

  assert.equal(normalizeBaseUrl(""), DEFAULT_AI_BASE_URL);
  assert.equal(normalizeBaseUrl(" https://openrouter.ai/api/v1/ "), "https://openrouter.ai/api/v1");
  // pasting the whole endpoint is the obvious mistake
  assert.equal(normalizeBaseUrl("https://openrouter.ai/api/v1/responses"), "https://openrouter.ai/api/v1");
  assert.throws(() => normalizeBaseUrl("http://openrouter.ai/api/v1"), /https/);

  // failures never leak the provider's own message
  await assert.rejects(
    verifyAiKey("bad", undefined, undefined, async () => new Response("provider secret", { status: 401 })),
    { message: "api.openai.com could not verify this key for gpt-5.6-luna." },
  );
  await assert.rejects(
    verifyAiKey("bad", "https://openrouter.ai/api/v1", "z/model", async () => { throw new Error("network details"); }),
    { message: "openrouter.ai could not verify this key for z/model." },
  );

  console.log("AI key verification checks passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
