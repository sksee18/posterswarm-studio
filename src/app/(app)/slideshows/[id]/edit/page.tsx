import { desc, eq, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import {
  collectionImages,
  collections,
  db,
  images,
  savedSlides,
  slideshows,
} from "@/db";
import { photosOnly } from "@/lib/session";
import type { ComposedSlide } from "@/lib/compose";
import { EditSlides } from "./edit-client";

// Re-rendering every frame and saving it can outlast the framework default,
// same as the composer's create path
export const maxDuration = 60;

export default async function EditSlidesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [s] = await db
    .select()
    .from(slideshows)
    .where(eq(slideshows.id, id));
  if (!s) notFound();

  const slides = s.slides as ComposedSlide[];
  // Uploaded slideshows have no template, and rows created before the `slides`
  // column existed have nothing to rehydrate. Both are view-only.
  if (s.source === "upload" || slides.length === 0)
    redirect(`/slideshows/${id}`);

  const imageRows = await db
    .select({
      id: images.id,
      url: images.url,
      width: images.width,
      height: images.height,
    })
    .from(images)
    .where(
      photosOnly(images.source),
    )
    .orderBy(desc(images.createdAt));
  const collectionRows = await db
    .select({ id: collections.id, name: collections.name })
    .from(collections);
  const memberships = collectionRows.length
    ? await db
        .select()
        .from(collectionImages)
        .where(
          inArray(
            collectionImages.collectionId,
            collectionRows.map((row) => row.id),
          ),
        )
    : [];

  // the tip bank, so an existing slideshow can gain a banked slide too. Scoped
  // to this slideshow's own template so newly added slides remain consistent.
  const banked = await db
    .select({
      id: savedSlides.id,
      name: savedSlides.name,
      tags: savedSlides.tags,
      role: savedSlides.role,
      spec: savedSlides.spec,
      bgUrls: savedSlides.bgUrls,
      frameUrl: savedSlides.frameUrl,
    })
    .from(savedSlides)
    .where(eq(savedSlides.role, "body"))
    .orderBy(desc(savedSlides.updatedAt));

  return (
    <EditSlides
      id={s.id}
      title={s.title}
      collectionId={s.collectionId}
      slides={slides}
      initialImageLibrary={{
        collections: collectionRows,
        images: imageRows.map((image) => ({
          ...image,
          collectionIds: memberships
            .filter((row) => row.imageId === image.id)
            .map((row) => row.collectionId),
        })),
      }}
      savedSlides={banked}
    />
  );
}
