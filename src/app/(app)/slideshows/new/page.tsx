import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  templates,
  collections,
  collectionImages,
  images,
  catalogApps,
  textTemplates,
} from "@/db";
import { photosOnly } from "@/lib/session";
import { Composer } from "./composer";
import { upgradeTextTemplate } from "@/lib/text-template-types";
import { seedStarterSeries } from "../../text-templates/actions";
import { seedStarterTemplates } from "../../templates/actions";
import { ALL_BACKGROUNDS_ID } from "@/lib/pagination";
import { loadComposerSlides, loadSavedSlideTags } from "../../saved-slides/actions";

// createOneSlideshow renders and uploads every frame of one slideshow, which
// Rendering and model calls can take longer than the framework default.
// Driving the batch one slideshow at a time keeps each call inside this limit,
// where the old whole-batch call could not have fit under any of them.
export const maxDuration = 60;

export default async function NewSlideshowPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  await Promise.all([seedStarterSeries(), seedStarterTemplates()]);
  // `doc` comes along only so the composer knows which templates want an item
  // list; the picker has to appear before anything is generated, and doc is the
  // only place that flag lives
  const tplRows = await db
    .select({ id: templates.id, name: templates.name, doc: templates.doc })
    .from(templates)
    .orderBy(desc(templates.updatedAt));
  // Read the flag off the raw doc; do NOT run upgradeDoc here. Upgrading is for
  // rendering, and its v1 branch dereferences `doc.block.fontSize` - so one
  // malformed or hand-edited local row took the whole page down with a
  // Server Components render error. itemMode only ever exists on docs this
  // codebase wrote, so there is nothing to upgrade for it anyway.
  const tpls = tplRows.map((r) => ({
    id: r.id,
    name: r.name,
    itemMode: (r.doc as { itemMode?: unknown } | null)?.itemMode === true,
    itemScreenshots: (r.doc as { itemScreenshots?: unknown } | null)?.itemScreenshots === true,
  }));
  const colRows = await db.select({ id: collections.id, name: collections.name }).from(collections);
  const [photoSummary] = await db.select({
    count: count(),
    covers: sql<string[]>`(array_agg(${images.url} order by ${images.createdAt} desc))[1:4]`,
  }).from(images).where(photosOnly(images.source));
  const collectionSummaries = colRows.length
    ? await db.select({
        collectionId: collectionImages.collectionId,
        count: count(),
        covers: sql<string[]>`(array_agg(${images.url} order by ${images.createdAt} desc))[1:4]`,
      }).from(collectionImages)
        .innerJoin(images, eq(collectionImages.imageId, images.id))
        .where(and(inArray(collectionImages.collectionId, colRows.map((c) => c.id)), photosOnly(images.source)))
        .groupBy(collectionImages.collectionId)
    : [];
  const summaryByCollection = new Map(collectionSummaries.map((row) => [row.collectionId, row]));
  const cols = [
    ...(photoSummary.count > 0 ? [{ id: ALL_BACKGROUNDS_ID, name: "All backgrounds", count: photoSummary.count, covers: photoSummary.covers ?? [] }] : []),
    ...colRows.map((c) => ({
      ...c,
      count: summaryByCollection.get(c.id)?.count ?? 0,
      covers: summaryByCollection.get(c.id)?.covers ?? [],
    })),
  ];
  const textTpls = await db
    .select({ id: textTemplates.id, name: textTemplates.name, prompt: textTemplates.prompt, doc: textTemplates.doc })
    .from(textTemplates)
    .orderBy(desc(textTemplates.updatedAt));
  const appPool = await db
    .select({ name: catalogApps.name, url: catalogApps.url })
    .from(catalogApps)
    .orderBy(asc(catalogApps.name));

  // the tip bank the composer deals from. Body slides only: hooks and CTAs are
  // written per slideshow, so they are never the reusable part.
  const [banked, savedSlideTags] = await Promise.all([
    loadComposerSlides({ cursor: null }),
    loadSavedSlideTags(true),
  ]);

  return (
    <Composer
      templates={tpls}
      collections={cols}
      textTemplates={textTpls.map((x) => { const doc = upgradeTextTemplate(x.doc, x.prompt); return { id: x.id, name: x.name, defaultSlides: doc.defaultSlides, generateCta: doc.generateCta, useTitles: doc.useTitles, campaignSummary: doc.campaignSummary, appSelection: doc.appSelection, visualTemplate: doc.visualTemplate }; })}
      initialMode={mode === "campaign" ? "campaign" : "manual"}
      savedSlides={banked.items}
      savedSlidesCursor={banked.nextCursor}
      savedSlidesTotal={banked.total}
      savedSlideTags={savedSlideTags}
      catalogApps={appPool.map((app) => ({ name: app.name, domain: app.url }))}
    />
  );
}
