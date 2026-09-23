import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  buildSlides,
  fillFrame,
} from "../src/lib/compose";
import { resolveIconUrls, resolveItemMedia } from "../src/lib/template-types";
import type {
  FrameSpec,
  SlideItem,
  SlideStyle,
  TemplateDoc,
} from "../src/lib/template-types";
import { compatibleItemTemplateId } from "../src/lib/composer-ai";

/**
 * The item formats (app stack, ranked countdown, tier list) are one layout over
 * an ordered list. Two things have to hold or the format is silently wrong in a
 * way a preview does not show: the tokens have to name the right item, and the
 * icon bind has to resolve to the right tile.
 *
 * The countdown is the case worth guarding. {rank} counts the ITEM list, not
 * the slide list, so a deck with a closing CTA still ends on #1.
 */

const items: SlideItem[] = [
  { name: "Notion", iconUrl: "/notion.png" },
  { name: "Claude", iconUrl: "/claude.png" },
  { name: "Figma", iconUrl: "/figma.png" },
];

const text = (t: string) =>
  ({ text: t, x: 0, y: 0, w: 100, fontSize: 40 }) as FrameSpec["blocks"][0];

// ---- tokens ----------------------------------------------------------------

const tokens = (t: string, index: number) =>
  fillFrame({ blocks: [text(t)] } as FrameSpec, [t], index + 2, 5, {
    items,
    index,
  }).blocks[0].text;

// the off-by-one that shipped "2. Notion" as the first slide: {n} counts SLIDES
// (the cover is slide 1), {pos} counts the item list
assert.strictEqual(tokens("{n}. {item}", 0), "2. Notion", "{n} is the slide");
assert.strictEqual(tokens("{pos}. {item}", 0), "1. Notion", "{pos} is the item");
assert.strictEqual(tokens("{pos}. {item}", 2), "3. Figma", "and counts up in order");
assert.strictEqual(tokens("#{rank}", 0), "#3", "countdown opens on the last place");
assert.strictEqual(tokens("#{rank}", 2), "#1", "and closes on first");
assert.strictEqual(tokens("{tier}", 0), "S", "tier comes off list position");
assert.strictEqual(tokens("{tier}", 2), "B", "and steps down the ramp");
assert.strictEqual(
  fillFrame({ blocks: [text("{tier}")] } as FrameSpec, ["{tier}"], 1, 1, {
    items: [{ name: "Claude", tier: "A" }],
    index: 0,
  }).blocks[0].text,
  "A",
  "an explicit tier beats the ramp",
);
assert.strictEqual(
  fillFrame({ blocks: [text("{rank}")] } as FrameSpec, ["{rank}"], 2, 4).blocks[0]
    .text,
  "3",
  "without items {rank} counts down the slides instead",
);

// ---- icon binds ------------------------------------------------------------

const frame = { items, itemIndex: 1 } as FrameSpec;
assert.deepStrictEqual(
  resolveIconUrls({ x: 0, y: 0, size: 10, bind: "item" }, frame),
  ["/claude.png"],
  "bind:item draws the item this slide is about",
);
assert.deepStrictEqual(
  resolveIconUrls({ x: 0, y: 0, size: 10, bind: 2 }, frame),
  ["/figma.png"],
  "a numeric bind pins one item",
);
assert.deepStrictEqual(
  resolveIconUrls({ x: 0, y: 0, size: 10, bind: "all" }, frame),
  ["/notion.png", "/claude.png", "/figma.png"],
  "bind:all is the cover slide's logo strip, in list order",
);
assert.deepStrictEqual(
  resolveIconUrls(
    { x: 0, y: 0, size: 10, bind: "item", url: "/fallback.png" },
    {} as FrameSpec,
  ),
  ["/fallback.png"],
  "with no items the template's own icon shows, which is what the editor previews",
);

// ---- buildSlides binds item i to body slide i ------------------------------

const style = (icons?: SlideStyle["icons"]): SlideStyle => ({
  dim: 0,
  icons,
  blocks: [{ ...text("{item}"), label: "the name" }],
});
const doc: TemplateDoc = {
  width: 1080,
  height: 1440,
  itemMode: true,
  hook: style([{ x: 8, y: 60, size: 11, bind: "all" }]),
  bodies: [style([{ x: 8, y: 32, size: 19, bind: "item" }])],
  cta: style(),
};

const deck = buildSlides(
  doc,
  [
    { role: "hook", texts: ["5 apps that run my entire business"] },
    ...items.map(() => ({ role: "body" as const, texts: ["{item}"] })),
    { role: "cta", texts: ["follow for more"] },
  ],
  ["bg.jpg"],
  () => 0.5,
  items,
);

assert.deepStrictEqual(
  deck.slice(1, 4).map((s) => s.spec.blocks[0].text),
  ["Notion", "Claude", "Figma"],
  "body slide i is about item i, in order - the order IS the ranking",
);
assert.deepStrictEqual(
  deck.slice(1, 4).map((s) => resolveIconUrls(s.spec.icons![0], s.spec)),
  [["/notion.png"], ["/claude.png"], ["/figma.png"]],
  "and it carries that item's icon, not a round-robin one",
);
assert.deepStrictEqual(
  resolveIconUrls(deck[0].spec.icons![0], deck[0].spec),
  ["/notion.png", "/claude.png", "/figma.png"],
  "the hook carries the whole list so its logo strip works",
);
assert.strictEqual(
  deck[4].spec.items?.length,
  3,
  "the CTA carries the items too, so a re-render off the saved spec still has them",
);

const visuals = [
  { id: "plain", name: "Bold Center" },
  { id: "stack", name: "App Stack", itemMode: true },
  { id: "ranked", name: "Ranked Countdown", itemMode: true },
];
assert.strictEqual(compatibleItemTemplateId(visuals, "plain"), "stack");
assert.strictEqual(compatibleItemTemplateId(visuals, "ranked"), "ranked");

const screenshotFrame = {
  items: [{ name: "Notion", screenshotUrls: ["/one.jpg", "/two.jpg", "/three.jpg"] }],
  itemIndex: 0,
} as FrameSpec;
assert.deepStrictEqual(
  resolveItemMedia({ x: 0, y: 0, w: 100, h: 50, bind: "item", count: 2 }, screenshotFrame),
  ["/one.jpg", "/two.jpg"],
  "an item media block keeps App Store screenshot order and count",
);
const preferredVisuals = [...visuals, { id: "tested", name: "I Tested X Apps", itemMode: true }];
assert.strictEqual(
  compatibleItemTemplateId(preferredVisuals, "ranked", "I Tested X Apps"),
  "tested",
  "a paired series selects its own visual even from another item-aware template",
);

const savedSlideGenerator = readFileSync("src/app/(app)/saved-slides/new/generator.tsx", "utf8");
assert.ok(savedSlideGenerator.includes("<ItemPicker"), "saved app slides expose the shared app picker");
assert.match(savedSlideGenerator, /Math\.random,\r?\n\s+items/, "saved slide previews retain the selected apps");

const composer = readFileSync("src/app/(app)/slideshows/new/composer.tsx", "utf8");
assert.ok(composer.includes("(!itemMode || reuseSlides || items.length > 0)"), "saved-slide mode does not require app selections");
assert.ok(composer.includes("{itemMode && !reuseSlides && ("), "saved-slide mode hides the app picker");

console.log("items: ok");
