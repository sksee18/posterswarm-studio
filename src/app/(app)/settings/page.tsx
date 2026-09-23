import { eq } from "drizzle-orm";
import { db, settings } from "@/db";
import { PageHeader } from "@/components/ui/page-header";
import { LanguagePicker } from "@/components/language-picker";
import { DEFAULT_AI_BASE_URL } from "@/lib/openai-key";
import { DEFAULT_AI_MODEL } from "@/lib/ai-config";
import { OpenAiKey } from "./openai-key-client";

export default async function SettingsPage() {
  const [config] = await db.select().from(settings).where(eq(settings.id, "local"));
  return <div className="max-w-2xl space-y-6">
    <PageHeader title="Settings" />
    <p className="-mt-4 text-sm text-muted">Your key and data stay on this machine.</p>
    <OpenAiKey hint={config?.aiKeyHint ?? null} baseUrl={config?.aiBaseUrl ?? DEFAULT_AI_BASE_URL} model={config?.aiModel ?? DEFAULT_AI_MODEL} />
    <div className="panel rounded-xl p-4"><p className="mb-3 text-sm font-medium">Language</p><LanguagePicker /></div>
    <div className="panel rounded-xl p-4 text-sm text-muted"><p>Local data is stored in <code>.data/</code> and rendered media in <code>public/uploads/</code>. Back up those folders to keep your work.</p></div>
  </div>;
}
