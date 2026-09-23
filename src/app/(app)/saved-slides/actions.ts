"use server";

import { and, count, desc, eq, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, savedSlides, slideshows, templates } from "@/db";
import { renderFrame } from "@/lib/render";
import { saveFile } from "@/lib/storage";
import type { ComposedSlide } from "@/lib/compose";
import type { FrameSpec } from "@/lib/template-types";
import type { PageCursor, PageResult } from "@/lib/pagination";
import type { SavedSlide } from "../slideshows/saved-slide-types";

export type SavedSlideCard = { id: string; name: string; tags: string[]; role: string; frameUrl: string };

type SavedSlidePageInput = { cursor: PageCursor | null; q?: string; tag?: string };

export async function loadSavedSlides(input: SavedSlidePageInput, limit = 60): Promise<PageResult<SavedSlideCard>> {
  const cursor = input.cursor;
  const pageSize = Math.min(Math.max(limit, 1), 60);
  const boundary = cursor ? or(
    lt(savedSlides.updatedAt, new Date(cursor.timestamp)),
    and(eq(savedSlides.updatedAt, new Date(cursor.timestamp)), lt(savedSlides.id, cursor.id)),
  ) : undefined;
  const where = and(
    input.q ? ilike(savedSlides.name, `%${input.q}%`) : undefined,
    input.tag ? sql`${input.tag} = any(${savedSlides.tags})` : undefined,
  );
  const [[total], rows] = await Promise.all([
    db.select({ value: count() }).from(savedSlides).where(where),
    db.select({ id: savedSlides.id, name: savedSlides.name, tags: savedSlides.tags, role: savedSlides.role, frameUrl: savedSlides.frameUrl, updatedAt: savedSlides.updatedAt })
      .from(savedSlides).where(and(where, boundary)).orderBy(desc(savedSlides.updatedAt), desc(savedSlides.id)).limit(pageSize + 1),
  ]);
  const hasMore = rows.length > pageSize;
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  return { items: page.map((row) => ({ id: row.id, name: row.name, tags: row.tags, role: row.role, frameUrl: row.frameUrl })), total: total.value, nextCursor: hasMore && last ? { timestamp: last.updatedAt.toISOString(), id: last.id } : null };
}

export async function loadComposerSlides(input: { cursor: PageCursor | null; tag?: string }): Promise<PageResult<SavedSlide>> {
  const cursor = input.cursor;
  const boundary = cursor ? or(
    lt(savedSlides.updatedAt, new Date(cursor.timestamp)),
    and(eq(savedSlides.updatedAt, new Date(cursor.timestamp)), lt(savedSlides.id, cursor.id)),
  ) : undefined;
  const where = and(
    eq(savedSlides.role, "body"),
    input.tag ? sql`${input.tag} = any(${savedSlides.tags})` : undefined,
  );
  const [[total], rows] = await Promise.all([
    db.select({ value: count() }).from(savedSlides).where(where),
    db.select({
      id: savedSlides.id,
      name: savedSlides.name,
      tags: savedSlides.tags,
      role: savedSlides.role,
      spec: savedSlides.spec,
      bgUrls: savedSlides.bgUrls,
      frameUrl: savedSlides.frameUrl,
      updatedAt: savedSlides.updatedAt,
    }).from(savedSlides).where(and(where, boundary)).orderBy(desc(savedSlides.updatedAt), desc(savedSlides.id)).limit(31),
  ]);
  const page = rows.slice(0, 30);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({ id: row.id, name: row.name, tags: row.tags, role: row.role, spec: row.spec, bgUrls: row.bgUrls, frameUrl: row.frameUrl })),
    total: total.value,
    nextCursor: rows.length > 30 && last ? { timestamp: last.updatedAt.toISOString(), id: last.id } : null,
  };
}

export async function loadSavedSlideTags(bodyOnly = false): Promise<string[]> {
  const rows = await db.select({ tags: savedSlides.tags }).from(savedSlides).where(and(
    bodyOnly ? eq(savedSlides.role, "body") : undefined,
  ));
  return [...new Set(rows.flatMap((row) => row.tags))].sort();
}

/** Same normalisation as slideshow tags, so one vocabulary spans both. */
function cleanTags(tags: string[]): string[] {
  return [
    ...new Set(
      tags.map((t) => t.trim().toLowerCase().slice(0, 32)).filter(Boolean),
    ),
  ].slice(0, 20);
}

