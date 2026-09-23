import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, templates, images, collections, collectionImages } from "@/db";
import { photosOnly } from "@/lib/session";
import { upgradeDoc } from "@/lib/template-types";
import { TemplateEditor } from "./editor-client";

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tpl] = await db
    .select()
    .from(templates)
    .where(eq(templates.id, id));
  if (!tpl) notFound();

  const imgs = await db
    .select({ id: images.id, url: images.url })
    .from(images)
    .where(photosOnly(images.source))
    .limit(60);

  const cols = await db
    .select({ id: collections.id, name: collections.name })
    .from(collections);

  const memberships = cols.length
    ? await db
        .select()
        .from(collectionImages)
        .where(
          inArray(
            collectionImages.collectionId,
            cols.map((c) => c.id),
          ),
        )
    : [];

  return (
    <TemplateEditor
      id={tpl.id}
      initialName={tpl.name}
      initialDoc={upgradeDoc(tpl.doc)}
      sampleImages={imgs}
      collections={cols}
      memberships={memberships}
    />
  );
}
