/**
 * Turning a script into renderable frames. Shared by the composer (interactive)
 * and the pipeline runner (unattended) - both need the same anchor/jitter rolls
 * and background cycling, so neither owns this logic.
 */
import {
  anchorToPosition,
  resolveFrame,
  shiftExtras,
  styleFor,
  TIER_COLORS,
  type FrameSpec,
  type SlideItem,
  type SlideRole,
  type TemplateDoc,
  type TextBlock,
} from "./template-types";
import type { SlidePlan } from "./llm";

export type ComposedSlide = {
  role: SlideRole;
  bgUrls: string[];
  spec: FrameSpec;
  /** Set only when this slide came out of the saved-slide library: the PNG it
   *  already rendered to. Callers reuse the URL instead of rendering again. */
  frameUrl?: string;
};

/** Which item a slide is about, and the list it came from. */
export type ItemContext = { items: SlideItem[]; index: number };

/** Tier letters by list position, when an item doesn't name its own. */
const TIER_RAMP = "SABCDEF";

/**
 * `{n}`/`{total}` are the slide's position; `{item}`, `{rank}` and `{tier}` are
 * the item it is about.
 *
 * `{pos}` and `{rank}` count the ITEM list up and down, not the slide list.
 * Deriving them from `{n}` is off by exactly the number of non-body slides,
 * which is how an app stack opened on "2. Notion". Without items they fall back
 * to the slide count, which is what a template using them on a plain script
 * wants.
 */
const resolveTokens = (
  t: string,
  n: number,
  total: number,
  ctx?: ItemContext,
) => {
  const item = ctx?.items[ctx.index];
  const rank = ctx ? ctx.items.length - ctx.index : total - n + 1;
  const i = ctx?.index ?? 0;
  return t
    .replaceAll("{n}", String(n))
    .replaceAll("{total}", String(total))
    .replaceAll("{item}", item?.name ?? "")
    .replaceAll("{pos}", String(ctx ? ctx.index + 1 : n))
    .replaceAll("{rank}", String(rank))
    .replaceAll("{tier}", item?.tier ?? TIER_RAMP[i] ?? "")
    // the last colour repeats, so a 9-app tier list still renders
    .replaceAll("{tierColor}", TIER_COLORS[Math.min(i, TIER_COLORS.length - 1)]);
};

/** A box whose text is bound to the item list is DATA, not copy: the app's name
 *  and its rank come from what the user picked, so asking the model for them
 *  invites it to rewrite "Notion" as something else - and on an app-stack slide
 *  it silently ate the template's own "{n}. " numbering. */
const ITEM_BOUND = /\{(item|pos|rank|tier)\}/;

/** Boxes the writer fills, in block order: blocks[0], plus any extra that has
 *  been given a label, minus anything item-bound. Every caller that walks the
 *  written boxes uses this, so the positional mapping can't drift between the
 *  plan sent to the model and the frame filled from its reply. */
export const isFillable = (b: TextBlock, i: number) =>
  !b.itemBound && !ITEM_BOUND.test(b.text ?? "") && (i === 0 || !!b.label);

/** The strings are the instructions sent to the model, so they double as the
 *  per-box editor headings in the composer. */
export function boxLabels(
  doc: TemplateDoc,
  role: SlideRole,
  bodyIndex = 0,
): string[] {
  const s = styleFor(doc, role, bodyIndex);
  return s.blocks.flatMap((b, i) =>
    isFillable(b, i) ? [b.label || "the slide's main line"] : [],
  );
}

/** The slide sequence of a slideshow: hook, N bodies, optional closing cta. */
export function slideRoles(nBodies: number, withCta: boolean): SlideRole[] {
  return [
    "hook" as const,
    ...Array<SlideRole>(Math.max(nBodies, 0)).fill("body"),
    ...(withCta ? (["cta"] as const) : []),
  ];
}

/** The slide sequence for a specific template: a `single` doc is a poster, so
 *  its bodies and cta never render however many lines the caller has. */
export function rolesFor(
  doc: TemplateDoc,
  nBodies: number,
  withCta: boolean,
): SlideRole[] {
  return doc.single ? ["hook"] : slideRoles(nBodies, withCta);
}

