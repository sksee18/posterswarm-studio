import assert from "node:assert";
import {
  applyContinuousScene,
  lineFromSlide,
  moveSlide,
  numberSlides,
  resizeSlides,
  splitBoxes,
  type ComposedSlide,
} from "../src/lib/compose";
import type { FrameSpec, SlideRole } from "../src/lib/template-types";

// The composer's Back button turns preview slides back into script lines, and
// Generate turns them forward again. If those two stop being inverses, a slide
// silently loses every box past the headline - which is exactly what a "one
// idea per slide" style instruction fills.

const block = (text: string, label?: string) =>
  ({ text, label, x: 0, y: 0, w: 100, fontSize: 40 }) as FrameSpec["blocks"][0];

const slide = (...blocks: FrameSpec["blocks"]) =>
  ({ spec: { blocks } }) as { spec: FrameSpec };

/** Every box the writer owns: block 0 plus labelled extras (what fillFrame
 *  fills). This is what has to survive the round trip. */
const written = (s: { spec: FrameSpec }) =>
  s.spec.blocks
    .filter((b, i) => i === 0 || !!b.label)
    .map((b) => (b.text ?? "").trim())
    .filter(Boolean);

const roundTrips = (s: { spec: FrameSpec }, why: string) =>
  assert.deepStrictEqual(splitBoxes(lineFromSlide(s)), written(s), why);

// ---- the reported bug: a grown "supporting line" must come back ----
roundTrips(
  slide(block("One slide, one idea"), block("Three ideas and none stick", "supporting line")),
  "a title + supporting line survives Back as both boxes, not the title alone",
);

// ---- the plain case still passes through ----
roundTrips(slide(block("Just a headline")), "a one-box slide is unchanged");

// ---- three boxes, which growToFit produces for a longer point ----
roundTrips(
  slide(
    block("Headline"),
    block("First support", "supporting line"),
    block("Second support", "supporting line"),
  ),
  "every labelled extra makes the trip",
);

// ---- unlabelled extras belong to the template, not the script ----
const withWatermark = slide(
  block("Headline"),
  block("Body", "supporting line"),
  block("@posterswarm"),
);
assert.strictEqual(
  lineFromSlide(withWatermark),
  "Headline | Body",
  "a fixed box (watermark, page counter) is never written into the script",
);
roundTrips(withWatermark, "and its presence does not disturb the round trip");

// ---- an empty extra collapses rather than leaving a dangling separator ----
assert.strictEqual(
  lineFromSlide(slide(block("Headline"), block("  ", "supporting line"))),
  "Headline",
  "a blank extra box leaves no trailing pipe to re-parse",
);

// ---- reordering ----
// `to` is the index the drop target renders at, read before the move, so the
// off-by-one when dragging rightwards is the whole risk here.

const abcde = ["a", "b", "c", "d", "e"];
const mv = (from: number, to: number, want: string, why: string) =>
  assert.strictEqual(moveSlide(abcde, from, to).join(""), want, why);

mv(0, 2, "bacde", "dragging right lands after the slide you dropped on");
mv(3, 1, "adbce", "dragging left lands before the slide you dropped on");
mv(4, 0, "eabcd", "the last slide can reach the front");
mv(0, 5, "bcdea", "to === length sends it to the end (the append cell)");
mv(2, 2, "abcde", "dropping a slide on itself changes nothing");
mv(2, 3, "abcde", "dropping just right of itself changes nothing either");

// the arrow buttons are the same call: -1 is `i - 1`, +1 is `i + 2`
const arrow = (i: number, d: -1 | 1) => moveSlide(abcde, i, d < 0 ? i - 1 : i + 2).join("");
assert.strictEqual(arrow(2, -1), "acbde", "left arrow swaps with the previous");
assert.strictEqual(arrow(2, 1), "abdce", "right arrow swaps with the next");
assert.strictEqual(arrow(0, -1), "abcde", "left arrow on the first slide is a no-op");
assert.strictEqual(arrow(4, 1), "abcde", "right arrow on the last slide is a no-op");

assert.notStrictEqual(moveSlide(abcde, 0, 2), abcde, "returns a new array");
assert.strictEqual(abcde.join(""), "abcde", "and never mutates the input");

// ---- numbering ----
// The point of this is to number slides dealt in from the bank, so the two
// things that must hold are: the number lands in the right box, and toggling it
// off leaves the text exactly as it was.

