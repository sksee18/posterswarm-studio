"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeAiKey, saveAiKey } from "./actions";

export function OpenAiKey({
  hint,
  baseUrl,
  model,
}: {
  hint: string | null;
  baseUrl: string | null;
  model: string | null;
}) {
  const [key, setKey] = useState("");
  const [base, setBase] = useState(baseUrl ?? "");
  const [mdl, setMdl] = useState(model ?? "");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return <div className="panel space-y-3 rounded-xl p-4">
    <div><p className="text-sm">Personal API key</p><p className="text-xs text-muted">{hint ? `Active, ending in ${hint}${baseUrl ? ` on ${new URL(baseUrl).host}` : ""}` : "Optional. Your key is encrypted and never shown again."}</p></div>
    <>
      <div className="flex gap-2"><Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={hint ? "Paste a replacement key" : "Paste your API key"} />
        <Button disabled={pending || !key.trim()} onClick={() => start(async () => { try { await saveAiKey(key, base, mdl); setKey(""); setMessage("Key saved"); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save key"); } })}>Save</Button>
        {hint && <Button variant="danger" disabled={pending} onClick={() => start(async () => { await removeAiKey(); setBase(""); setMdl(""); setMessage("Key removed"); })}>Remove</Button>}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={base} onChange={(e) => setBase(e.target.value)} placeholder="Base URL (blank = OpenAI)" />
        <Input value={mdl} onChange={(e) => setMdl(e.target.value)} placeholder="Model (blank = default)" />
      </div>
      <p className="text-xs text-muted">Any provider that speaks the OpenAI Responses API works. OpenRouter: base <code>https://openrouter.ai/api/v1</code>, model <code>openai/gpt-5.6</code> or similar. Base URL and model are saved with the key, so set them together.</p>
    </>
    {message && <p className="text-xs text-muted">{message}</p>}
  </div>;
}
