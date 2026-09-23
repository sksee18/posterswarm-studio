import { eq } from "drizzle-orm";
import { db, settings } from "@/db";
import { decrypt } from "./crypto";
import { DEFAULT_AI_BASE_URL } from "./openai-key";

export const DEFAULT_AI_MODEL = "gpt-5-mini";

export async function getAiConfig() {
  const [row] = await db.select().from(settings).where(eq(settings.id, "local"));
  if (!row?.aiApiKey) throw new Error("Add an AI API key in Settings first.");
  try {
    return {
      key: decrypt(row.aiApiKey),
      baseUrl: row.aiBaseUrl || DEFAULT_AI_BASE_URL,
      model: row.aiModel || DEFAULT_AI_MODEL,
    };
  } catch {
    throw new Error("The saved API key could not be read. Replace it in Settings.");
  }
}