/** What to ask the model for: one entry per slide, listing that slide's boxes.
 *  Body slides cycle the template's body variants, so their box lists can
 *  differ from one another. */
export function planFor(
  doc: TemplateDoc,
  nBodies: number,
  withCta = true,
): SlidePlan[] {
  let bodySeen = 0;
  return rolesFor(doc, nBodies, withCta).map((role) => ({
    role,
    boxes: boxLabels(doc, role, role === "body" ? bodySeen++ : 0),
  }));
}

/** Fill a frame's blocks with `texts`, which are positional over the *fillable*
 *  boxes (block 0 + labelled extras). Unlabelled extras keep their own text, so
 *  branding and page counters survive. Tokens resolved throughout.
 *  `ctx` also rides onto the spec, so the renderer knows which item's icon to
 *  draw and a saved slide can be re-rendered from the spec alone. */
export function fillFrame(
  spec: FrameSpec,
  texts: string[],
  n = 1,
  total = 1,
  ctx?: ItemContext,
): FrameSpec {
  let f = 0;
  return {
    ...spec,
    ...(ctx ? { items: ctx.items, itemIndex: ctx.index } : {}),
    blocks: spec.blocks.map((b, i) => {
      const fillable = isFillable(b, i);
      const itemBound = b.itemBound || ITEM_BOUND.test(b.text ?? "");
      const t = fillable ? (texts[f++] ?? b.text ?? "") : (b.text ?? "");
      return {
        ...b,
        ...(itemBound ? { itemBound: true } : {}),
        text: resolveTokens(t, n, total, ctx),
        // a card colour can be a token too, which is what makes the tier chip
        // change colour down the ramp instead of being red five times
        ...(b.background?.includes("{")
          ? { background: resolveTokens(b.background, n, total, ctx) }
          : {}),
      };
    }),
  };
}

/** Size of a grown body box relative to the main line. Big enough to read as
 *  body copy rather than a caption; the slide editor's size picker overrides it
 *  per box. Kept next to the picker's steps in slide-editor.tsx. */
export const BODY_SCALE = 0.75;

/** Grow a frame so every script part has a box to land in.
 *
 *  Without this a one-box template handed "title | body" renders the title and
 *  drops the body on the floor - the parts past the first have nowhere to go,
 *  because fillFrame only advances over block 0 and labelled extras.
 *
 *  Extra parts are the writer's, not the template's, so they get boxes derived
 *  from the main line: same font, colour and shadow, smaller, stacked under it.
 *  They are labelled, which is what makes them fillable - and it means a later
 *  AI fill writes them too, instead of the slide silently losing a box.
 *
 *  ponytail: fixed 16% stacking offset. Rendered text height is unknown here
 *  (same caveat as clampToSafeZone), so a long title can collide - drag it, or
 *  measure heights if that ever stops being rare. */
function growToFit(spec: FrameSpec, want: number): FrameSpec {
  const base = spec.blocks[0];
  const fillable = spec.blocks.filter(isFillable).length;
  if (!base || want <= fillable) return spec;
  const extra = Array.from({ length: want - fillable }, (_, k) => ({
    ...base,
    y: Math.min(base.y + 16 + k * 16, 92),
    fontSize: Math.round(base.fontSize * BODY_SCALE),
    background: undefined,
    label: "supporting line",
    text: undefined,
  }));
  return { ...spec, blocks: [...spec.blocks, ...extra] };
}

/** One script line into that slide's box texts. A `|` lets the writer fill the
 *  extra boxes by hand ("title | body"); without one the line is just the main
 *  line and `extras` (AI-written, if any) take the rest.
 *  ponytail: fixed separator, make it configurable if `|` ever collides. */
export function splitBoxes(line: string, extras: string[] = []): string[] {
  const parts = line.split("|").map((s) => s.trim());
  return parts.length > 1 ? parts : [parts[0], ...extras];
}

const NUMBER_RE = /^\s*\d+\.\s+/;

/** Strip a leading "3. ", so the toggle is reversible and re-numbering after a
 *  reorder replaces the old number instead of stacking on it. */
const unnumbered = (s: string) => s.replace(NUMBER_RE, "");

