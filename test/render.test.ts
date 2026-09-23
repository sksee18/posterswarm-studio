import assert from "node:assert";
import { renderFrame, sanitizeText } from "../src/lib/render";
import {
  backgroundCells,
  STARTER_TEMPLATES,
  newTextBlock,
  resolveFrame,
  upgradeDoc,
  styleFor,
} from "../src/lib/template-types";
import {
  fillFrame,
  boxLabels,
  planFor,
  buildSlides,
  splitBoxes,
  scriptFromSlides,
} from "../src/lib/compose";
// the pure module: ../src/lib/llm reaches @/db, which opens PGlite at import
import { normalizeSlides } from "../src/lib/llm-contract";

// 1x1 dark png
const bg =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const TEXTS = {
  hook: "Stop scrolling. This hook decides everything.",
  body: "One idea per slide, worded tight.",
  cta: "Follow for part 2",
} as const;

const isJpeg = (buf: Buffer, msg: string) => {
  assert.ok(buf.length > 5000, `${msg}: jpg too small`);
  assert.deepStrictEqual([...buf.subarray(0, 3)], [0xff, 0xd8, 0xff], `${msg}: not a JPEG`);
};

(async () => {
  const doc0 = STARTER_TEMPLATES[0].doc;

  // every starter renders all three roles (a single-slide one only has a hook)
  for (const t of STARTER_TEMPLATES) {
    for (const role of (t.doc.single ? ["hook"] : ["hook", "body", "cta"]) as (
      | "hook"
      | "body"
      | "cta"
    )[]) {
      const jpg = await renderFrame(
        fillFrame(resolveFrame(t.doc, role), [TEXTS[role]]),
        bg,
      );
      isJpeg(jpg, `${t.name}/${role}`);
    }
    console.log(`${t.name}: renders ok`);
  }

  // ---- single-slide templates: one slide, whatever the caller asks for ----
  const single = { ...STARTER_TEMPLATES[0].doc, single: true };
  assert.deepStrictEqual(
    planFor(single, 5).map((p) => p.role),
    ["hook"],
    "a single doc ignores nBodies and the cta",
  );
  assert.deepStrictEqual(
    planFor(STARTER_TEMPLATES[0].doc, 2).map((p) => p.role),
    ["hook", "body", "body", "cta"],
    "a normal doc is unaffected",
  );
  console.log("single-slide roles ok");

  // ---- image slot: the photo lands in a rect over a coloured canvas ----
  const slotted = {
    ...doc0,
    hook: {
      ...doc0.hook,
      dim: 0,
      bg: "#ffffff",
      imageBox: { x: 21, y: 35, w: 58, h: 37 },
      blocks: [{ ...doc0.hook.blocks[0], color: "#111111" }],
    },
  };
  const slotFrame = resolveFrame(slotted, "hook");
  assert.strictEqual(slotFrame.bg, "#ffffff", "resolveFrame carries bg");
  assert.deepStrictEqual(
    slotFrame.imageBox,
    { x: 21, y: 35, w: 58, h: 37 },
    "resolveFrame carries imageBox",
  );
  isJpeg(
    await renderFrame(fillFrame(slotFrame, ["Slotted image"]), bg),
    "image slot",
  );
  console.log("image slot ok");

  // ---- paragraph breaks survive into the render (the long-note template) ----
  assert.strictEqual(
    sanitizeText("one   line\n\n\n\n  two  \n three "),
    "one line\n\ntwo\nthree",
    "spaces collapse, newlines stay, blank runs cap at one",
  );
  isJpeg(
    await renderFrame(
      fillFrame(resolveFrame(doc0, "hook"), ["para one\n\npara two\n\npara three"]),
      bg,
    ),
    "multi-paragraph",
  );
  console.log("paragraph breaks ok");

  // v1 docs from the DB still upgrade and render
  const v1 = {
    width: 1080,
    height: 1440,
    dim: 0.4,
    block: STARTER_TEMPLATES[0].doc.hook.blocks[0],
  };
  const up = upgradeDoc(v1);
  assert.ok(up.bodies[0].jitterY, "v1 upgrade should add body jitter");
  isJpeg(
    await renderFrame(fillFrame(resolveFrame(up, "body"), [TEXTS.body]), bg),
    "v1 upgrade",
  );
  console.log("v1 upgrade ok");

  // v2 docs (single `block` per role) upgrade to v3
  const v2 = {
    width: 1080,
    height: 1440,
    hook: { dim: 0.4, block: v1.block },
    body: { dim: 0.4, jitterY: 15, block: v1.block },
    cta: { dim: 0.4, block: v1.block },
  };
  const up2 = upgradeDoc(v2);
  assert.strictEqual(up2.bodies.length, 1, "v2 upgrade: one body variant");
  assert.strictEqual(up2.hook.blocks.length, 1, "v2 upgrade: single block");
  console.log("v2 upgrade ok");

  // jitter actually moves blocks[0] but stays in bounds
  const doc = STARTER_TEMPLATES[0].doc;
  const a = resolveFrame(doc, "body", () => 0);
  const z = resolveFrame(doc, "body", () => 1);
  assert.notStrictEqual(a.blocks[0].y, z.blocks[0].y, "jitter should vary y");
  for (const f of [a, z]) {
    assert.ok(f.blocks[0].y >= 3 && f.blocks[0].y <= 88, "y out of bounds");
    assert.ok(
      f.blocks[0].x >= 2 && f.blocks[0].x + f.blocks[0].w <= 98.001,
      "x out of bounds",
    );
  }
  console.log("jitter bounds ok");

  // multi-block + 2×2 background grid + 9:16 canvas renders
  const fancy = {
    ...doc,
    width: 1080,
    height: 1920,
    hook: {
      dim: 0.3,
      bgCount: 4 as const,
      blocks: [
        doc.hook.blocks[0],
        { ...doc.hook.blocks[0], y: 85, fontSize: 30, text: "@handle · {n}/{total}" },
      ],
    },
  };
  const grid = await renderFrame(
    fillFrame(resolveFrame(fancy, "hook"), ["Multi test"], 2, 7),
    [bg, bg],
  );
  isJpeg(grid, "multi-block grid");
  console.log("multi-block + bg grid ok");

  assert.deepStrictEqual(backgroundCells(3), [
    { x: 0, y: 0, w: 100, h: 50 },
    { x: 0, y: 50, w: 50, h: 50 },
    { x: 50, y: 50, w: 50, h: 50 },
  ], "three-image collage geometry");
  const collage = await renderFrame(
    {
      ...fillFrame(resolveFrame(fancy, "hook"), ["Collage test"]),
      bgCount: 3,
      imageCrops: [
        { x: 20, y: 40, zoom: 1.2 },
        { x: 50, y: 50, zoom: 1 },
        { x: 80, y: 60, zoom: 1.4 },
      ],
    },
    [bg, bg],
  );
  isJpeg(collage, "three-image collage");
  console.log("three-image collage ok");

  const cropped = await renderFrame(
    {
      ...fillFrame(resolveFrame(fancy, "hook"), ["Crop test"]),
      imageCrops: [
        { x: 10, y: 90, zoom: 1.5 },
        { x: 90, y: 10, zoom: 2 },
        { x: 50, y: 50, zoom: 1 },
        { x: 25, y: 75, zoom: 1.25 },
      ],
    },
    [bg, bg],
  );
  isJpeg(cropped, "per-cell image crops");
  console.log("per-cell image crops ok");

  const croppedScene = await renderFrame(
    {
      ...fillFrame(resolveFrame(STARTER_TEMPLATES.find((row) => row.name === "Continuous Scene")!.doc, "hook"), ["Scene crop"]),
      scene: { index: 1, total: 3 },
      imageCrops: [{ x: 25, y: 75, zoom: 1.4 }],
    },
    bg,
  );
  isJpeg(croppedScene, "continuous scene crop");
  console.log("continuous scene crop ok");

  // body variants cycle deterministically
  const multi = { ...doc, bodies: [doc.bodies[0], { ...doc.bodies[0], dim: 0.9 }] };
  assert.strictEqual(styleFor(multi, "body", 0).dim, multi.bodies[0].dim);
  assert.strictEqual(styleFor(multi, "body", 1).dim, 0.9);
  assert.strictEqual(styleFor(multi, "body", 2).dim, multi.bodies[0].dim);
  console.log("body variant cycling ok");

  // ---- text boxes: only labelled extras are AI-written ----
  const labelled = {
    ...doc,
    hook: {
      dim: 0.3,
      blocks: [
        doc.hook.blocks[0],
        { ...doc.hook.blocks[0], y: 60, label: "subheadline", text: "fallback" },
        { ...doc.hook.blocks[0], y: 85, text: "@handle {n}/{total}" },
      ],
    },
  };
  assert.deepStrictEqual(
    boxLabels(labelled, "hook"),
    ["the slide's main line", "subheadline"],
    "only blocks[0] and labelled extras are fillable",
  );

  const filled = fillFrame(
    resolveFrame(labelled, "hook"),
    ["Main line", "Written by AI"],
    3,
    9,
  );
  assert.strictEqual(filled.blocks[0].text, "Main line");
  assert.strictEqual(filled.blocks[1].text, "Written by AI", "labelled box takes AI text");
  assert.strictEqual(
    filled.blocks[2].text,
    "@handle 3/9",
    "unlabelled box keeps its text, tokens resolved",
  );

  // a labelled box with no AI text falls back to the template's own copy
  const sparse = fillFrame(resolveFrame(labelled, "hook"), ["Only main"]);
  assert.strictEqual(sparse.blocks[1].text, "fallback");
  console.log("labelled vs fixed boxes ok");

  // ---- newTextBlock: a box added by double-clicking the canvas ----
  const main = { ...doc.hook.blocks[0], w: 40 };
  const dropped = newTextBlock(main, { x: 35, y: 70 });
  assert.strictEqual(dropped.x, 35, "lands where it was dropped");
  assert.strictEqual(dropped.y, 70);
  assert.strictEqual(dropped.label, undefined, "unlabelled, so AI never rewrites it");
  assert.ok(dropped.fontSize < main.fontSize, "smaller than the script line");
  // dropped near an edge, the whole box still has to fit on the canvas - same
  // clamp the drag handler applies
  assert.strictEqual(
    newTextBlock(main, { x: 99, y: 200 }).x,
    60,
    "x clamped to 100 - width",
  );
  assert.strictEqual(newTextBlock(main, { x: 0, y: 200 }).y, 97, "y clamped");
  assert.strictEqual(newTextBlock(main).x, main.x, "no drop point = under the main block");

  // it survives compose verbatim (this is what makes a hand-placed box stick)
  const withAdded = {
    ...doc,
    hook: {
      ...doc.hook,
      blocks: [doc.hook.blocks[0], newTextBlock(main, { x: 20, y: 75 })],
    },
  };
  assert.deepStrictEqual(
    boxLabels(withAdded, "hook"),
    ["the slide's main line"],
    "an added box is not offered to the model",
  );
  const addedFilled = fillFrame(resolveFrame(withAdded, "hook"), ["Main only"]);
  assert.strictEqual(addedFilled.blocks[1].text, "New text", "kept verbatim");
  isJpeg(await renderFrame(addedFilled, bg), "added text box");
  console.log("added text box ok");

  // planFor covers hook + N bodies + cta
  const plan = planFor(labelled, 3);
  assert.deepStrictEqual(
    plan.map((p) => p.role),
    ["hook", "body", "body", "body", "cta"],
  );
  assert.strictEqual(plan[0].boxes.length, 2, "hook plan lists both fillable boxes");

  // buildSlides cycles backgrounds and never reuses a slot's bg cell blindly
  const composed = buildSlides(
    labelled,
    plan.map((p) => ({ role: p.role, texts: ["x"] })),
    ["a.jpg", "b.jpg"],
    () => 0,
  );
  assert.strictEqual(composed.length, 5);
  assert.deepStrictEqual(composed[0].bgUrls, ["b.jpg"]);
  assert.deepStrictEqual(composed[1].bgUrls, ["a.jpg"], "shuffled backgrounds do not repeat before exhaustion");
  console.log("planFor + buildSlides ok");

  // a hand-written "title | body" line fills both boxes; without the separator
  // the line stays the main line and the AI extras fill the rest
  assert.deepStrictEqual(splitBoxes("Title | body copy", ["ai"]), [
    "Title",
    "body copy",
  ]);
  assert.deepStrictEqual(splitBoxes("just the hook", ["ai"]), [
    "just the hook",
    "ai",
  ]);
  assert.deepStrictEqual(splitBoxes(""), [""], "an empty line stays one box");
  // a part with no box gets one rather than being dropped: `labelled` has two
  // fillable boxes and a fixed watermark, so the third part adds a fourth block
  const split = buildSlides(
    labelled,
    [{ role: "hook" as const, texts: splitBoxes("T | B | C") }],
    ["a.jpg"],
    () => 0,
  );
  assert.strictEqual(split[0].spec.blocks.length, 4, "one box grown for part 3");
  assert.strictEqual(split[0].spec.blocks[0].text, "T");
  assert.strictEqual(split[0].spec.blocks[1].text, "B");
  assert.strictEqual(
    split[0].spec.blocks[2].text,
    "@handle 1/1",
    "the fixed watermark is not consumed by a script part",
  );
  assert.strictEqual(split[0].spec.blocks[3].text, "C");

  // the reported case: a one-box template must not swallow the body
  const oneBox = buildSlides(
    { ...doc, hook: { ...doc.hook, jitterX: 0, jitterY: 0 } },
    [
      {
        role: "hook" as const,
        texts: splitBoxes("Shou Pu-erh | aids digestion, mellow earthy calm"),
      },
    ],
    ["a.jpg"],
    () => 0,
  );
  const [title, body] = oneBox[0].spec.blocks;
  assert.strictEqual(oneBox[0].spec.blocks.length, 2, "body gets its own box");
  assert.strictEqual(title.text, "Shou Pu-erh");
  assert.strictEqual(body.text, "aids digestion, mellow earthy calm");
  assert.ok(body.fontSize < title.fontSize, "body reads as secondary");
  assert.ok(body.y > title.y, "body sits under the title");
  assert.strictEqual(body.fontFamily, title.fontFamily, "inherits the template");

  // ---- a slide moves as one: extras keep their offset from the main line ----
  const paired = {
    ...doc,
    anchors: ["br" as const],
    hook: {
      dim: 0.3,
      jitterX: 0,
      jitterY: 0,
      blocks: [
        { ...doc.hook.blocks[0], x: 10, y: 20, w: 60 },
        { ...doc.hook.blocks[0], x: 10, y: 36, w: 60, label: "sub" },
      ],
    },
  };
  const gap = 36 - 20;
  const anchored = buildSlides(
    paired,
    [{ role: "hook" as const, texts: ["main", "sub"] }],
    ["a.jpg"],
    () => 0,
  );
  const [m0, e0] = anchored[0].spec.blocks;
  assert.notStrictEqual(m0.y, 20, "the anchor actually moved the main line");
  assert.strictEqual(
    Math.round((e0.y - m0.y) * 10) / 10,
    gap,
    "extra keeps its offset below the main line",
  );
  assert.strictEqual(Math.round(e0.x), Math.round(m0.x), "and its x offset");

  // same for jitter
  const jittered = resolveFrame(
    { ...paired, anchors: undefined, hook: { ...paired.hook, jitterY: 10 } },
    "hook",
    () => 1,
  );
  assert.notStrictEqual(jittered.blocks[0].y, 20, "jitter moved the main line");
  assert.strictEqual(
    Math.round((jittered.blocks[1].y - jittered.blocks[0].y) * 10) / 10,
    gap,
    "jitter carries the extra with it",
  );
  console.log("blocks move as one ok");

  // ---- the saved script keeps every written box, not just the headline ----
  assert.strictEqual(
    scriptFromSlides([{ role: "hook", spec: oneBox[0].spec }]).hook,
    "Shou Pu-erh | aids digestion, mellow earthy calm",
    "script round-trips the composer's own title | body form",
  );
  assert.strictEqual(
    scriptFromSlides([{ role: "hook", spec: split[0].spec }]).hook,
    "T | B | C",
    "the fixed watermark stays out of the script",
  );
  console.log("script keeps every box ok");

  // the AI path is untouched: texts already match the fillable boxes
  const aiPath = buildSlides(
    labelled,
    [{ role: "hook" as const, texts: ["main", "sub"] }],
    ["a.jpg"],
    () => 0,
  );
  assert.strictEqual(aiPath[0].spec.blocks.length, 3, "no boxes invented");
  console.log("splitBoxes ok");

  // ---- normalizeSlides: the model's count is never trusted ----
  const p2 = [
    { role: "hook" as const, boxes: ["main", "sub"] },
    { role: "body" as const, boxes: ["main"] },
  ];
  assert.deepStrictEqual(
    normalizeSlides([["A", "B"], ["C"]], p2),
    [["A", "B"], ["C"]],
    "exact shape passes through",
  );
  assert.deepStrictEqual(
    normalizeSlides([["A"]], p2),
    [["A", ""], [""]],
    "too few rows/boxes pad with empties",
  );
  assert.deepStrictEqual(
    normalizeSlides([["A", "B", "C"], ["D"], ["E"]], p2),
    [["A", "B"], ["D"]],
    "extra rows and boxes are truncated",
  );
  assert.deepStrictEqual(
    normalizeSlides(["A", "B"], p2),
    [["A", ""], ["B"]],
    "bare strings per slide are accepted",
  );
  assert.deepStrictEqual(
    normalizeSlides(null, p2),
    [["", ""], [""]],
    "garbage yields the right shape, not a throw",
  );
  assert.deepStrictEqual(
    normalizeSlides([[" A ", 7]], [{ role: "hook" as const, boxes: ["m", "s"] }]),
    [["A", ""]],
    "trims strings, drops non-strings",
  );
  console.log("normalizeSlides ok");

  // ---- icon tiles actually reach the pixels -------------------------------
  // The engine-level worry: satori supports a subset of CSS, and the tile leans
  // on borderRadius + overflow:hidden on a flex wrapper, plus flex-wrap and gap
  // for the cover strip. If any of that silently no-ops, the preview looks right
  // and the render comes back without icons. So: draw flat colours and read the
  // pixels back at the coordinates the layout maths says they land at.
  {
    const sharp = (await import("sharp")).default;
    const square = async (c: string) =>
      "data:image/png;base64," +
      (
        await sharp({
          create: { width: 64, height: 64, channels: 4, background: c },
        })
          .png()
          .toBuffer()
      ).toString("base64");

    const items = [
      { name: "Red", iconUrl: await square("#ff0000") },
      { name: "Green", iconUrl: await square("#00ff00") },
      { name: "Blue", iconUrl: await square("#0000ff") },
    ];
    const base = { width: 1080, height: 1440, dim: 0, bgCount: 1 as const, items };

    const pixel = async (buf: Buffer, xPct: number, yPct: number) => {
      const { data, info } = await sharp(buf)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const x = Math.round((xPct / 100) * info.width);
      const y = Math.round((yPct / 100) * info.height);
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    // jpeg is lossy, so "is it the right colour" is a dominant-channel question
    const dominant = (rgb: number[]) => "rgb"[rgb.indexOf(Math.max(...rgb))];

    // one bound tile: itemIndex 1 must draw the GREEN item, not the first one
    const size = 20;
    const body = await renderFrame(
      {
        ...base,
        itemIndex: 1,
        icons: [{ x: 10, y: 30, size, bind: "item", radius: 24 }],
        blocks: [],
      },
      [bg],
    );
    // tiles are square in PIXELS, so a 20%-of-width tile is 20*1080/1440 = 15% of height
    const tileH = (size * 1080) / 1440;
    assert.strictEqual(
      dominant(await pixel(body, 10 + size / 2, 30 + tileH / 2)),
      "g",
      "bind:item draws the slide's own item at its x/y/size",
    );
    assert.notStrictEqual(
      dominant(await pixel(body, 10 + size + 4, 30 + tileH / 2)),
      "g",
      "and stops at its right edge rather than stretching",
    );

    // the cover strip: 3 tiles of 10% + 2 gaps of 3% = 36%, centred in a 84% row
    // starting at x=8, so the first tile's left edge is at 8 + (84-36)/2 = 32
    const strip = await renderFrame(
      {
        ...base,
        icons: [{ x: 8, y: 60, size: 10, bind: "all", gap: 3, w: 84, radius: 24 }],
        blocks: [],
      },
      [bg],
    );
    const stripH = (10 * 1080) / 1440;
    const mid = 60 + stripH / 2;
    assert.deepStrictEqual(
      [
        dominant(await pixel(strip, 32 + 5, mid)),
        dominant(await pixel(strip, 32 + 13 + 5, mid)),
        dominant(await pixel(strip, 32 + 26 + 5, mid)),
      ],
      ["r", "g", "b"],
      "bind:all wraps every item into one centred row, in list order",
    );

    // a dead icon url must not take the slideshow down with it
    const survived = await renderFrame(
      {
        ...base,
        items: [{ name: "Gone", iconUrl: "https://127.0.0.1:1/nope.png" }],
        itemIndex: 0,
        icons: [{ x: 10, y: 30, size: 20, bind: "item" }],
        blocks: [
          {
            x: 10, y: 60, w: 80, fontSize: 60, fontFamily: "Inter",
            fontWeight: 700, color: "#ffffff", align: "left", lineHeight: 1.2,
            text: "still here",
          },
        ],
      },
      [bg],
    );
    isJpeg(survived, "an unreachable icon drops the tile, not the frame");
    console.log("icon tiles ok");
  }

  console.log("render self-check passed");
})();
