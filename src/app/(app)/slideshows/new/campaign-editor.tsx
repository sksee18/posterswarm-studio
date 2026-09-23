"use client";

import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/select";
import { useT } from "@/lib/i18n-client";
import type { CampaignPostPlan } from "@/lib/campaign";

export function CampaignEditor({ facts, setFacts, audience, setAudience, objective, setObjective, count, setCount, series, setSeries, visuals, setVisuals, posts, setPosts, busy, progress, textTemplates, templates, onPlan, onRegenerate, onWrite, onStop }: {
  facts: string; setFacts: (value: string) => void;
  audience: string; setAudience: (value: string) => void;
  objective: string; setObjective: (value: string) => void;
  count: number; setCount: (value: number) => void;
  series: string[]; setSeries: Dispatch<SetStateAction<string[]>>;
  visuals: string[]; setVisuals: Dispatch<SetStateAction<string[]>>;
  posts: CampaignPostPlan[]; setPosts: Dispatch<SetStateAction<CampaignPostPlan[]>>;
  busy: boolean; progress: { done: number; total: number } | null;
  textTemplates: { id: string; name: string }[];
  templates: { id: string; name: string }[];
  onPlan: () => void; onRegenerate: () => void; onWrite: () => void; onStop: () => void;
}) {
  const t = useT();
  const toggle = (value: string, setter: Dispatch<SetStateAction<string[]>>) => setter((current) => current.includes(value) ? current.filter((id) => id !== value) : [...current, value]);
  const ready = facts.trim() && audience.trim() && objective.trim() && series.length >= 2 && visuals.length >= 1;
  const selected = posts.some((post) => post.selected);
  const approved = posts.some((post) => post.selected && post.status === "approved");
  const active = posts.some((post) => post.status === "written") ? 4 : busy && posts.length ? 3 : posts.length ? 2 : series.length >= 2 && visuals.length ? 1 : 0;

  return <div className="space-y-5">
    <ol className="grid grid-cols-5 gap-1 text-center text-xs text-muted" aria-label={t("Campaign progress")}>{["Brief", "Mix", "Concepts", "Writing", "Preview"].map((label, index) => <li key={label} aria-current={index === active ? "step" : undefined} className={`rounded-md px-1 py-2 ${index === active ? "bg-white/[0.08] text-foreground" : ""}`}>{t(label)}</li>)}</ol>
    <p className="text-sm text-muted">{t("Plan a balanced run of distinct posts, approve the concepts, then write them.")}</p>
    <Textarea value={facts} onChange={(event) => setFacts(event.target.value)} rows={4} placeholder={t("Product facts, proof, offer and constraints")} aria-label={t("Product facts, proof, offer and constraints")} />
    <div className="grid gap-3 sm:grid-cols-2">
      <Textarea value={audience} onChange={(event) => setAudience(event.target.value)} rows={3} placeholder={t("Audience")} aria-label={t("Audience")} />
      <Textarea value={objective} onChange={(event) => setObjective(event.target.value)} rows={3} placeholder={t("Objective")} aria-label={t("Objective")} />
    </div>
    <label className="grid max-w-40 gap-1 text-xs text-muted">{t("Posts")}<Input type="number" min={1} max={20} value={count} onChange={(event) => setCount(Math.min(20, Math.max(1, Number(event.target.value) || 1)))} /></label>
    <details className="panel rounded-xl p-4"><summary className="cursor-pointer text-sm font-medium">{t("Series templates")} <span className="text-muted">({series.length} {t("selected")})</span></summary><div className="flex flex-wrap gap-2">{textTemplates.map((row) => <label key={row.id} className="rounded-full border border-border px-3 py-1.5 text-sm"><input className="mr-2" type="checkbox" checked={series.includes(row.id)} onChange={() => toggle(row.id, setSeries)} />{row.name}</label>)}</div></details>
    <details className="panel rounded-xl p-4"><summary className="cursor-pointer text-sm font-medium">{t("Visual templates")} <span className="text-muted">({visuals.length} {t("selected")})</span></summary><div className="flex flex-wrap gap-2">{templates.map((row) => <label key={row.id} className="rounded-full border border-border px-3 py-1.5 text-sm"><input className="mr-2" type="checkbox" checked={visuals.includes(row.id)} onChange={() => toggle(row.id, setVisuals)} />{row.name}</label>)}</div></details>
    {!posts.length ? <div><Button variant="primary" disabled={busy || !ready} onClick={onPlan}>{t("Plan campaign")}</Button>{!ready && <p className="mt-2 text-xs text-muted">{t("Add a brief, audience, objective, at least two series, and one visual template.")}</p>}</div> : <>
      <div className="grid gap-3 sm:grid-cols-2">{posts.map((post, index) => <div key={post.id} className="panel rounded-xl p-3"><label className="mb-2 flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={post.selected} onChange={(event) => setPosts((current) => current.map((item) => item.id === post.id ? { ...item, selected: event.target.checked } : item))} />{t("Post {n}", { n: index + 1 })} {post.status && `(${post.status})`}</label><Input value={post.title} onChange={(event) => setPosts((current) => current.map((item) => item.id === post.id ? { ...item, title: event.target.value } : item))} className="mb-2" /><Textarea value={post.brief} onChange={(event) => setPosts((current) => current.map((item) => item.id === post.id ? { ...item, brief: event.target.value } : item))} rows={4} /><div className="mt-2 grid gap-2 sm:grid-cols-2"><Select value={post.seriesTemplateId} onChange={(value) => setPosts((current) => current.map((item) => item.id === post.id ? { ...item, seriesTemplateId: value } : item))} options={textTemplates.map((row) => ({ value: row.id, label: row.name }))} /><Select value={post.templateId} onChange={(value) => setPosts((current) => current.map((item) => item.id === post.id ? { ...item, templateId: value } : item))} options={templates.map((row) => ({ value: row.id, label: row.name }))} /></div>{post.error && <p className="mt-2 text-xs text-red-400">{post.error}</p>}</div>)}</div>
      <div className="flex flex-wrap gap-2"><Button onClick={() => setPosts((current) => current.map((post) => ({ ...post, selected: true })))}>{t("Select all")}</Button><Button onClick={() => setPosts((current) => current.map((post) => post.selected ? { ...post, status: "approved" } : post))} disabled={!selected}>{t("Approve selected")}</Button><Button onClick={onRegenerate} disabled={busy || !selected}>{t("Regenerate selected")}</Button><Button variant="primary" disabled={busy || !approved} onClick={onWrite}>{progress ? t("Writing {done}/{total}", progress) : t("Write approved posts")}</Button><Button variant="secondary" disabled={!busy} onClick={onStop}>{t("Stop after current")}</Button></div>
    </>}
  </div>;
}