/**
 * Bank a slide for reuse. Renders once, here, and never again: everything
 * downstream deals it in by `frameUrl`.
 *
 * `frameUrl` may be passed by the caller when the slide has already been
 * rendered (the composer's preview step has not rendered yet, so it does not).
 */
export async function saveSlide(input: {
  name: string;
  tags?: string[];
  templateId?: string | null;
  slide: ComposedSlide;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Give the slide a name");
  if (input.templateId) {
    const [template] = await db
      .select({ id: templates.id })
      .from(templates)
      .where(eq(templates.id, input.templateId));
    if (!template) throw new Error("Template not found");
  }

  // Logged but not quota-charged: one slide is a fraction of a generation, and
  // banking slides is what stops later slideshows rendering at all. Charging
  // for it would tax the behaviour we want.
  let frameUrl = input.slide.frameUrl;
  if (!frameUrl) {
    const jpg = await renderFrame(input.slide.spec, input.slide.bgUrls);
    frameUrl = await saveFile(`slide-${Date.now()}.jpg`, jpg, "image/jpeg");
  }

  const [row] = await db
    .insert(savedSlides)
    .values({
      name,
      tags: cleanTags(input.tags ?? []),
      role: input.slide.role,
      templateId: input.templateId ?? null,
      spec: input.slide.spec,
      bgUrls: input.slide.bgUrls,
      frameUrl,
    })
    .returning({ id: savedSlides.id });

  revalidatePath("/saved-slides");
  return row.id;
}

/** Rename / retag. Does not touch the rendered frame. */
export async function updateSavedSlide(
  id: string,
  patch: { name?: string; tags?: string[] },
) {
  const name = patch.name?.trim();
  await db
    .update(savedSlides)
    .set({
      ...(name ? { name } : {}),
      ...(patch.tags ? { tags: cleanTags(patch.tags) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(savedSlides.id, id));
  revalidatePath("/saved-slides");
}

/** Re-render a banked slide after editing its spec. */
export async function resaveSavedSlide(id: string, spec: FrameSpec, bgUrls: string[]) {
  const [row] = await db
    .select({ id: savedSlides.id })
    .from(savedSlides)
    .where(eq(savedSlides.id, id));
  if (!row) throw new Error("Slide not found");

  const jpg = await renderFrame(spec, bgUrls);
  const frameUrl = await saveFile(`slide-${Date.now()}.jpg`, jpg, "image/jpeg");

  await db
    .update(savedSlides)
    .set({ spec, bgUrls, frameUrl, updatedAt: new Date() })
    .where(eq(savedSlides.id, id));
  revalidatePath("/saved-slides");
}

export async function deleteSavedSlides(ids: string[]) {
  if (ids.length === 0) return;
  // Slideshows already built from these keep working: they hold a copy of the
  // frame URL in their own `frames`, not a reference to this row.
  await db
    .delete(savedSlides)
    .where(inArray(savedSlides.id, ids));
  revalidatePath("/saved-slides");
}

/** Bank every slide of an existing slideshow in one go - the fastest way to
 *  seed a tip bank from work already done. */
export async function saveSlidesFromSlideshow(slideshowId: string) {
  const [s] = await db
    .select()
    .from(slideshows)
    .where(eq(slideshows.id, slideshowId));
  if (!s) throw new Error("Slideshow not found");

  const slides = s.slides as ComposedSlide[];
  const frames = s.frames as string[];
  if (slides.length === 0) throw new Error("This slideshow has no saved specs");

  // body slides only: hooks and CTAs are slideshow-specific by nature
  const rows = slides
    .map((slide, i) => ({ slide, frameUrl: frames[i] }))
    .filter((x) => x.slide.role === "body" && x.frameUrl)
    .map(({ slide, frameUrl }) => ({
      name: (slide.spec.blocks[0]?.text ?? "Slide").slice(0, 60),
      tags: s.tags,
      role: slide.role,
      templateId: s.templateId,
      spec: slide.spec,
      bgUrls: slide.bgUrls,
      frameUrl,
    }));

  if (rows.length === 0) throw new Error("No body slides to save");
  await db.insert(savedSlides).values(rows);
  revalidatePath("/saved-slides");
  return rows.length;
}
