"use server";

import { and, count, desc, eq, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, slideshows, templates, textTemplates, collectionImages, images, catalogApps } from "@/db";
import { photosOnly } from "@/lib/session";
import { renderFrame } from "@/lib/render";
import { saveFile } from "@/lib/storage";
import { generateSlides, generateMetadata, generateCampaignConcepts, type GeneratedCopy } from "@/lib/llm";
import { balancedRotation, campaignCount, type CampaignBrief, type CampaignPostPlan } from "@/lib/campaign";
import { planFor, scriptFromSlides, type ComposedSlide } from "@/lib/compose";
import { EMPTY_TEXT_TEMPLATE, upgradeTextTemplate, type TextTemplateDoc } from "@/lib/text-template-types";
import { upgradeDoc, type SlideItem } from "@/lib/template-types";
import { APPS } from "@/lib/apps";
import { domainOf, fetchAppIcon } from "@/lib/appicon";
import { ALL_BACKGROUNDS_ID, type PageCursor, type PageResult } from "@/lib/pagination";

export type SlideshowCard = { id: string; title: string; caption: string; tags: string[]; frames: string[] };

export async function loadSlideshowCards(input: { cursor?: PageCursor | null; q?: string; tag?: string }): Promise<PageResult<SlideshowCard>> {
  const filters = and(
    input.q ? or(ilike(slideshows.title, `%${input.q}%`), ilike(slideshows.caption, `%${input.q}%`)) : undefined,
    input.tag ? sql`${input.tag} = any(${slideshows.tags})` : undefined,
  );
  const cursor = input.cursor;
  const boundary = cursor ? or(lt(slideshows.createdAt, new Date(cursor.timestamp)), and(eq(slideshows.createdAt, new Date(cursor.timestamp)), lt(slideshows.id, cursor.id))) : undefined;
  const [[total], rows] = await Promise.all([
    db.select({ value: count() }).from(slideshows).where(filters),
    db.select().from(slideshows).where(and(filters, boundary)).orderBy(desc(slideshows.createdAt), desc(slideshows.id)).limit(41),
  ]);
  const page = rows.slice(0, 40);
  const last = page.at(-1);
  return { items: page.map((row) => ({ id: row.id, title: row.title, caption: row.caption, tags: row.tags, frames: row.frames as string[] })), total: total.value, nextCursor: rows.length > 40 && last ? { timestamp: last.createdAt.toISOString(), id: last.id } : null };
}

export async function loadSlideshowTags() {
  const rows = await db.select({ tags: slideshows.tags }).from(slideshows);
  return [...new Set(rows.flatMap((row) => row.tags))].sort();
}

type AiActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
async function aiAction<T>(run: () => Promise<T>): Promise<AiActionResult<T>> {
  try { return { ok: true, data: await run() }; }
  catch (error) {
    console.error("AI action failed", error);
    return { ok: false, error: error instanceof Error ? error.message : "AI writing could not start." };
  }
}

async function textTemplate(id?: string): Promise<TextTemplateDoc> {
  if (!id) return EMPTY_TEXT_TEMPLATE;
  const [row] = await db.select({ prompt: textTemplates.prompt, doc: textTemplates.doc }).from(textTemplates).where(eq(textTemplates.id, id));
  return row ? upgradeTextTemplate(row.doc, row.prompt) : EMPTY_TEXT_TEMPLATE;
}

export async function aiFill(input: { templateId: string; textTemplateId?: string; topic?: string; hook?: string; manualCta?: string; nPoints: number; hooksOnly?: boolean; items?: SlideItem[]; excludeApps?: string[]; avoid?: string[] }): Promise<AiActionResult<{ copy: GeneratedCopy; items: SlideItem[] }>> {
  return aiAction(async () => {
    const totalSlides = Math.min(Math.max(Math.round(input.nPoints) || 7, 2), 35);
    const [row] = await db.select().from(templates).where(eq(templates.id, input.templateId));
    if (!row) throw new Error("Template not found");
    const writing = await textTemplate(input.textTemplateId);
    const visual = upgradeDoc(row.doc);
    if (writing.appSelection === "catalog" && !visual.itemMode) throw new Error("Choose an app-list visual template for this series.");
    const withCta = Boolean(input.manualCta?.trim() || writing.generateCta);
    let selectedItems = visual.itemMode ? input.items?.filter((item) => item.name.trim()) ?? [] : [];
    const catalogAppCount = !input.hooksOnly && writing.appSelection === "catalog" && !selectedItems.length ? Math.max(1, totalSlides - (withCta ? 2 : 1)) : 0;
    const bodyCount = selectedItems.length || catalogAppCount || Math.max(0, totalSlides - (withCta ? 2 : 1));
    const itemInstruction = selectedItems.length ? `Write about these ${selectedItems.length} apps, one body slide each and in this exact order: ${selectedItems.map((item, index) => `${index + 1}. ${item.name}`).join(", ")}.` : "";
    const copy = await generateSlides({ template: writing, topic: [input.topic?.trim(), itemInstruction].filter(Boolean).join("\n\n") || undefined, hook: input.hook?.trim() || undefined, slides: input.hooksOnly ? planFor(visual, 0, false) : planFor(visual, bodyCount, withCta), avoid: input.avoid, catalogAppCount: catalogAppCount || undefined, excludedCatalogApps: visual.itemScreenshots ? [...new Set([...(input.excludeApps ?? []), ...APPS.filter((app) => !app.listing).map((app) => app.name)])] : input.excludeApps });
    if (copy.appNames?.length) selectedItems = copy.appNames.map((name) => ({ name }));
    if (!input.hooksOnly && input.manualCta?.trim() && copy.slides.at(-1)) copy.slides.at(-1)![0] = input.manualCta.trim();
    return { copy, items: selectedItems };
  });
}

