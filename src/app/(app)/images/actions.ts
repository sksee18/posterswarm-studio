"use server";

import { and, count, desc, eq, inArray, lt, notExists, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, images, collections, collectionImages } from "@/db";
import { photosOnly } from "@/lib/session";
import type { PageCursor, PageResult } from "@/lib/pagination";
import { saveFile } from "@/lib/storage";
import { searchPinterest, type PinResult, type PinSearchPage } from "@/lib/pinterest";

export type ImagePageItem = { id: string; url: string; source: string; width: number | null; height: number | null; collectionIds: string[] };
export type ImagePageView = "all" | "ungrouped" | { collectionId: string };

export async function loadImages(input: { cursor: PageCursor | null; view: ImagePageView; backgroundsOnly?: boolean }): Promise<PageResult<ImagePageItem>> {
  const cursor = input.cursor;
  const collectionId = typeof input.view === "object" ? input.view.collectionId : null;
  if (collectionId) {
    const [owned] = await db.select({ id: collections.id }).from(collections).where(eq(collections.id, collectionId));
    if (!owned) throw new Error("Collection not found");
  }
  const viewFilter = collectionId
    ? inArray(images.id, db.select({ id: collectionImages.imageId }).from(collectionImages).where(eq(collectionImages.collectionId, collectionId)))
    : input.view === "ungrouped"
      ? notExists(db.select({ imageId: collectionImages.imageId }).from(collectionImages).where(eq(collectionImages.imageId, images.id)))
      : undefined;
  const boundary = cursor ? or(lt(images.createdAt, new Date(cursor.timestamp)), and(eq(images.createdAt, new Date(cursor.timestamp)), lt(images.id, cursor.id))) : undefined;
  const where = and(input.backgroundsOnly ? photosOnly(images.source) : undefined, viewFilter, boundary);
  const totalWhere = and(input.backgroundsOnly ? photosOnly(images.source) : undefined, viewFilter);
  const [[total], rows] = await Promise.all([
    db.select({ value: count() }).from(images).where(totalWhere),
    db.select().from(images).where(where).orderBy(desc(images.createdAt), desc(images.id)).limit(49),
  ]);
  const page = rows.slice(0, 48);
  const ids = page.map((row) => row.id);
  const memberships = ids.length ? await db.select().from(collectionImages).where(inArray(collectionImages.imageId, ids)) : [];
  const byImage = new Map<string, string[]>();
  for (const row of memberships) byImage.set(row.imageId, [...(byImage.get(row.imageId) ?? []), row.collectionId]);
  const last = page.at(-1);
  return { items: page.map((row) => ({ ...row, collectionIds: byImage.get(row.id) ?? [] })), total: total.value, nextCursor: rows.length > 48 && last ? { timestamp: last.createdAt.toISOString(), id: last.id } : null };
}

async function resolveCollection(target?: { collectionId?: string; collectionName?: string }) {
  if (target?.collectionId) {
    const [row] = await db.select({ id: collections.id }).from(collections).where(eq(collections.id, target.collectionId));
    if (!row) throw new Error("Collection not found");
    return row.id;
  }
  const name = target?.collectionName?.trim();
  if (!name) return undefined;
  const [existing] = await db.select({ id: collections.id }).from(collections).where(eq(collections.name, name));
  if (existing) return existing.id;
  return (await db.insert(collections).values({ name }).returning({ id: collections.id }))[0].id;
}

export async function uploadImages(formData: FormData) {
  const files = formData.getAll("files") as File[];
  const collectionId = await resolveCollection({
    collectionId: (formData.get("collectionId") as string) || undefined,
    collectionName: (formData.get("collectionName") as string) || undefined,
  });
  const urls = await Promise.all(files.map(async (file) => saveFile(file.name, await file.arrayBuffer(), file.type)));
  if (!urls.length) return;
  const rows = await db.insert(images).values(urls.map((url) => ({ url, source: "upload" }))).returning({ id: images.id });
  if (collectionId) await db.insert(collectionImages).values(rows.map((row) => ({ collectionId, imageId: row.id }))).onConflictDoNothing();
  revalidatePath("/images");
}

export async function pinterestSearch(query: string, bookmark?: string): Promise<PinSearchPage> {
  return searchPinterest(query, bookmark);
}

function assertHttpsUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("That image URL is not valid"); }
  if (url.protocol !== "https:") throw new Error("Image URLs must be https");
}

export async function savePins(selections: { pin: PinResult; query: string }[], target?: { collectionId?: string; collectionName?: string }) {
  for (const { pin } of selections) assertHttpsUrl(pin.url);
  if (!selections.length) return { images: [], collection: undefined };
  const collectionId = await resolveCollection(target);
  const rows = await db.insert(images).values(selections.map(({ pin, query }) => ({ url: pin.url, source: "pinterest", sourceQuery: query, width: pin.width, height: pin.height }))).returning({ id: images.id, url: images.url, width: images.width, height: images.height });
  if (collectionId) await db.insert(collectionImages).values(rows.map((row) => ({ collectionId, imageId: row.id }))).onConflictDoNothing();
  revalidatePath("/images");
  const collection = collectionId ? (await db.select({ id: collections.id, name: collections.name }).from(collections).where(eq(collections.id, collectionId)))[0] : undefined;
  return { images: rows.map((row) => ({ ...row, collectionIds: collectionId ? [collectionId] : [] })), collection };
}

export async function createCollection(name: string) {
  return (await db.insert(collections).values({ name: name.trim() }).returning({ id: collections.id }))[0].id;
}

export async function deleteCollection(id: string) {
  await db.delete(collections).where(eq(collections.id, id));
  revalidatePath("/images");
}

export async function deleteImages(ids: string[]) {
  if (ids.length) await db.delete(images).where(inArray(images.id, ids));
  revalidatePath("/images");
}

export async function addToCollection(imageIds: string[], collectionId: string) {
  const [collection] = await db.select({ id: collections.id }).from(collections).where(eq(collections.id, collectionId));
  if (!collection) throw new Error("Collection not found");
  const existing = imageIds.length ? await db.select({ id: images.id }).from(images).where(inArray(images.id, imageIds)) : [];
  if (existing.length) await db.insert(collectionImages).values(existing.map((image) => ({ collectionId, imageId: image.id }))).onConflictDoNothing();
  revalidatePath("/images");
}

export async function removeFromCollection(imageIds: string[], collectionId: string) {
  if (imageIds.length) await db.delete(collectionImages).where(and(eq(collectionImages.collectionId, collectionId), inArray(collectionImages.imageId, imageIds)));
  revalidatePath("/images");
}
