export type TextBlock = {
  x: number; // % of canvas width (left edge)
  y: number; // % of canvas height (top edge)
  w: number; // % of canvas width
  fontSize: number; // px at 1080px canvas width
  /** any Google Fonts family name; Inter + Playfair Display are bundled offline */
  fontFamily: string;
  fontWeight: 400 | 700 | 800;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  uppercase?: boolean;
  /** CSS text-shadow, e.g. "0 2px 6px rgba(0,0,0,.6)". satori has no
   *  text-stroke, so a tight dark shadow is how outlined TikTok text is
   *  approximated - which is what it reads as at thumbnail size anyway. */
  shadow?: string;
  /** optional card behind the text */
  background?: string;
  padding?: number;
  radius?: number;
  /** What belongs in this box, e.g. "one-line subheadline". Naming a box opts
   *  it into AI writing - the label is sent to the model as the instruction for
   *  what to put here. Unlabelled boxes keep their `text` verbatim, which is how
   *  branding and page counters stay fixed. blocks[0] is always AI-written. */
  label?: string;
  /** Default content for this box. On blocks[0] it is the slide's script line,
   *  filled at compose time. On extras it is the fallback shown when the box is
   *  unlabelled (or when AI/the user leaves it alone).
   *  Supports {n} (slide number) and {total} tokens, resolved at compose time. */
  text?: string;
  /** Internal marker retained after an item token is resolved. */
  itemBound?: boolean;
};

/**
 * One thing a slideshow is *about*: an app, a tool, a product. The formats that
 * work on TikTok (an app stack, a ranked countdown, a tier list) are all the same
 * slide repeated over an ordered list of these, so the list is the input and the
 * order is the ranking.
 *
 * Deliberately three fields. Anything else a format wants to say about an item
 * (what it does, why you use it) is written by the model into a labelled text
 * box, which is machinery that already exists.
 */
export type SlideItem = {
  name: string;
  /** square icon, usually 512px, produced by lib/appicon.ts */
  iconUrl?: string;
  /** App Store product screenshots, kept as linked CDN assets. */
  screenshotUrls?: string[];
  /** overrides the S/A/B/C ramp derived from list position */
  tier?: string;
};

export type ItemMediaBlock = {
  x: number;
  y: number;
  w: number;
  h: number;
  bind: "item" | number;
  count?: number;
  gap?: number;
  radius?: number;
  fit?: "cover" | "contain";
};

export function resolveItemMedia(m: ItemMediaBlock, frame: FrameSpec): string[] {
  const item = (frame.items ?? [])[typeof m.bind === "number" ? m.bind : (frame.itemIndex ?? 0)];
  return (item?.screenshotUrls ?? []).slice(0, m.count ?? 1);
}

/**
 * An app icon / logo tile. Position and size are % of the canvas exactly like
 * TextBlock, so one drag implementation serves both.
 *
 * `bind` says whose icon this is: "item" = the item this slide is about, a
 * number = a fixed index into the deck's items, "all" = every item laid out as
 * one centred wrapping row (the cover slide's logo strip). `url` is the fallback
 * used when nothing is bound, which is what the template editor previews with.
 */
export type IconBlock = {
  x: number; // % of canvas width (left edge)
  y: number; // % of canvas height (top edge)
  /** % of canvas width; tiles are square */
  size: number;
  bind: "item" | "all" | number;
  /** row gap, % of canvas width. Read only when bind === "all". */
  gap?: number;
  /** row width, % of canvas width. Read only when bind === "all". */
  w?: number;
  /** corner rounding as % of `size`; 24 approximates the iOS squircle */
  radius?: number;
  /** CSS box-shadow. satori has no `filter`, so the reference's
   *  drop-shadow(...) is a box-shadow on the tile wrapper instead - identical
   *  for an opaque tile, which is what appicon.ts always produces. */
  shadow?: string;
  url?: string;
};

