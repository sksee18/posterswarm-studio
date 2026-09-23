export type CampaignBrief = {
  productFacts: string;
  audience: string;
  objective: string;
  count: number;
};

export type CampaignPostPlan = {
  id: string;
  title: string;
  brief: string;
  seriesTemplateId: string;
  templateId: string;
  selected: boolean;
  status?: "planned" | "approved" | "writing" | "written" | "failed";
  error?: string;
};

/** Deal values as evenly as possible while preserving the supplied order. */
export function balancedRotation<T>(values: T[], count: number): T[] {
  if (values.length === 0 || count < 1) return [];
  return Array.from({ length: count }, (_, i) => values[i % values.length]);
}

export function campaignCount(value: unknown) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(20, Math.max(1, n)) : 20;
}

export function validateCampaignConcepts(posts: { title: string; brief: string }[], count: number) {
  if (posts.length !== count) throw new Error("Campaign plan returned the wrong number of posts");
  const seen = new Set<string>();
  for (const post of posts) {
    const title = post.title.trim();
    const brief = post.brief.trim();
    if (!title || !brief) throw new Error("Campaign plan returned a blank concept");
    const key = `${title}\n${brief}`.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) throw new Error("Campaign plan repeated a concept. Try again.");
    seen.add(key);
  }
}
