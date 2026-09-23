import Link from "next/link";
import { count, desc } from "drizzle-orm";
import { GalleryHorizontalEnd, Images as ImagesIcon, LayoutTemplate, Megaphone, Plus } from "lucide-react";
import { db, images, slideshows } from "@/db";
import { photosOnly } from "@/lib/session";
import { getT } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/page-header";

/* eslint-disable @next/next/no-img-element */

export default async function CreatePage() {
  const t = await getT();
  const [[imageCount], recent] = await Promise.all([
    db.select({ n: count() }).from(images).where(photosOnly(images.source)),
    db.select({ id: slideshows.id, title: slideshows.title, frames: slideshows.frames }).from(slideshows).orderBy(desc(slideshows.createdAt)).limit(8),
  ]);
  return <div className="max-w-5xl">
    <PageHeader title={t("Create")} className="mb-8" />
    <div className="grid gap-4 sm:grid-cols-3">
      <Link href="/slideshows/new" className="group flex flex-col justify-between rounded-2xl bg-accent p-6 text-accent-ink transition-all hover:brightness-110 sm:row-span-2">
        <Plus className="h-7 w-7" strokeWidth={2.5} /><div className="mt-16"><p className="text-lg font-semibold">{t("New slideshow")}</p><p className="mt-1 text-sm opacity-70">{t("One script, a whole batch of posts.")}</p></div>
      </Link>
      <Link href="/images" className="glass-panel flex items-center gap-4 rounded-2xl p-5"><ImagesIcon className="h-5 w-5 text-accent" /><div><p className="text-sm font-medium">{t("Find images")}</p><p className="text-xs text-muted">{imageCount.n ? t("Search Pinterest or upload your own.") : t("Add backgrounds to get started.")}</p></div></Link>
      <Link href="/templates" className="glass-panel flex items-center gap-4 rounded-2xl p-5"><LayoutTemplate className="h-5 w-5 text-accent" /><div><p className="text-sm font-medium">{t("Design a template")}</p><p className="text-xs text-muted">{t("Start from a built-in look.")}</p></div></Link>
      <Link href="/slideshows/new?mode=campaign" className="glass-panel flex items-center gap-4 rounded-2xl p-5"><Megaphone className="h-5 w-5" /><div><p className="text-sm font-medium">{t("Plan a campaign")}</p><p className="text-xs text-muted">{t("Build and approve a coordinated post batch.")}</p></div></Link>
      <Link href="/slideshows" className="glass-panel flex items-center gap-4 rounded-2xl p-5"><GalleryHorizontalEnd className="h-5 w-5" /><div><p className="text-sm font-medium">{t("Slideshows")}</p><p className="text-xs text-muted">{t("Edit, duplicate, or download your work.")}</p></div></Link>
    </div>
    {recent.length > 0 && <section className="mt-12"><h2 className="micro mb-4">{t("Recent")}</h2><div className="flex gap-4 overflow-x-auto pb-2">{recent.map((item) => { const cover = (item.frames as string[])[0]; return <Link key={item.id} href={`/slideshows/${item.id}`} className="w-28 shrink-0">{cover && <img src={cover} alt="" className="aspect-[3/4] w-full rounded-xl object-cover" />}<p className="mt-1.5 truncate text-xs text-muted">{item.title}</p></Link>; })}</div></section>}
  </div>;
}