/** Which icons an IconBlock actually draws, given the slide's item context.
 *  Shared by lib/render.ts (satori) and templates/preview.tsx (CSS) so the two
 *  can never disagree about what a bind resolves to. */
export function resolveIconUrls(ic: IconBlock, frame: FrameSpec): string[] {
  const items = frame.items ?? [];
  if (ic.bind === "all")
    return items.flatMap((i) => (i.iconUrl ? [i.iconUrl] : []));
  const item = items[typeof ic.bind === "number" ? ic.bind : (frame.itemIndex ?? 0)];
  const url = item?.iconUrl ?? ic.url;
  return url ? [url] : [];
}

/** Per-role slide style. jitterX/jitterY randomly offset blocks[0]
 *  (± that many % of the canvas) on every generated slide, so slideshows from
 *  the same template don't look copy-pasted. Extra blocks never jitter. */
export type SlideStyle = {
  dim: number; // 0-1 black overlay over the background image
  jitterX?: number;
  jitterY?: number;
  /** blocks[0] = the script text; extras carry fixed `text` overlays */
  blocks: TextBlock[];
  /** icon tiles drawn under the text, bound to the deck's items */
  icons?: IconBlock[];
  /** App Store screenshots belonging to the current item. */
  media?: ItemMediaBlock[];
  /** background images per slide: 1 (default), 2 stacked, 3 collage, or 4 grid */
  bgCount?: BackgroundCount;
  /** canvas colour behind everything; only visible where the image isn't */
  bg?: string;
  /** where the collection image(s) land, % of canvas. Absent = full bleed. */
  imageBox?: ImageBox;
};

/** A rect in % of the canvas. */
export type ImageBox = { x: number; y: number; w: number; h: number };

export type BackgroundCount = 1 | 2 | 3 | 4;

/** Cell rectangles within the image box, in percentages of that box. */
export function backgroundCells(count: BackgroundCount): ImageBox[] {
  if (count === 1) return [{ x: 0, y: 0, w: 100, h: 100 }];
  if (count === 2)
    return [
      { x: 0, y: 0, w: 100, h: 50 },
      { x: 0, y: 50, w: 100, h: 50 },
    ];
  if (count === 3)
    return [
      { x: 0, y: 0, w: 100, h: 50 },
      { x: 0, y: 50, w: 50, h: 50 },
      { x: 50, y: 50, w: 50, h: 50 },
    ];
  return [
    { x: 0, y: 0, w: 50, h: 50 },
    { x: 50, y: 0, w: 50, h: 50 },
    { x: 0, y: 50, w: 50, h: 50 },
    { x: 50, y: 50, w: 50, h: 50 },
  ];
}

/** How an image is framed inside its fixed cell. Percentages name the focal
 * point and zoom multiplies the normal cover scale. */
export type ImageCrop = { x: number; y: number; zoom: number };

export const FULL_BLEED: ImageBox = { x: 0, y: 0, w: 100, h: 100 };

/** TikTok's own chrome sits over every post in fixed bands: the FYP/search
 *  header up top, the caption + music ticker + CTA down the bottom, the
 *  like/comment/share stack on the right, device bezels on the left. Anything
 *  under them is unreadable or gets tapped by accident. Generated text is kept
 *  inside this inset box, and the editor shades the bands so hand placement
 *  can see them. Values are the worst-case (largest) end of each measured
 *  range on a 1080x1920 screen, expressed as % so they apply to any canvas:
 *  top 200px, bottom 484px, left 100px, right 140px. */
export const SAFE_ZONE = {
  top: 10.4, // 200 / 1920
  bottom: 25.2, // 484 / 1920
  left: 9.3, // 100 / 1080
  right: 13, // 140 / 1080
} as const;

