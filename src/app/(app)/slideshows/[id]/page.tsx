import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, slideshows } from "@/db";
import type { ComposedSlide } from "@/lib/compose";
import { PageHeader } from "@/components/ui/page-header";
import { FrameStrip } from "./frame-strip";
import { PostCopy } from "./post-copy";
import { TagEditor } from "./tag-editor";
import { SlideshowActions } from "./slideshow-actions";
import { loadSlideshowTags } from "../actions";

export default async function SlideshowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(slideshows).where(eq(slideshows.id, id));
  if (!row) notFound();
  const knownTags = await loadSlideshowTags();
  const frames = row.frames as string[];
  const editable = row.source !== "upload" && (row.slides as ComposedSlide[]).length > 0;
  return <div className="max-w-6xl space-y-8">
    <PageHeader title={row.title} actions={<SlideshowActions id={row.id} editable={editable} />} />
    <FrameStrip frames={frames} />
    <div className="grid gap-6 lg:grid-cols-2"><PostCopy id={row.id} title={row.title} caption={row.caption} /><TagEditor id={row.id} tags={row.tags} known={knownTags} /></div>
  </div>;
}
