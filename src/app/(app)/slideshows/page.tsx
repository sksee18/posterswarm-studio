import Link from "next/link";
import { UploadSlideshowButton } from "./slideshows-client";
import { SlideshowsGrid } from "./slideshows-grid";
import { SubTabs, SLIDESHOW_TABS } from "@/components/sub-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n";
import { loadSlideshowCards, loadSlideshowTags } from "./actions";

export default async function SlideshowsPage() {
  const t = await getT();
  const [page, tags] = await Promise.all([loadSlideshowCards({ cursor: null }), loadSlideshowTags()]);
  return <div>
    <PageHeader title={t("Slideshows")} actions={<div className="flex gap-2"><UploadSlideshowButton /><Link href="/slideshows/new" className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink">{t("New slideshow")}</Link></div>} tabs={<SubTabs tabs={SLIDESHOW_TABS} className="mb-0" />} />
    <SlideshowsGrid initial={page.items} tags={tags} nextCursor={page.nextCursor} total={page.total} />
  </div>;
}