/** Pull a block (top-left x,y of a box `w` wide, all %) inside the safe zone.
 *  ponytail: clamps the top edge only - rendered text height is unknown here,
 *  so a very tall block can still spill into the bottom band; measure height if
 *  that ever bites. A block wider than the safe corridor pins to the left inset. */
export function clampToSafeZone(x: number, y: number, w: number) {
  const minX = SAFE_ZONE.left;
  const maxX = 100 - SAFE_ZONE.right - w;
  const minY = SAFE_ZONE.top;
  const maxY = 100 - SAFE_ZONE.bottom;
  return {
    x: Math.min(Math.max(x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(y, minY), Math.max(minY, maxY)),
  };
}

/**
 * A user-added text box, derived from the slide's main block so it inherits the
 * template's font, colour and shadow instead of arriving as unstyled default.
 *
 * `at` is where the canvas was clicked (% of the canvas); without it the box
 * lands below the main block, which is what the editor's "+" always did.
 *
 * It is deliberately unlabelled: an unlabelled extra keeps its `text` verbatim
 * through compose, so a hand-placed box survives regeneration instead of being
 * rewritten by the model. Never insert one at index 0 - that slot is the script
 * line, and jitter, anchors and the safe-zone check are all keyed to it.
 */
export function newTextBlock(
  base: TextBlock,
  at?: { x: number; y: number },
): TextBlock {
  return {
    ...base,
    x: at ? Math.max(0, Math.min(100 - base.w, at.x)) : base.x,
    y: at ? Math.max(0, Math.min(97, at.y)) : Math.min(base.y + 20, 85),
    fontSize: Math.round(base.fontSize * 0.6),
    background: undefined,
    label: undefined,
    text: "New text",
  };
}

export type SlideRole = "hook" | "body" | "cta";

/** 3×3 anchor zones: (t)op/(m)iddle/(b)ottom × (l)eft/(c)enter/(r)ight.
 *  Column implies text alignment. */
export type AnchorId =
  "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";

export const ANCHOR_IDS: AnchorId[] = [
  "tl",
  "tc",
  "tr",
  "ml",
  "mc",
  "mr",
  "bl",
  "bc",
  "br",
];

/** Zone → block position + alignment for a block of width w%.
 *  Rows/columns sit inside the TikTok safe area. */
export function anchorToPosition(
  a: AnchorId,
  w: number,
): { x: number; y: number; align: TextBlock["align"] } {
  const col = a[1] as "l" | "c" | "r";
  const row = a[0] as "t" | "m" | "b";
  const x =
    col === "l"
      ? SAFE_ZONE.left
      : col === "c"
        ? (100 - w) / 2
        : 100 - SAFE_ZONE.right - w;
  // bottom row sits just above the caption band, not on the very edge
  const y =
    row === "t"
      ? SAFE_ZONE.top
      : row === "m"
        ? 40
        : 100 - SAFE_ZONE.bottom - 14;
  const align = col === "l" ? "left" : col === "c" ? "center" : "right";
  return { x, y, align };
}

/** Inverse of anchorToPosition: which zone does a block sit in? Row comes from
 *  y (midpoints of the 12/40/62 rows), column from alignment - not from x,
 *  because a wide block's x is nearly the same in all three columns, while
 *  align is exactly what anchorToPosition derives the column from.
 *  Lives next to its inverse so the two can't drift apart. */
export function positionToAnchor(
  y: number,
  align: TextBlock["align"],
): AnchorId {
  const row = y < 26 ? "t" : y > 51 ? "b" : "m";
  const col = align === "left" ? "l" : align === "right" ? "r" : "c";
  return `${row}${col}` as AnchorId;
}

/** Families offered in the editor and the closed list the AI templater must
 *  pick from - any fonts.google.com family works, but constraining the model
 *  to these means a generated template can never fail to load a font. */
export const FONT_SUGGESTIONS = [
  "Inter",
  "Playfair Display",
  "Oswald",
  "Bebas Neue",
  "Anton",
  "Archivo Black",
  "Alfa Slab One",
  "Montserrat",
  "Poppins",
  "Roboto",
  "Roboto Condensed",
  "Barlow Condensed",
  "Lato",
  "Raleway",
  "DM Sans",
  "DM Serif Display",
  "Space Grotesk",
  "Rubik",
  "Work Sans",
  "Nunito",
  "Merriweather",
  "Lora",
  "EB Garamond",
  "Cormorant Garamond",
  "Libre Baskerville",
  "Abril Fatface",
  "Righteous",
  "Caveat",
  "Dancing Script",
  "Pacifico",
  "Permanent Marker",
  "Shadows Into Light",
  "Courier Prime",
  "JetBrains Mono",
];

/** v3 template: hook + N predefined body styles + optional-CTA style.
 *  Body slide i uses bodies[i % bodies.length], so 5 bodies = 5 fixed
 *  positions that repeat in order on longer carousels. */
export type TemplateDoc = {
  width: number;
  height: number;
  hook: SlideStyle;
  bodies: SlideStyle[]; // at least one
  cta: SlideStyle;
  /** zones where generated slides may land blocks[0] (random pick per
   *  slide, alignment follows the zone). Absent/empty = use block x/y. */
  anchors?: AnchorId[];
  /** a poster, not a carousel: one slide, `bodies`/`cta` are never rendered */
  single?: boolean;
  /** A single image moves across the deck instead of changing per slide. */
  backgroundMode?: "per-slide" | "continuous";
  /** This template is about a list of things, not a list of lines: the composer
   *  shows the item picker, body slide i is about item i, and the slide count
   *  follows the item count. See SlideItem. */
  itemMode?: true;
  /** Only catalog apps with App Store screenshots are valid for this visual. */
  itemScreenshots?: true;
};

/** One fully-resolved frame ready for rendering (jitter already applied). */
export type FrameSpec = {
  width: number;
  height: number;
  dim: number;
  blocks: TextBlock[];
  bgCount?: BackgroundCount;
  bg?: string;
  imageBox?: ImageBox;
  /** One crop per bgUrls cell. Missing entries are centered at cover scale. */
  imageCrops?: ImageCrop[];
  /** The frame's viewport into a continuous scene strip. */
  scene?: { index: number; total: number };
  icons?: IconBlock[];
  media?: ItemMediaBlock[];
  /** The whole deck's items, carried on every slide so a `bind: "all"` strip and
   *  a re-edit both work off the saved spec alone. */
  items?: SlideItem[];
  /** Which item this slide is about, for `bind: "item"`. */
  itemIndex?: number;
};

export const CANVAS = { width: 1080, height: 1440 }; // TikTok photo 3:4

/** Canvas presets for the aspect-ratio editor. */
export const ASPECT_PRESETS = [
  { label: "3:4 (TikTok photo)", width: 1080, height: 1440 },
  { label: "9:16 (full screen)", width: 1080, height: 1920 },
  { label: "1:1 (square)", width: 1080, height: 1080 },
  { label: "4:5 (Instagram)", width: 1080, height: 1350 },
] as const;

type V1Doc = { width: number; height: number; dim: number; block: TextBlock };
type V2Style = {
  dim: number;
  jitterX?: number;
  jitterY?: number;
  block: TextBlock;
};
type V2Doc = {
  width: number;
  height: number;
  hook: V2Style;
  body: V2Style;
  cta: V2Style;
  anchors?: AnchorId[];
};

const v2StyleToV3 = (s: V2Style): SlideStyle => ({
  dim: s.dim,
  jitterX: s.jitterX,
  jitterY: s.jitterY,
  blocks: [s.block],
});

/** Accept v1 ({width,height,dim,block}) and v2 ({hook,body,cta} with single
 *  `block`) docs from the DB and upgrade them to v3. */
export function upgradeDoc(raw: unknown): TemplateDoc {
  const d = raw as { bodies?: unknown; backgroundMode?: unknown; hook?: unknown };
  if (d.bodies)
    return { ...(raw as object), backgroundMode: d.backgroundMode === "continuous" ? "continuous" : "per-slide" } as TemplateDoc;
  if (d.hook) {
    const v2 = raw as V2Doc;
    return {
      width: v2.width,
      height: v2.height,
      hook: v2StyleToV3(v2.hook),
      bodies: [v2StyleToV3(v2.body)],
      cta: v2StyleToV3(v2.cta),
      anchors: v2.anchors,
      backgroundMode: "per-slide",
    };
  }
  // v1 → hook = the original block; body = same but smaller with jitter;
  // cta = same block, medium size
  const v1 = raw as V1Doc;
  const b = v1.block;
  return {
    width: v1.width,
    height: v1.height,
    hook: { dim: v1.dim, blocks: [b] },
    bodies: [
      {
        dim: v1.dim,
        jitterY: 15,
        jitterX: 4,
        blocks: [{ ...b, fontSize: Math.round(b.fontSize * 0.8) }],
      },
    ],
    cta: {
      dim: v1.dim,
      blocks: [{ ...b, fontSize: Math.round(b.fontSize * 0.85) }],
    },
    backgroundMode: "per-slide",
  };
}

/** The style a given slide uses: body slide i cycles through doc.bodies. */
export function styleFor(
  doc: TemplateDoc,
  role: SlideRole,
  bodyIndex = 0,
): SlideStyle {
  if (role === "body") return doc.bodies[bodyIndex % doc.bodies.length];
  return doc[role];
}

/** Move blocks[1..] by the delta blocks[0] just travelled, so a slide keeps its
 *  composition when jitter or an anchor relocates the main line. A subheadline
 *  is placed against the headline, not against the canvas - moving one and not
 *  the other is what pulled title/body pairs apart. Icons ride along for the
 *  same reason: an app tile sits beside its name, not at a canvas coordinate.
 *  Mutates in place; callers already hold a fresh copy. */
export function shiftExtras(
  blocks: TextBlock[],
  dx: number,
  dy: number,
  icons?: IconBlock[],
  media?: ItemMediaBlock[],
) {
  if (!dx && !dy) return;
  for (const b of blocks.slice(1)) {
    b.x = Math.max(0, Math.min(100 - b.w, b.x + dx));
    b.y = Math.max(0, Math.min(97, b.y + dy));
  }
  for (const ic of icons ?? []) {
    ic.x = Math.max(0, Math.min(100 - ic.size, ic.x + dx));
    ic.y = Math.max(0, Math.min(97, ic.y + dy));
  }
  for (const m of media ?? []) {
    m.x = Math.max(0, Math.min(100 - m.w, m.x + dx));
    m.y = Math.max(0, Math.min(100 - m.h, m.y + dy));
  }
}

/** Resolve a role into a concrete frame, applying position jitter.
 *  Pass a seeded rand for reproducibility, or omit for Math.random. */
export function resolveFrame(
  doc: TemplateDoc,
  role: SlideRole,
  rand: () => number = Math.random,
  bodyIndex = 0,
): FrameSpec {
  const s = styleFor(doc, role, bodyIndex);
  const blocks = s.blocks.map((b) => ({ ...b }));
  const icons = s.icons?.map((ic) => ({ ...ic }));
  const media = s.media?.map((m) => ({ ...m }));
  const b = blocks[0];
  // Jitter randomises the main line's position; the clamp keeps that
  // randomness from ever throwing it under TikTok's chrome. Author-fixed
  // positions (no jitter) are left alone - a template may deliberately use the
  // caption band, and silently relocating it would wreck the design.
  const x0 = b.x;
  const y0 = b.y;
  if (s.jitterX) b.x += (rand() * 2 - 1) * s.jitterX;
  if (s.jitterY) b.y += (rand() * 2 - 1) * s.jitterY;
  if (s.jitterX || s.jitterY) {
    const c = clampToSafeZone(b.x, b.y, b.w);
    b.x = c.x;
    b.y = c.y;
    shiftExtras(blocks, c.x - x0, c.y - y0, icons, media);
  }
  return {
    width: doc.width,
    height: doc.height,
    dim: s.dim,
    blocks,
    icons,
    media,
    bgCount: s.bgCount,
    bg: s.bg,
    imageBox: s.imageBox,
  };
}

const style = (
  dim: number,
  block: TextBlock,
  jitter?: { x?: number; y?: number },
): SlideStyle => ({
  dim,
  jitterX: jitter?.x,
  jitterY: jitter?.y,
  blocks: [block],
});

/** Every slide of this template looks the same - hook, body and cta share one
 *  style object. Roles stay independent in the editor (putStyle replaces, never
 *  mutates), this just saves repeating the literal three times. */
const uniform = (s: SlideStyle) => ({ hook: s, bodies: [s], cta: s });

// --- the built-in looks ------------------------------------------------------
// Geometry measured off reference slideshows. Only Inter and Playfair Display
// are bundled offline (see lib/fonts.ts), so these all use Inter - a built-in
// must never depend on a Google Fonts fetch succeeding at render time.

const A4_5 = { width: 1080, height: 1350 };

/** White explainer page: headline, the mechanism, a photo in a centred slot,
 *  the fix, a source line. The image lands in `imageBox`, not the background. */
const TIPS_ON_WHITE: SlideStyle = {
  dim: 0,
  bg: "#ffffff",
  imageBox: { x: 21, y: 35, w: 58, h: 37 },
  blocks: [
    {
      x: 8,
      y: 6,
      w: 84,
      fontSize: 56,
      fontFamily: "Inter",
      fontWeight: 800,
      color: "#111111",
      align: "center",
      lineHeight: 1.15,
    },
    {
      x: 9,
      y: 19,
      w: 82,
      fontSize: 28,
      fontFamily: "Inter",
      fontWeight: 400,
      color: "#1a1a1a",
      align: "center",
      lineHeight: 1.4,
      label: "the mechanism: 3-4 lowercase sentences on why this happens",
    },
    {
      x: 8,
      y: 75,
      w: 84,
      fontSize: 28,
      fontFamily: "Inter",
      fontWeight: 400,
      color: "#1a1a1a",
      align: "center",
      lineHeight: 1.4,
      label: "the fix: the actionable protocol, 3-4 lowercase sentences",
    },
    {
      x: 8,
      y: 92,
      w: 84,
      fontSize: 22,
      fontFamily: "Inter",
      fontWeight: 700,
      color: "#111111",
      align: "center",
      lineHeight: 1.3,
      label: 'scientific source: author (year), "paper title" - journal',
    },
  ],
};

/** Full-bleed film still, pale-yellow line floating mid-frame. */
const YELLOW_TIPS: SlideStyle = style(
  0.1,
  {
    x: 8,
    y: 46,
    w: 84,
    fontSize: 52,
    fontFamily: "Inter",
    fontWeight: 700,
    color: "#f5e9a0",
    align: "center",
    lineHeight: 1.35,
    shadow: "0 2px 10px rgba(0,0,0,0.5)",
  },
  { y: 5 },
);

/** Painting or illustration, one short black line dropped wherever it fits.
 *  The wandering placement comes from the doc's anchor zones.
 *  The white glow is load-bearing: this look wants pale artwork, and black text
 *  on a dark photo is invisible without it. On a light background the halo
 *  doesn't read at all, so it costs nothing where it isn't needed. */
const BLACK_ART: SlideStyle = style(0, {
  x: 10,
  y: 22,
  w: 55,
  fontSize: 44,
  fontFamily: "Inter",
  fontWeight: 700,
  color: "#111111",
  align: "left",
  lineHeight: 1.3,
  shadow: "0 0 14px rgba(255,255,255,0.9)",
});

/** Dark portrait, uppercase quote, attribution and a source line under it. */
const DARK_QUOTES: SlideStyle = {
  dim: 0.55,
  blocks: [
    {
      x: 10,
      y: 44,
      w: 80,
      fontSize: 44,
      fontFamily: "Inter",
      fontWeight: 400,
      color: "#ffffff",
      align: "center",
      lineHeight: 1.55,
      uppercase: true,
    },
    {
      x: 10,
      y: 66,
      w: 80,
      fontSize: 30,
      fontFamily: "Inter",
      fontWeight: 400,
      color: "#e5e5e5",
      align: "center",
      lineHeight: 1.3,
      label: "the attribution, e.g. - Nikola Tesla",
    },
    {
      x: 10,
      y: 71,
      w: 80,
      fontSize: 20,
      fontFamily: "Inter",
      fontWeight: 400,
      color: "#9a9a9a",
      align: "center",
      lineHeight: 1.3,
      label: "one short source line: where it is from, and the years",
    },
    {
      x: 10,
      y: 88,
      w: 80,
      fontSize: 22,
      fontFamily: "Inter",
      fontWeight: 400,
      color: "#8a8a8a",
      align: "center",
      lineHeight: 1.3,
      text: "@yourhandle",
    },
  ],
};

/** One dense slide, no carousel: a whole note down the left of a still.
 *  Written as paragraphs - renderFrame keeps the line breaks. */
const SINGLE_NOTE: SlideStyle = style(0.15, {
  x: 6,
  y: 10,
  w: 46,
  fontSize: 30,
  fontFamily: "Inter",
  fontWeight: 700,
  color: "#ffffff",
  align: "left",
  lineHeight: 1.45,
  shadow: "0 2px 6px rgba(0,0,0,0.85)",
});

/** S red, A orange, B yellow, C green, D grey - the tier-list convention.
 *  Indexed by item position; compose.ts resolves `{tierColor}` against it. */
export const TIER_COLORS = ["#ff7f7f", "#ffbf7f", "#ffe07f", "#9fe08f", "#c4c4c4"];

export const STARTER_TEMPLATES: { name: string; doc: TemplateDoc }[] = [
  {
    name: "Bold Center",
    doc: {
      ...CANVAS,
      hook: style(0.45, {
        x: 8,
        y: 36,
        w: 84,
        fontSize: 68,
        fontFamily: "Inter",
        fontWeight: 800,
        color: "#ffffff",
        align: "center",
        lineHeight: 1.2,
        uppercase: true,
      }),
      bodies: [
        style(
          0.4,
          {
            x: 10,
            y: 40,
            w: 80,
            fontSize: 48,
            fontFamily: "Inter",
            fontWeight: 700,
            color: "#ffffff",
            align: "center",
            lineHeight: 1.3,
          },
          { x: 5, y: 22 },
        ),
      ],
      cta: style(0.5, {
        x: 12,
        y: 42,
        w: 76,
        fontSize: 52,
        fontFamily: "Inter",
        fontWeight: 800,
        color: "#ffffff",
        align: "center",
        lineHeight: 1.25,
        uppercase: true,
        background: "#000000",
        padding: 28,
        radius: 10,
      }),
    },
  },
  {
    name: "Lower Third",
    doc: {
      ...CANVAS,
      hook: style(0.2, {
        x: 6,
        y: 68,
        w: 78,
        fontSize: 50,
        fontFamily: "Inter",
        fontWeight: 800,
        color: "#ffffff",
        align: "left",
        lineHeight: 1.3,
        background: "#000000",
        padding: 20,
        radius: 6,
      }),
      bodies: [
        style(
          0.15,
          {
            x: 6,
            y: 72,
            w: 70,
            fontSize: 40,
            fontFamily: "Inter",
            fontWeight: 700,
            color: "#ffffff",
            align: "left",
            lineHeight: 1.35,
            background: "#000000",
            padding: 16,
            radius: 6,
          },
          { y: 30 },
        ),
      ],
      cta: style(0.3, {
        x: 6,
        y: 44,
        w: 88,
        fontSize: 46,
        fontFamily: "Inter",
        fontWeight: 800,
        color: "#000000",
        align: "center",
        lineHeight: 1.3,
        background: "#ffffff",
        padding: 24,
        radius: 8,
      }),
    },
  },
  {
    name: "Notes Card",
    doc: {
      ...CANVAS,
      hook: style(0.3, {
        x: 10,
        y: 30,
        w: 80,
        fontSize: 46,
        fontFamily: "Inter",
        fontWeight: 700,
        color: "#1a1a1a",
        align: "left",
        lineHeight: 1.45,
        background: "#f5f4ef",
        padding: 44,
        radius: 18,
      }),
      bodies: [
        style(
          0.25,
          {
            x: 10,
            y: 34,
            w: 80,
            fontSize: 40,
            fontFamily: "Inter",
            fontWeight: 400,
            color: "#1a1a1a",
            align: "left",
            lineHeight: 1.5,
            background: "#f5f4ef",
            padding: 40,
            radius: 18,
          },
          { y: 20 },
        ),
      ],
      cta: style(0.35, {
        x: 14,
        y: 40,
        w: 72,
        fontSize: 42,
        fontFamily: "Inter",
        fontWeight: 700,
        color: "#f5f4ef",
        align: "center",
        lineHeight: 1.4,
        background: "#1a1a1a",
        padding: 36,
        radius: 18,
      }),
    },
  },
  {
    name: "Editorial Serif",
    doc: {
      ...CANVAS,
      hook: style(0.35, {
        x: 10,
        y: 16,
        w: 80,
        fontSize: 60,
        fontFamily: "Playfair Display",
        fontWeight: 700,
        color: "#ffffff",
        align: "center",
        lineHeight: 1.25,
      }),
      bodies: [
        style(
          0.35,
          {
            x: 12,
            y: 42,
            w: 76,
            fontSize: 46,
            fontFamily: "Playfair Display",
            fontWeight: 400,
            color: "#ffffff",
            align: "center",
            lineHeight: 1.4,
          },
          { y: 26, x: 4 },
        ),
      ],
      cta: style(0.45, {
        x: 12,
        y: 44,
        w: 76,
        fontSize: 48,
        fontFamily: "Playfair Display",
        fontWeight: 700,
        color: "#ffffff",
        align: "center",
        lineHeight: 1.3,
        uppercase: true,
      }),
    },
  },
  // Appended, never reordered: the marketing slide deck indexes 0-3.
  { name: "Tips on White", doc: { ...A4_5, ...uniform(TIPS_ON_WHITE) } },
  { name: "Yellow Tips", doc: { ...CANVAS, ...uniform(YELLOW_TIPS) } },
  {
    name: "Black Art",
    doc: {
      ...A4_5,
      ...uniform(BLACK_ART),
      anchors: ["tl", "tc", "ml", "bl"],
    },
  },
  { name: "Dark Quotes", doc: { ...A4_5, ...uniform(DARK_QUOTES) } },
  {
    name: "Single Note",
    doc: { width: 1080, height: 1080, ...uniform(SINGLE_NOTE), single: true },
  },
  {
    name: "Continuous Scene",
    doc: {
      ...CANVAS,
      ...uniform(style(0.35, {
        x: 8, y: 66, w: 84, fontSize: 48, fontFamily: "Inter", fontWeight: 800,
        color: "#ffffff", align: "center", lineHeight: 1.25,
        shadow: "0 2px 8px rgba(0,0,0,0.9)",
      })),
      backgroundMode: "continuous",
    },
  },
];