export async function planCampaign(input: { brief: CampaignBrief; seriesTemplateIds: string[]; templateIds: string[] }): Promise<AiActionResult<CampaignPostPlan[]>> {
  return aiAction(async () => {
    const n = campaignCount(input.brief.count);
    const ids = [...new Set(input.seriesTemplateIds)].slice(0, 20);
    const visualIds = [...new Set(input.templateIds)].slice(0, 20);
    if (ids.length < 2) throw new Error("Choose at least two Series templates");
    if (!visualIds.length) throw new Error("Choose at least one visual template");
    const series = await db.select().from(textTemplates).where(inArray(textTemplates.id, ids));
    const visuals = await db.select({ id: templates.id }).from(templates).where(inArray(templates.id, visualIds));
    if (series.length !== ids.length || visuals.length !== visualIds.length) throw new Error("A selected template is no longer available");
    const byId = new Map(series.map((row) => [row.id, row]));
    const slots = balancedRotation(ids, n).map((id) => { const row = byId.get(id)!; return { id, name: row.name, summary: upgradeTextTemplate(row.doc, row.prompt).campaignSummary }; });
    const concepts = await generateCampaignConcepts({ brief: { ...input.brief, count: n }, slots: slots.map((slot) => ({ seriesName: slot.name, summary: slot.summary })) });
    const visualSlots = balancedRotation(visualIds, n);
    return concepts.map((concept, index) => ({ id: crypto.randomUUID(), title: concept.title, brief: concept.brief, seriesTemplateId: slots[index].id, templateId: visualSlots[index], selected: true, status: "planned" as const }));
  });
}

export async function aiFillMetadata(input: { textTemplateId?: string; instructions?: string; scriptText: string }) {
  return aiAction(async () => generateMetadata({ template: await textTemplate(input.textTemplateId), instructions: input.instructions?.trim() || undefined, scriptText: input.scriptText }));
}

export async function aiAddBody(input: { templateId: string; textTemplateId?: string; scriptText: string; instructions?: string }) {
  return aiAction(async () => {
    const [row] = await db.select().from(templates).where(eq(templates.id, input.templateId));
    if (!row) throw new Error("Template not found");
    const copy = await generateSlides({ template: await textTemplate(input.textTemplateId), topic: `${input.instructions || "Add one body slide"}\nExisting carousel:\n${input.scriptText}`, slides: planFor(upgradeDoc(row.doc), 1, false).slice(-1) });
    return copy.slides[0] ?? [];
  });
}

export async function getPreviewData(templateId: string, collectionId: string) {
  const [template] = await db.select().from(templates).where(eq(templates.id, templateId));
  if (!template) throw new Error("Template not found");
  const backgrounds = collectionId === ALL_BACKGROUNDS_ID
    ? await db.select({ id: images.id, url: images.url, width: images.width, height: images.height }).from(images).where(photosOnly(images.source))
    : await db.select({ id: images.id, url: images.url, width: images.width, height: images.height }).from(collectionImages).innerJoin(images, eq(collectionImages.imageId, images.id)).where(and(eq(collectionImages.collectionId, collectionId), photosOnly(images.source)));
  if (!backgrounds.length) throw new Error("That collection has no images");
  return { doc: upgradeDoc(template.doc), backgrounds: backgrounds.map((image) => image.url), images: backgrounds };
}

export async function resolveAppIcon(input: string, fallbackName?: string, withScreenshots = false): Promise<AiActionResult<SlideItem>> {
  return aiAction(async () => {
    const domain = domainOf(input);
    const screenshotKeys = Array.from({ length: 3 }, (_, index) => `${domain}:screenshot:${index + 1}`);
    const cachedRows = await db.select({ url: images.url, sourceQuery: images.sourceQuery }).from(images).where(and(eq(images.source, "appicon"), inArray(images.sourceQuery, [domain, ...screenshotKeys])));
    const cached = cachedRows.find((row) => row.sourceQuery === domain);
    const screenshots = screenshotKeys.flatMap((key) => { const row = cachedRows.find((candidate) => candidate.sourceQuery === key); return row ? [row.url] : []; });
    if (cached && (!withScreenshots || screenshots.length)) return { name: fallbackName ?? domain, iconUrl: cached.url, screenshotUrls: withScreenshots ? screenshots : undefined };
    const icon = await fetchAppIcon(input, fallbackName, withScreenshots);
    if (!fallbackName) await db.insert(catalogApps).values({ name: icon.name, url: input.trim() }).onConflictDoNothing();
    if (!cached) await db.insert(images).values({ url: icon.iconUrl, source: "appicon", sourceQuery: icon.domain, width: 512, height: 512 });
    if (icon.screenshotUrls?.length) await db.insert(images).values(icon.screenshotUrls.map((url, index) => ({ url, source: "appicon", sourceQuery: screenshotKeys[index] })));
    return { name: icon.name, iconUrl: cached?.url ?? icon.iconUrl, screenshotUrls: icon.screenshotUrls };
  });
}

