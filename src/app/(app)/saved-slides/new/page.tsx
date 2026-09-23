import { desc, inArray } from "drizzle-orm";
import { catalogApps, collectionImages, collections, db, images, templates } from "@/db";
import { photosOnly } from "@/lib/session";
import { upgradeDoc } from "@/lib/template-types";
import { SavedSlideGenerator } from "./generator";

export const maxDuration = 60;

export default async function NewSavedSlidesPage() {
  const [templateRows, collectionRows, imageRows, appRows] = await Promise.all([
    db
      .select({ id: templates.id, name: templates.name, doc: templates.doc })
      .from(templates)
      .orderBy(desc(templates.updatedAt)),
    db
      .select({ id: collections.id, name: collections.name })
      .from(collections),
    db
      .select({ id: images.id, url: images.url, width: images.width, height: images.height })
      .from(images)
      .where(photosOnly(images.source))
      .orderBy(desc(images.createdAt)),
    db.select({ name: catalogApps.name, domain: catalogApps.url })
      .from(catalogApps)
      .orderBy(desc(catalogApps.createdAt)),
  ]);
  const memberships = collectionRows.length
    ? await db
        .select({ collectionId: collectionImages.collectionId, imageId: collectionImages.imageId })
        .from(collectionImages)
        .where(inArray(collectionImages.collectionId, collectionRows.map((collection) => collection.id)))
    : [];

  if (templateRows.length === 0 || collectionRows.length === 0) {
    return <p className="mt-16 text-center text-sm text-muted">Create a template and an image collection first.</p>;
  }

  return (
    <SavedSlideGenerator
      templates={templateRows.map((template) => ({
        id: template.id,
        name: template.name,
        itemMode: upgradeDoc(template.doc).itemMode,
      }))}
      collections={collectionRows}
      catalogApps={appRows}
      imageLibrary={{
        collections: collectionRows,
        images: imageRows.map((image) => ({
          ...image,
          collectionIds: memberships
            .filter((membership) => membership.imageId === image.id)
            .map((membership) => membership.collectionId),
        })),
      }}
    />
  );
}