/**
 * Add or remove "N. " on each body slide, numbered 1..N within this slideshow.
 * Hook and CTA slides are left alone: they are not points in the list.
 *
 * The number goes on the main line, or on the first written box that has text
 * when the main line is empty - which is what a slide whose title box was never
 * filled looks like.
 *
 * A numbered slide gives up frameUrl, because the number has to be in the
 * pixels. The saved_slides row behind it is never touched: the number belongs
 * to this slideshow, not to the slide in the library, and the same banked slide
 * is point 2 here and point 5 in the next one.
 */
export function numberSlides(
  slides: ComposedSlide[],
  on: boolean,
): ComposedSlide[] {
  let n = 0;
  return slides.map((s) => {
    if (s.role !== "body") return s;
    n++;
    const at = s.spec.blocks.findIndex(
      (b, i) => isFillable(b, i) && (b.text ?? "").trim(),
    );
    if (at < 0) return s;
    const base = unnumbered(s.spec.blocks[at].text ?? "");
    const text = on ? `${n}. ${base}` : base;
    if (text === s.spec.blocks[at].text) return s;
    return {
      ...s,
      frameUrl: undefined,
      spec: {
        ...s.spec,
        blocks: s.spec.blocks.map((b, i) => (i === at ? { ...b, text } : b)),
      },
    };
  });
}

/**
 * Set the title size on every slide and size its written extras relative to it.
 *
 * `titleSize` is a function of the current size so both callers fit: the
 * composer scales each template's own size (`c => c * 1.15`), while "apply to
 * all" forces one exact size copied off the slide you sized by hand (`() => 44`).
 * Scaling is what makes it safe across a batch whose slideshows use different
 * templates, and across the body variants that cycle inside one slideshow.
 *
 * `bodyRatio` omitted means the extras scale by whatever factor the title did,
 * which preserves a template that deliberately sizes its subtitle. Forcing a
 * ratio on every slide by default would silently flatten that, and the template
 * author's sizing is a choice, not a default waiting to be overridden.
 *
 * Only block 0 and labelled extras move. Unlabelled boxes belong to the template
 * - watermarks, page counters - and resizing those is never what was meant.
 */
export function resizeSlides(
  slides: ComposedSlide[],
  titleSize: (current: number) => number,
  bodyRatio?: number,
): ComposedSlide[] {
  return slides.map((s) => {
    const base = s.spec.blocks[0];
    if (!base?.fontSize) return s;
    const title = Math.max(1, Math.round(titleSize(base.fontSize)));
    const factor = title / base.fontSize;
    const blocks = s.spec.blocks.map((b, i) =>
      i === 0
        ? { ...b, fontSize: title }
        : b.label
          ? {
              ...b,
              fontSize: Math.max(
                1,
                Math.round(
                  bodyRatio === undefined ? b.fontSize * factor : title * bodyRatio,
                ),
              ),
            }
          : b,
    );
    if (blocks.every((b, i) => b.fontSize === s.spec.blocks[i].fontSize))
      return s;
    return { ...s, frameUrl: undefined, spec: { ...s.spec, blocks } };
  });
}

/** Move slide `from` to sit at index `to`, where `to` is read before the move -
 *  "drop it here", the same index the drop target renders at. `to === length`
 *  sends it to the end.
 *
 *  Roles ride along rather than being recomputed: the frames are already
 *  rendered in their role's style, so a body slide dragged to the front stays
 *  the body slide it looks like. scriptFromSlides finds the hook by role, not
 *  position, so the saved script survives it.
 *
 *  ponytail: {n}/{total} page counters were resolved at build time and do not
 *  renumber after a move. Re-resolving means re-rendering, which throws away the
 *  banked frames this whole feature exists to reuse. Fix it when a template that
 *  numbers its slides actually gets reordered. */
export function moveSlide<T>(slides: T[], from: number, to: number): T[] {
  if (from < 0 || from >= slides.length) return slides;
  // the arrow buttons hand in i-1 and i+2 unchecked, so the ends land outside
  // the array - clamping is what makes those a no-op instead of a negative
  // splice index, which inserts from the *right*
  const at = Math.max(0, Math.min(to, slides.length));
  if (at === from) return slides;
  const next = [...slides];
  const [moved] = next.splice(from, 1);
  // removing `from` first shifts everything after it left by one
  next.splice(from < at ? at - 1 : at, 0, moved);
  return next;
}

