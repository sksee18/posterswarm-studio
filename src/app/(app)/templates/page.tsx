import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, templates, images } from "@/db";
import { photosOnly } from "@/lib/session";
import { upgradeDoc, resolveFrame, styleFor } from "@/lib/template-types";
import { fillFrame } from "@/lib/compose";
import { seedStarterTemplates } from "./actions";
import { TemplatePreview } from "./preview";
import { NewTemplateButton } from "./templates-client";
import { SubTabs, TEMPLATE_TABS } from "@/components/sub-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/filter-bar";
import { getT } from "@/lib/i18n";

// Server actions inherit the limit of the route segment they are called from.
// templateFromSlides runs ~45s for six slides (pixel measurement plus three
// model calls) and can exceed the framework's default duration.
// mid-flight and the browser reports "An unexpected response was received from
// the server", the same opaque message an oversized body produces. 60s is the
// Hobby ceiling, which a 12-slide batch can still exceed.
export const maxDuration = 60;

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const t = await getT();
  // Every visit tops up the built-in looks without overwriting user edits.
  await seedStarterTemplates();
  const all = await db
    .select()
    .from(templates)
    .orderBy(desc(templates.updatedAt));

  // filtered on the server: this page is already dynamic, so FilterBar just
  // pushes ?q= and the re-render does the work. No client grid needed.
  const needle = (q ?? "").trim().toLowerCase();
  const rows = needle
    ? all.filter((row) => row.name.toLowerCase().includes(needle))
    : all;

  // real backgrounds so a card shows what a slideshow actually looks like;
  // cards and roles walk the list so they don't all repeat one photo
  const samples = await db
    .select({ url: images.url })
    .from(images)
    .where(photosOnly(images.source))
    .orderBy(desc(images.createdAt))
    .limit(12);
  const bgAt = (n: number) =>
    samples.length ? samples[n % samples.length].url : undefined;

  return (
    <div>
      <PageHeader
        title={t("Templates")}
        actions={
          <div className="relative flex items-center gap-2">
            <NewTemplateButton />
          </div>
        }
        tabs={<SubTabs tabs={TEMPLATE_TABS} className="mb-0" />}
      />
      <FilterBar
        placeholder={t("Search templates")}
        count={rows.length}
        total={all.length}
      />
      {/* 3-4 cards per row on a 1080px screen. Masonry, not a grid: each card
          keeps its template's own aspect ratio (1080x1920 next to 1080x1080),
          and grid rows tore to the tallest card in the row, leaving dead space
          under every short one. CSS columns rather than the JS packer in
          search-overlay.tsx - that one exists because appending a page
          reshuffles CSS columns sideways, and this list renders all at once. */}
      <div className="columns-2 gap-3 md:columns-3 lg:columns-4">
        {rows.map((row, ti) => {
          const doc = upgradeDoc(row.doc);
          return (
            <Link
              key={row.id}
              href={`/templates/${row.id}`}
              style={{ animationDelay: `${Math.min(ti, 12) * 35}ms` }}
              className="group animate-rise-in mb-3 block break-inside-avoid rounded-xl transition-opacity hover:opacity-90"
            >
              <div
                className="mb-2 overflow-hidden rounded-xl bg-surface"
                style={{ aspectRatio: `${doc.width} / ${doc.height}` }}
              >
                <TemplatePreview
                  frame={fillFrame(
                    resolveFrame(doc, "hook", () => 0.5),
                    [
                      styleFor(doc, "hook").blocks[0]?.text?.trim() ||
                        t("Your hook goes here"),
                    ],
                  )}
                  backgroundUrl={bgAt(ti)}
                  className="h-full w-full"
                />
              </div>
              <p className="truncate px-0.5 text-sm">{row.name}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
