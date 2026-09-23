import assert from "node:assert";
// llm-contract, NOT ../src/lib/llm: that one reaches @/db, and importing @/db
// opens the PGlite dev database at module load - which hangs the test process
// and risks the data (AGENTS.md: never open .pglite from a second process).
import { applyTitlePlan, normalizeSlides, validateGeneratedSlides, type SlidePlan } from "../src/lib/llm-contract";
import { compileTextTemplate, STARTER_SERIES_TEMPLATES, upgradeTextTemplate } from "../src/lib/text-template-types";
import { validateCatalogApps } from "../src/lib/apps";

// normalizeSlides is the load-bearing pure bit: whatever the model returns, the
// result must match the plan's shape exactly, so a missing slide costs one
// empty box, not the whole generation.
const plan: SlidePlan[] = [
  { role: "hook", boxes: ["the hook"] },
  { role: "body", boxes: ["main line", "sub line"] },
  { role: "cta", boxes: ["the cta"] },
];

// exact shape passes through, trimmed
assert.deepStrictEqual(
  normalizeSlides([["A "], [" B", "C"], ["D"]], plan),
  [["A"], ["B", "C"], ["D"]],
);

// a bare string per slide is accepted as its first box; missing boxes pad empty
assert.deepStrictEqual(normalizeSlides(["A", "B", "C"], plan), [
  ["A"],
  ["B", ""],
  ["C"],
]);

// too few rows / too many boxes are padded and truncated to the plan
assert.deepStrictEqual(normalizeSlides([["A", "extra"]], plan), [
  ["A"],
  ["", ""],
  [""],
]);

// junk input never throws, yields the empty-shaped plan
assert.deepStrictEqual(normalizeSlides(null, plan), [[""], ["", ""], [""]]);

assert.deepStrictEqual(normalizeSlides([["A \u2014 B"], ["C \u2013 D", "E"], ["F"]], plan), [["A - B"], ["C - D", "E"], ["F"]]);

const migrated = upgradeTextTemplate({}, "Direct legacy voice");
assert.equal(migrated.brandVoice, "Direct legacy voice");
assert.equal(migrated.defaultSlides, 7);
assert.deepStrictEqual(migrated.maxWords, { hook: 12, body: 18, cta: 12 });
assert.equal(migrated.appSelection, "none");
assert.ok(STARTER_SERIES_TEMPLATES.every((row) => row.doc.appSelection === "none"));
assert.deepStrictEqual(validateCatalogApps(["Notion", "Claude"], 2).map((app) => app.name), ["Notion", "Claude"]);
assert.throws(() => validateCatalogApps(["Notion", "Notion"], 2), /unique/);
assert.throws(() => validateCatalogApps(["Unknown", "Claude"], 2), /catalog/);
assert.throws(() => validateCatalogApps(["Notion"], 2), /exactly 2/);
assert.throws(() => validateCatalogApps(["Canva", "Notion"], 2, ["Canva"]), /failed icon/);
const compiled = compileTextTemplate({ ...migrated, ctaStyle: "Ask for a save", useTitles: true, examples: "A proven post" });
for (const value of ["Direct legacy voice", "Ask for a save", "meaningful title", "A proven post"]) assert.ok(compiled.includes(value));

assert.deepStrictEqual(validateGeneratedSlides([["Hook"], ["Body", "Detail"], ["CTA"]], [["Hook"], ["Body", "Detail"], ["CTA"]], plan, migrated), { errors: [], warnings: [] });
// the cta slide is 3 words against a limit of 1: past the 25% tolerance, so it
// is a hard error rather than a warning. Two words would only warn now.
const invalid = validateGeneratedSlides([["Same"], ["Same"], ["avoid me entirely"]], [["Same"], ["Same", ""], ["avoid me entirely"]], plan, { ...migrated, maxWords: { hook: 1, body: 1, cta: 1 }, useTitles: true });
assert.ok(invalid.errors.some((x) => x.includes("exactly 2 boxes")));
assert.ok(invalid.errors.some((x) => x.includes("empty box")));
assert.ok(invalid.errors.some((x) => x.includes("repeats")));
assert.ok(invalid.errors.some((x) => x.includes("word")));
assert.ok(invalid.errors.some((x) => x.includes("title and body")));
const numberedTitle = validateGeneratedSlides([["Hook"], ["1", "Real body"], ["CTA"]], [["Hook"], ["1", "Real body"], ["CTA"]], plan, { ...migrated, useTitles: true });
assert.ok(numberedTitle.errors.some((x) => x.includes("meaningful title")));

// slightly over the word limit is a warning, not a failure: it must not cost a
// retry, and the generation must survive it
const wordy = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
const slightlyOver = validateGeneratedSlides([["Hook"], [wordy(21), "x"], ["CTA"]], [["Hook"], [wordy(21), "x"], ["CTA"]], plan, { ...migrated, maxWords: { hook: 12, body: 20, cta: 12 } });
assert.deepStrictEqual(slightlyOver.errors, []);
assert.deepStrictEqual(slightlyOver.warnings, ["Slide 2 runs 2 words over its 20-word limit."]);
const wayOver = validateGeneratedSlides([["Hook"], [wordy(40), "x"], ["CTA"]], [["Hook"], [wordy(40), "x"], ["CTA"]], plan, { ...migrated, maxWords: { hook: 12, body: 20, cta: 12 } });
assert.ok(wayOver.errors.some((x) => x.includes("41 words")));
assert.deepStrictEqual(wayOver.warnings, []);
assert.deepStrictEqual(applyTitlePlan(plan, true)[1].boxes, [
  "a short meaningful title, never only a number",
  "the body copy that explains this slide's idea",
]);
assert.deepStrictEqual(applyTitlePlan([{ role: "body", boxes: ["main"] }], true)[0].boxes, [
  "a short meaningful title, then |, then the body copy",
]);

console.log("llm.test.ts ok");
