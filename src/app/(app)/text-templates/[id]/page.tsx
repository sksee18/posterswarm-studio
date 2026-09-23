import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, textTemplates } from "@/db";
import { TextTemplateEditor } from "./editor-client";
import { upgradeTextTemplate } from "@/lib/text-template-types";

export default async function TextTemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [row] = await db.select().from(textTemplates).where(eq(textTemplates.id, id));
  if (!row) notFound();

  return (
    <TextTemplateEditor
      id={row.id}
      initialName={row.name}
      initialDoc={upgradeTextTemplate(row.doc, row.prompt)}
    />
  );
}