type SlideshowInput = { title: string; templateId: string; collectionId: string; caption: string; textTemplateId?: string; sceneImageIds?: string[]; slides: ComposedSlide[] };
export async function checkBatchQuota(count: number) { if (count < 1 || count > 50) throw new Error("A batch must contain 1 to 50 slideshows"); }

async function renderSlides(slides: ComposedSlide[]) {
  const frames: string[] = [];
  for (let index = 0; index < slides.length; index++) {
    const slide = slides[index];
    frames.push(slide.frameUrl || await saveFile(`frame-${index + 1}.jpg`, await renderFrame(slide.spec, slide.bgUrls), "image/jpeg"));
  }
  return frames;
}

export async function createOneSlideshow(input: SlideshowInput) {
  if (!(await db.select({ id: templates.id }).from(templates).where(eq(templates.id, input.templateId)))[0]) throw new Error("Template not found");
  const frames = await renderSlides(input.slides);
  await db.insert(slideshows).values({ title: input.title, templateId: input.templateId, textTemplateId: input.textTemplateId || null, collectionId: input.collectionId === ALL_BACKGROUNDS_ID ? null : input.collectionId, script: scriptFromSlides(input.slides), caption: input.caption, frames, slides: input.slides });
  revalidatePath("/slideshows");
}

export async function resaveSlideshow(id: string, slides: ComposedSlide[]) {
  if (!slides.length) throw new Error("A slideshow needs at least 1 slide");
  const [existing] = await db.select({ source: slideshows.source }).from(slideshows).where(eq(slideshows.id, id));
  if (!existing) throw new Error("Slideshow not found");
  if (existing.source === "upload") throw new Error("Uploaded slideshows have no template to re-render");
  await db.update(slideshows).set({ frames: await renderSlides(slides), slides, script: scriptFromSlides(slides) }).where(eq(slideshows.id, id));
  revalidatePath(`/slideshows/${id}`);
}

export async function uploadSlideshow(formData: FormData) {
  const files = (formData.getAll("files") as File[]).filter((file) => file.size > 0);
  if (files.length < 2 || files.length > 35) throw new Error("A slideshow needs 2 to 35 images");
  const title = String(formData.get("title") || "").trim() || "Uploaded slideshow";
  const frames: string[] = [];
  for (const file of files) frames.push(await saveFile(file.name, await file.arrayBuffer(), file.type));
  const [row] = await db.insert(slideshows).values({ title, source: "upload", script: { hook: title, points: [] }, caption: String(formData.get("caption") || "").trim(), frames }).returning({ id: slideshows.id });
  revalidatePath("/slideshows");
  redirect(`/slideshows/${row.id}`);
}

export async function setPostCopy(id: string, title: string, caption: string) {
  await db.update(slideshows).set({ title: title.trim() || "Untitled slideshow", caption }).where(eq(slideshows.id, id));
  revalidatePath(`/slideshows/${id}`);
}

export async function setSlideshowTags(id: string, tags: string[]) {
  await db.update(slideshows).set({ tags: [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))] }).where(eq(slideshows.id, id));
  revalidatePath(`/slideshows/${id}`);
}

export async function addTagToSlideshows(ids: string[], tag: string) {
  const clean = tag.trim().toLowerCase();
  if (ids.length && clean) await db.update(slideshows).set({ tags: sql`array(select distinct unnest(${slideshows.tags} || array[${clean}]::text[]))` }).where(inArray(slideshows.id, ids));
  revalidatePath("/slideshows");
}

export async function duplicateSlideshow(id: string) {
  const [source] = await db.select().from(slideshows).where(eq(slideshows.id, id));
  if (!source) throw new Error("Slideshow not found");
  const [row] = await db.insert(slideshows).values({
    title: `${source.title} copy`, source: source.source, templateId: source.templateId,
    textTemplateId: source.textTemplateId, collectionId: source.collectionId,
    script: source.script, caption: source.caption, frames: source.frames,
    slides: source.slides, tags: source.tags,
  }).returning({ id: slideshows.id });
  revalidatePath("/slideshows");
  return row.id;
}

export async function deleteSlideshow(id: string) { await db.delete(slideshows).where(eq(slideshows.id, id)); revalidatePath("/slideshows"); }
export async function deleteSlideshows(ids: string[]) { if (ids.length) await db.delete(slideshows).where(inArray(slideshows.id, ids)); revalidatePath("/slideshows"); }
