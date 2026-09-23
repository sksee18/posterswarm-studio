"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, textTemplates } from "@/db";
import { EMPTY_TEXT_TEMPLATE, STARTER_SERIES_TEMPLATES, upgradeTextTemplate, type TextTemplateDoc } from "@/lib/text-template-types";

export async function seedStarterSeries() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('posterswarm-studio-series'))`);
    const have = new Set((await tx.select({ name: textTemplates.name }).from(textTemplates)).map((row) => row.name));
    const missing = STARTER_SERIES_TEMPLATES.filter((row) => !have.has(row.name));
    if (missing.length) await tx.insert(textTemplates).values(missing.map((row) => ({ name: row.name, prompt: "", doc: row.doc })));
  });
}

export async function createTextTemplate(name: string) {
  const [row] = await db.insert(textTemplates).values({ name: name.trim(), prompt: "", doc: EMPTY_TEXT_TEMPLATE }).returning({ id: textTemplates.id });
  revalidatePath("/text-templates");
  return row.id;
}

export async function updateTextTemplate(id: string, name: string, doc: TextTemplateDoc) {
  await db.update(textTemplates).set({ name: name.trim(), prompt: "", doc: upgradeTextTemplate(doc), updatedAt: new Date() }).where(eq(textTemplates.id, id));
  revalidatePath("/text-templates");
}

export async function deleteTextTemplate(id: string) {
  await db.delete(textTemplates).where(eq(textTemplates.id, id));
  revalidatePath("/text-templates");
}
