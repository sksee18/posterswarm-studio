import { count, desc, eq, inArray, sql } from "drizzle-orm";
import { db, images, collections, collectionImages } from "@/db";
import { ImagesClient } from "./images-client";
import { loadImages } from "./actions";

export default async function ImagesPage() {
  const [page, ungrouped, cols] = await Promise.all([
    loadImages({ cursor: null, view: "all" }),
    loadImages({ cursor: null, view: "ungrouped" }),
    db.select().from(collections).orderBy(desc(collections.createdAt)),
  ]);
  const ids = cols.map((row) => row.id);
  const summaries = ids.length ? await db.select({
    collectionId: collectionImages.collectionId,
    value: count(),
    covers: sql<string[]>`(array_agg(${images.url} order by ${images.createdAt} desc))[1:4]`,
  }).from(collectionImages).innerJoin(images, eq(collectionImages.imageId, images.id)).where(inArray(collectionImages.collectionId, ids)).groupBy(collectionImages.collectionId) : [];
  const summaryBy = new Map(summaries.map((row) => [row.collectionId, row]));
  const memberships = page.items.flatMap((image) => image.collectionIds.map((collectionId) => ({ collectionId, imageId: image.id })));
  return <ImagesClient images={page.items} collections={cols.map((row) => ({ id: row.id, name: row.name, count: summaryBy.get(row.id)?.value ?? 0, covers: summaryBy.get(row.id)?.covers ?? [] }))} memberships={memberships} nextCursor={page.nextCursor} total={page.total} ungrouped={{ count: ungrouped.total, covers: ungrouped.items.slice(0, 4) }} />;
}