const bodySlide = (
  role: SlideRole,
  blocks: FrameSpec["blocks"],
  frameUrl?: string,
): ComposedSlide =>
  ({ role, bgUrls: [], spec: { blocks }, frameUrl }) as unknown as ComposedSlide;

const deck = [
  bodySlide("hook", [block("6 reasons you're not going viral")]),
  bodySlide("body", [block("Originality is Overrated")], "https://cdn/a.png"),
  bodySlide("body", [block(""), block("Consistency beats talent", "supporting line")]),
  bodySlide("cta", [block("Follow for part 2")]),
];

const texts = (ss: ComposedSlide[]) =>
  ss.map((s) => s.spec.blocks.map((b) => b.text).join("|"));

const numbered = numberSlides(deck, true);
assert.deepStrictEqual(
  texts(numbered),
  [
    "6 reasons you're not going viral",
    "1. Originality is Overrated",
    "|2. Consistency beats talent",
    "Follow for part 2",
  ],
  "body slides number from 1; the hook and cta are not points in the list",
);
assert.strictEqual(
  numbered[2].spec.blocks[0].text,
  "",
  "an empty main line is left empty - the number goes to the box with the text",
);
assert.strictEqual(
  numbered[1].frameUrl,
  undefined,
  "a numbered banked slide gives up its pre-rendered frame, or the number is invisible",
);
assert.strictEqual(
  deck[1].frameUrl,
  "https://cdn/a.png",
  "and the input is never mutated",
);

assert.deepStrictEqual(
  texts(numberSlides(numbered, false)),
  texts(deck),
  "toggling off restores the original text exactly",
);
assert.deepStrictEqual(
  texts(numberSlides(numbered, true)),
  texts(numbered),
  "re-numbering replaces the prefix instead of stacking 1. 1. on it",
);

// renumbering after a reorder is the case that makes stacking visible
assert.deepStrictEqual(
  texts(numberSlides(moveSlide(numbered, 2, 1), true)),
  [
    "6 reasons you're not going viral",
    "|1. Consistency beats talent",
    "2. Originality is Overrated",
    "Follow for part 2",
  ],
  "numbers follow the new order",
);

// ---- sizes ----
const sized = [
  bodySlide("body", [
    block("Title"),
    block("Support", "supporting line"),
    block("@posterswarm"),
  ]),
];
sized[0].spec.blocks[0].fontSize = 40;
sized[0].spec.blocks[1].fontSize = 30;
sized[0].spec.blocks[2].fontSize = 18;

const scaled = resizeSlides(sized, (c) => c * 1.5, 0.5);
assert.deepStrictEqual(
  scaled[0].spec.blocks.map((b) => b.fontSize),
  [60, 30, 18],
  "title scales, the labelled extra follows the ratio, the watermark is left alone",
);

assert.deepStrictEqual(
  resizeSlides(sized, (c) => c * 1.5)[0].spec.blocks.map((b) => b.fontSize),
  [60, 45, 18],
  "with no ratio the extras scale by the same factor, keeping the template's own proportions",
);
assert.strictEqual(
  resizeSlides(sized, (c) => c)[0],
  sized[0],
  "scaling by 1 with no ratio is a true no-op, so the form defaults change nothing",
);

const forced = resizeSlides(sized, () => 44, 0.75);
assert.deepStrictEqual(
  forced[0].spec.blocks.map((b) => b.fontSize),
  [44, 33, 18],
  "apply-to-all forces one exact title size and derives the body from it",
);

assert.strictEqual(
  resizeSlides(sized, (c) => c, 0.75)[0],
  sized[0],
  "a resize that changes nothing returns the same slide, so frameUrl survives",
);

const sceneDeck = Array.from({ length: 7 }, () => bodySlide("body", [block("scene")]));
const oneScene = applyContinuousScene(sceneDeck, ["one.jpg"]);
assert.deepStrictEqual(oneScene.map((s) => s.spec.scene), [
  { index: 0, total: 7 }, { index: 1, total: 7 }, { index: 2, total: 7 },
  { index: 3, total: 7 }, { index: 4, total: 7 }, { index: 5, total: 7 },
  { index: 6, total: 7 },
]);
const twoScenes = applyContinuousScene(sceneDeck, ["one.jpg", "two.jpg"]);
assert.deepStrictEqual(twoScenes.map((s) => s.spec.scene), [
  { index: 0, total: 4 }, { index: 1, total: 4 }, { index: 2, total: 4 }, { index: 3, total: 4 },
  { index: 0, total: 3 }, { index: 1, total: 3 }, { index: 2, total: 3 },
]);

console.log("compose: ok");
