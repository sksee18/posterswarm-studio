import type { SlideRole } from "./template-types";
import type { TextTemplateDoc } from "./text-template-types";

export type SlidePlan = { role: SlideRole; boxes: string[] };

export function applyTitlePlan(plan: SlidePlan[], useTitles: boolean): SlidePlan[] {
  if (!useTitles) return plan;
  return plan.map((slide) => {
    if (slide.role !== "body") return slide;
    if (slide.boxes.length === 1)
      return { ...slide, boxes: ["a short meaningful title, then |, then the body copy"] };
    return {
      ...slide,
      boxes: [
        "a short meaningful title, never only a number",
        "the body copy that explains this slide's idea",
        ...slide.boxes.slice(2),
      ],
    };
  });
}

export const cleanGeneratedText = (value: string) =>
  value.replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();

export function normalizeSlides(raw: unknown, plan: SlidePlan[]): string[][] {
  const rows = Array.isArray(raw) ? raw : [];
  return plan.map((slide, i) => {
    const row = rows[i];
    const boxes = Array.isArray(row)
      ? row
      : typeof row === "string"
        ? [row]
        : [];
    return slide.boxes.map((_, j) =>
      typeof boxes[j] === "string" ? cleanGeneratedText(boxes[j]) : "",
    );
  });
}

export function validateGeneratedSlides(
  raw: unknown,
  slides: string[][],
  plan: SlidePlan[],
  template: TextTemplateDoc,
) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows = Array.isArray(raw) ? raw : [];
  if (rows.length !== plan.length)
    errors.push(`Expected ${plan.length} slides, received ${rows.length}.`);
  plan.forEach((slide, i) => {
    if (!Array.isArray(rows[i]) || rows[i].length !== slide.boxes.length)
      errors.push(`Slide ${i + 1} must contain exactly ${slide.boxes.length} boxes.`);
  });
  const seen = new Set<string>();
  slides.forEach((slide, i) => {
    if (slide.some((box) => !box)) errors.push(`Slide ${i + 1} has an empty box.`);
    const count = slide.join(" ").trim().split(/\s+/).filter(Boolean).length;
    const limit = template.maxWords[plan[i].role];
    // ponytail: 25% over is a flag, not a failure. Tighten if copy visibly
    // overflows the render at that margin.
    if (count > Math.ceil(limit * 1.25))
      errors.push(`Slide ${i + 1} has ${count} words. Its limit is ${limit}.`);
    else if (count > limit)
      warnings.push(
        `Slide ${i + 1} runs ${count - limit} word${count - limit > 1 ? "s" : ""} over its ${limit}-word limit.`,
      );
    const key = slide.join(" ").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (key && seen.has(key)) errors.push(`Slide ${i + 1} repeats another slide.`);
    if (key) seen.add(key);
    if (template.useTitles && plan[i].role === "body") {
      const parts = slide.length > 1 ? slide : slide[0].split("|").map((part) => part.trim());
      if (parts.length < 2 || !parts[0] || !parts[1])
        errors.push(`Slide ${i + 1} needs a title and body separated by |.`);
      else if (/^\d+[.)]?$/.test(parts[0]))
        errors.push(`Slide ${i + 1} needs a meaningful title, not only a number.`);
    }
  });
  return { errors, warnings };
}
