"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTextTemplate, deleteTextTemplate } from "../actions";
import type { TextTemplateDoc } from "@/lib/text-template-types";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

const lines = (value: string) => value.split("\n").map((x) => x.trim()).filter(Boolean);
const joined = (value: string[]) => value.join("\n");

export function TextTemplateEditor({ id, initialName, initialDoc }: {
  id: string; initialName: string; initialDoc: TextTemplateDoc;
}) {
  const [name, setName] = useState(initialName);
  const [doc, setDoc] = useState(initialDoc);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const text = (key: "brandVoice" | "structure" | "ctaStyle", label: string, rows = 5) => (
    <label className="grid gap-1 text-xs text-muted">{label}
      <Textarea rows={rows} value={doc[key]} onChange={(e) => setDoc({ ...doc, [key]: e.target.value })} />
    </label>
  );
  const list = (key: "hookPool" | "slidePool", label: string) => (
    <label className="grid gap-1 text-xs text-muted">{label}
      <Textarea rows={5} value={joined(doc[key] as string[])} onChange={(e) => setDoc({ ...doc, [key]: lines(e.target.value) })} placeholder="One item per line" />
    </label>
  );
  return <div className="max-w-4xl space-y-5">
    <div className="flex flex-wrap gap-2"><Input value={name} aria-label="Series template name" onChange={(e) => setName(e.target.value)} className="font-medium" />
      <Button variant="primary" disabled={pending || !name.trim()} onClick={() => start(async () => { await updateTextTemplate(id, name.trim(), doc); setSaved(true); setTimeout(() => setSaved(false), 2000); })}>{saved ? "Saved" : "Save"}</Button>
    </div>
    <label className="grid gap-1 text-xs text-muted">Campaign planning summary
      <Textarea rows={2} value={doc.campaignSummary} onChange={(e) => setDoc({ ...doc, campaignSummary: e.target.value })} placeholder="What this repeatable series is for" />
    </label>
    <div className="grid gap-4 lg:grid-cols-2">{text("brandVoice", "Brand voice")}{text("structure", "Structure and writing rules")}</div>
    <div className="panel grid gap-4 rounded-xl p-4 sm:grid-cols-4">
      <label className="text-xs text-muted">Default total slides<Input type="number" min={2} max={35} value={doc.defaultSlides} onChange={(e) => setDoc({ ...doc, defaultSlides: Number(e.target.value) })} /></label>
      {(["hook", "body", "cta"] as const).map((role) => <label key={role} className="text-xs capitalize text-muted">{role} max words<Input type="number" min={1} max={100} value={doc.maxWords[role]} onChange={(e) => setDoc({ ...doc, maxWords: { ...doc.maxWords, [role]: Number(e.target.value) } })} /></label>)}
    </div>
    <div className="flex flex-wrap gap-5">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={doc.generateCta} onChange={(e) => setDoc({ ...doc, generateCta: e.target.checked })} /> Generate CTA</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={doc.useTitles} onChange={(e) => setDoc({ ...doc, useTitles: e.target.checked })} /> Use titles</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={doc.appSelection === "catalog"} onChange={(e) => setDoc({ ...doc, appSelection: e.target.checked ? "catalog" : "none" })} /> Choose apps from curated catalog</label>
    </div>
    {doc.generateCta && text("ctaStyle", "CTA style", 3)}
    <label className="grid gap-1 text-xs text-muted">Successful post examples
      <Textarea rows={5} value={doc.examples} onChange={(e) => setDoc({ ...doc, examples: e.target.value })} />
    </label>
    <div className="panel space-y-4 rounded-xl p-4">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={doc.usePremadeIdeas} onChange={(e) => setDoc({ ...doc, usePremadeIdeas: e.target.checked })} /> Use pre-made ideas</label>
      {doc.usePremadeIdeas && <>
        <label className="grid max-w-xs gap-1 text-xs text-muted">Pool mode<select className="input" value={doc.poolMode} onChange={(e) => setDoc({ ...doc, poolMode: e.target.value as "verbatim" | "adapt" })}><option value="verbatim">Verbatim</option><option value="adapt">Adapt</option></select></label>
        <div className="grid gap-4 lg:grid-cols-2">{list("hookPool", "Hook pool")}{list("slidePool", "Body slide pool")}</div>
      </>}
    </div>
    <div className="flex justify-end"><Button variant="danger" onClick={() => start(async () => { await deleteTextTemplate(id); router.push("/text-templates"); })}>Delete</Button></div>
  </div>;
}
