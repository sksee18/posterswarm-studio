"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, images, templates } from "@/db";
import { renderFrame } from "@/lib/render";
import { CANVAS, STARTER_TEMPLATES, type FrameSpec, type TemplateDoc } from "@/lib/template-types";

export async function seedStarterTemplates() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('posterswarm-studio-templates'))`);
    const existing = new Set((await tx.select({ name: templates.name }).from(templates)).map((row) => row.name));
    const missing = STARTER_TEMPLATES.filter((template) => !existing.has(template.name));
    if (missing.length) await tx.insert(templates).values(missing.map((template) => ({ name: template.name, doc: template.doc })));
  });
}

export async function createTemplate(name: string) {
  const [row] = await db.insert(templates).values({ name: name.trim(), doc: STARTER_TEMPLATES[0].doc }).returning({ id: templates.id });
  revalidatePath("/templates");
  return row.id;
}

export async function updateTemplate(id: string, name: string, doc: TemplateDoc) {
  await db.update(templates).set({ name: name.trim(), doc, updatedAt: new Date() }).where(eq(templates.id, id));
  revalidatePath("/templates");
}

export async function duplicateTemplate(id: string) {
  const [source] = await db.select().from(templates).where(eq(templates.id, id));
  if (!source) throw new Error("Template not found");
  const [row] = await db.insert(templates).values({ name: `${source.name} copy`, doc: source.doc }).returning({ id: templates.id });
  revalidatePath("/templates");
  return row.id;
}

export async function deleteTemplate(id: string) {
  await db.delete(templates).where(eq(templates.id, id));
  revalidatePath("/templates");
}

export async function renderSample(frame: FrameSpec, backgroundUrl?: string | string[]) {
  let background = Array.isArray(backgroundUrl) ? backgroundUrl.length ? backgroundUrl : undefined : backgroundUrl;
  if (!background) background = (await db.select({ url: images.url }).from(images).limit(1))[0]?.url ?? "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const png = await renderFrame({ ...frame, width: CANVAS.width, height: Math.min(Math.max(frame.height || CANVAS.height, 540), 2160) }, background);
  return `data:image/png;base64,${png.toString("base64")}`;
}
