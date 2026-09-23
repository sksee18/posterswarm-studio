import { SubTabs, SLIDESHOW_TABS } from "@/components/sub-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { SavedSlidesGrid } from "./saved-slides-grid";
import { getT } from "@/lib/i18n";
import Link from "next/link";
import { loadSavedSlides, loadSavedSlideTags } from "./actions";

export default async function SavedSlidesPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string }> }) {
  const t = await getT();
  const filters = await searchParams;
  const [page, tags] = await Promise.all([loadSavedSlides({ cursor: null, ...filters }), loadSavedSlideTags()]);

  return (
    <div>
      <PageHeader
        title={t("Slideshows")}
        tabs={<SubTabs tabs={SLIDESHOW_TABS} className="mb-0" />}
        actions={
          <Link
            href="/saved-slides/new"
            className="rounded-md border border-border bg-white/[0.03] px-3 py-1.5 text-sm transition-all hover:border-border-strong hover:bg-white/[0.06]"
          >
            {t("New saved slides")}
          </Link>
        }
      />

      {page.items.length === 0 && !filters.q && !filters.tag ? (
        <p className="mt-16 text-center text-sm text-muted">
          {t(
            "No saved slides yet. Create a batch here or save a slide from the slideshow preview.",
          )}
        </p>
      ) : (
        <SavedSlidesGrid
          key={`${filters.q ?? ""}:${filters.tag ?? ""}`}
          slides={page.items}
          nextCursor={page.nextCursor}
          total={page.total}
          filters={filters}
          tags={tags}
        />
      )}
    </div>
  );
}
