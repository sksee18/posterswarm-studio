"use server";

import { revalidatePath } from "next/cache";
import { db, settings } from "@/db";
import { encrypt } from "@/lib/crypto";
import { DEFAULT_AI_MODEL } from "@/lib/ai-config";
import { DEFAULT_AI_BASE_URL, normalizeBaseUrl, verifyAiKey } from "@/lib/openai-key";

export async function saveAiKey(apiKey: string, rawBaseUrl = "", rawModel = "") {
  const key = apiKey.trim();
  if (!key) throw new Error("Enter an API key.");
  const baseUrl = normalizeBaseUrl(rawBaseUrl);
  const model = rawModel.trim() || DEFAULT_AI_MODEL;
  await verifyAiKey(key, baseUrl, model);
  await db.insert(settings).values({ id: "local", aiApiKey: encrypt(key), aiKeyHint: key.slice(-4), aiBaseUrl: baseUrl, aiModel: model, updatedAt: new Date() }).onConflictDoUpdate({ target: settings.id, set: { aiApiKey: encrypt(key), aiKeyHint: key.slice(-4), aiBaseUrl: baseUrl, aiModel: model, updatedAt: new Date() } });
  revalidatePath("/settings");
}

export async function removeAiKey() {
  await db.insert(settings).values({ id: "local", aiBaseUrl: DEFAULT_AI_BASE_URL, aiModel: DEFAULT_AI_MODEL }).onConflictDoUpdate({ target: settings.id, set: { aiApiKey: null, aiKeyHint: null, aiBaseUrl: DEFAULT_AI_BASE_URL, aiModel: DEFAULT_AI_MODEL, updatedAt: new Date() } });
  revalidatePath("/settings");
}
