export type PoolMode = "verbatim" | "adapt";
export type AppSelectionMode = "none" | "catalog";

export type TextTemplateDoc = {
  version: 2;
  /** Short description used when a campaign planner chooses this series. */
  campaignSummary: string;
  brandVoice: string;
  structure: string;
  defaultSlides: number;
  maxWords: { hook: number; body: number; cta: number };
  generateCta: boolean;
  useTitles: boolean;
  ctaStyle: string;
  examples: string;
  usePremadeIdeas: boolean;
  poolMode: PoolMode;
  hookPool: string[];
  slidePool: string[];
  /** Select an ordered app list from the verified catalog before writing. */
  appSelection: AppSelectionMode;
  /** Preferred item-aware visual when this series is selected. */
  visualTemplate?: string;
};

export const EMPTY_TEXT_TEMPLATE: TextTemplateDoc = {
  version: 2,
  campaignSummary: "",
  brandVoice: "",
  structure: "",
  defaultSlides: 7,
  maxWords: { hook: 12, body: 18, cta: 12 },
  generateCta: true,
  useTitles: false,
  ctaStyle: "",
  examples: "",
  usePremadeIdeas: false,
  poolMode: "verbatim",
  hookPool: [],
  slidePool: [],
  appSelection: "none",
};

const series = (campaignSummary: string, structure: string, defaultSlides = 7): TextTemplateDoc => ({
  ...EMPTY_TEXT_TEMPLATE,
  campaignSummary,
  structure,
  defaultSlides,
});

export const STARTER_SERIES_TEMPLATES: { name: string; doc: TextTemplateDoc }[] = [
  { name: "Feature Origin Story", doc: series("Tell the concrete origin and turning point behind a feature.", "Open with the surprising problem or moment. Move through the old reality, trigger, decision, build detail, result and takeaway.") },
  { name: "Before and After", doc: series("Contrast a specific before state with a credible after state.", "Open with the contrast. Explain the before, the change, the practical steps, the after and the lesson. Do not promise unrealistic results.") },
  { name: "Three Mistakes", doc: series("Teach three specific mistakes and their fixes.", "Open with a sharp claim. Give exactly three mistakes, each with consequence and correction, then close with an actionable takeaway.", 5) },
  { name: "One Experiment", doc: series("Document one test, its evidence and what changed.", "Open with the hypothesis. Cover setup, what changed, result, interpretation and next step. Be honest about uncertainty.") },
  { name: "Weekly Diary", doc: series("Share a recurring weekly progress update with useful detail.", "Open with the week's focus. Cover goal, wins, friction, one number or observation, lesson and next week's move.") },
];

const cleanLines = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 500)
    : [];

const bounded = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

/** Upgrade untrusted JSONB and the old one-field prompt without losing copy. */
export function upgradeTextTemplate(
  raw: unknown,
  legacyPrompt = "",
): TextTemplateDoc {
  const d = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const limits =
    d.maxWords && typeof d.maxWords === "object"
      ? (d.maxWords as Record<string, unknown>)
      : {};
  return {
    version: 2,
    campaignSummary:
      typeof d.campaignSummary === "string"
        ? d.campaignSummary.slice(0, 1000)
        : "",
    brandVoice:
      typeof d.brandVoice === "string" && d.brandVoice.trim()
        ? d.brandVoice.slice(0, 20000)
        : legacyPrompt.slice(0, 20000),
    structure:
      typeof d.structure === "string" ? d.structure.slice(0, 20000) : "",
    defaultSlides: bounded(d.defaultSlides, 7, 2, 35),
    maxWords: {
      hook: bounded(limits.hook, 12, 1, 100),
      body: bounded(limits.body, 18, 1, 100),
      cta: bounded(limits.cta, 12, 1, 100),
    },
    generateCta: d.generateCta !== false,
    useTitles: d.useTitles === true,
    ctaStyle:
      typeof d.ctaStyle === "string" ? d.ctaStyle.slice(0, 10000) : "",
    examples: typeof d.examples === "string" ? d.examples.slice(0, 30000) : "",
    usePremadeIdeas: d.usePremadeIdeas === true,
    poolMode: d.poolMode === "adapt" ? "adapt" : "verbatim",
    hookPool: cleanLines(d.hookPool),
    slidePool: cleanLines(d.slidePool),
    appSelection: d.appSelection === "catalog" ? "catalog" : "none",
    visualTemplate: typeof d.visualTemplate === "string" ? d.visualTemplate.slice(0, 200) : undefined,
  };
}

export function compileTextTemplate(doc: TextTemplateDoc): string {
  const sections = [
    doc.brandVoice && `Brand voice:\n${doc.brandVoice}`,
    doc.structure && `Structure:\n${doc.structure}`,
    doc.useTitles && "Every body slide needs a short, meaningful title and body copy. The title must describe the idea and never be only a slide number.",
    doc.ctaStyle && `CTA style:\n${doc.ctaStyle}`,
    doc.examples && `Successful post examples. Follow their pattern closely:\n${doc.examples}`,
  ];
  return sections.filter(Boolean).join("\n\n");
}
