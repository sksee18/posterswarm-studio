import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, textTemplates } from "@/db";
import { NewTextTemplateButton } from "./text-templates-client";
import { SubTabs, TEMPLATE_TABS } from "@/components/sub-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n";
import { upgradeTextTemplate } from "@/lib/text-template-types";
import { seedStarterSeries } from "./actions";

export default async function TextTemplatesPage() {
  const t = await getT();
  await seedStarterSeries();
  const rows = await db
    .select()
    .from(textTemplates)
    .orderBy(desc(textTemplates.updatedAt));

  return (
    <div>
      <PageHeader
        title={t("Templates")}
        actions={<NewTextTemplateButton />}
        tabs={<SubTabs tabs={TEMPLATE_TABS} className="mb-0" />}
      />

      {rows.length === 0 ? (
        <p className="mt-16 text-center text-sm text-muted">
          {t("No series templates yet. Create one to steer a repeatable editorial format.")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row, i) => (
            <Link
              key={row.id}
              href={`/text-templates/${row.id}`}
              style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
              className="panel animate-rise-in rounded-xl p-4 transition-colors hover:bg-white/[0.05]"
            >
              <p className="mb-1 text-sm font-medium">{row.name}</p>
              <p className="line-clamp-4 text-xs whitespace-pre-wrap text-muted">
                {upgradeTextTemplate(row.doc, row.prompt).brandVoice || t("Empty, no guidance yet.")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