/** One slide back into one script line: every written box, in the composer's own
 *  "title | body" form, so a slide survives a round trip through the textarea
 *  instead of arriving back as its headline alone. `splitBoxes` is the inverse.
 *  Fixed boxes (watermarks, page counters) belong to the template, not the
 *  script, so only block 0 and labelled extras are included. */
export function textsFromSlide(s: { spec: FrameSpec }) {
  return s.spec.blocks
    .filter(isFillable)
    .map((b) => (b.text ?? "").trim())
    .filter(Boolean);
}

export function lineFromSlide(s: { spec: FrameSpec }) {
  return textsFromSlide(s).join(" | ");
}

/** The `script` stored on a slideshow, derived from the frames themselves so it
 *  can never disagree with what was actually rendered. */
export function scriptFromSlides(
  slides: { role: SlideRole; spec: FrameSpec }[],
) {
  const main = lineFromSlide;
  const cta = slides.find((s) => s.role === "cta");
  return {
    hook: main(slides.find((s) => s.role === "hook") ?? slides[0]),
    points: slides.filter((s) => s.role === "body").map(main),
    cta: cta ? main(cta) : null,
  };
}

/** Roll each slide into a concrete frame: jitter, a random anchor zone when the
 *  template defines any, the slide's texts, and its share of the backgrounds.
 *  Backgrounds are shuffled and cycle only after every image has been used.
 *
 *  `items` (an app stack, a countdown) are the opposite: ordered, and bound
 *  positionally - body slide i is about item i - because the order IS the
 *  ranking. Hook and CTA carry the whole list so a `bind: "all"` logo strip
 *  works there, with index 0 for any `bind: "item"` they happen to hold. */
export function buildSlides(
  doc: TemplateDoc,
  slides: { role: SlideRole; texts: string[] }[],
  backgrounds: string[],
  rand: () => number = Math.random,
  items: SlideItem[] = [],
): ComposedSlide[] {
  const backgroundPool = [...backgrounds];
  for (let i = backgroundPool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [backgroundPool[i], backgroundPool[j]] = [backgroundPool[j], backgroundPool[i]];
  }
  let bgCursor = 0;
  const takeBgs = (n: number) =>
    Array.from(
      { length: n },
      () => backgroundPool[bgCursor++ % backgroundPool.length],
    );

  let bodySeen = 0;
  const total = slides.length;

  return slides.map((slide, i) => {
    // body slides cycle through the template's predefined body variants
    const bodyIndex = slide.role === "body" ? bodySeen++ : 0;
    const rolled = resolveFrame(doc, slide.role, rand, bodyIndex);
    // anchors: each generated slide lands in a random allowed zone, alignment
    // follows the zone; dragging afterwards is always free
    if (doc.anchors?.length) {
      const a = doc.anchors[Math.floor(rand() * doc.anchors.length)];
      const main = rolled.blocks[0];
      const { x, y, align } = anchorToPosition(a, main.w);
      // extras ride along, so the slide keeps its composition in every zone
      shiftExtras(rolled.blocks, x - main.x, y - main.y, rolled.icons);
      Object.assign(main, { x, y, align });
    }
    const spec = fillFrame(
      growToFit(rolled, slide.texts.length),
      slide.texts,
      i + 1,
      total,
      items.length
        ? { items, index: slide.role === "body" ? bodyIndex : 0 }
        : undefined,
    );
    return { role: slide.role, bgUrls: takeBgs(spec.bgCount ?? 1), spec };
  });
}

/** Apply one or two deck-wide scene images after slides have been composed.
 * Two images intentionally make one hard scene cut at the midpoint. */
export function applyContinuousScene(
  slides: ComposedSlide[],
  urls: string[],
): ComposedSlide[] {
  if (urls.length < 1 || urls.length > 2) return slides;
  const firstTotal = urls.length === 1 ? slides.length : Math.ceil(slides.length / 2);
  return slides.map((slide, i) => {
    const second = urls.length === 2 && i >= firstTotal;
    const start = second ? firstTotal : 0;
    const total = second ? slides.length - firstTotal : firstTotal;
    return {
      ...slide,
      frameUrl: undefined,
      bgUrls: [urls[second ? 1 : 0]],
      spec: { ...slide.spec, scene: { index: i - start, total } },
    };
  });
}
