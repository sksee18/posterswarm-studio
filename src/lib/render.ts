import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { readMedia } from "./media";
import type { FrameSpec, IconBlock, ItemMediaBlock, TextBlock } from "./template-types";
import { backgroundCells, FULL_BLEED, resolveIconUrls, resolveItemMedia } from "./template-types";
import { getFontEntries, loadFallbackFont } from "./fonts";

/**
 * Decoded backgrounds, keyed by url.
 *
 * A slideshow renders one frame at a time and its slides usually share a
 * background, so this was downloading and re-encoding identical bytes once per
 * frame - seven times for a seven-slide deck, and that cost is most of why only
 * one pipeline fits in a cron tick.
 *
 * ponytail: bounded FIFO, not an LRU with TTLs. These urls are content-addressed
 * in practice (storage keys are unique per upload, pin urls are stable), so a
 * stale entry is not really reachable; the cap is only here to keep a long-lived
 * lambda from holding every background it has ever drawn.
 */
const bgCache = new Map<string, string>();
const BG_CACHE_MAX = 8;

/** Fetch an image (http or local /uploads path) into a data URI for satori.
 *  `alpha` keeps transparency by encoding PNG instead of JPEG - an app icon
 *  with a transparent corner would otherwise come back matted onto black. */
async function toDataUri(url: string, alpha = false): Promise<string> {
  if (url.startsWith("data:")) return url;

  const key = alpha ? `png:${url}` : url;
  const hit = bgCache.get(key);
  if (hit) return hit;

  const buf = await readMedia(url);

  // convert all images (including heic, webp) to a format satori can decode
  const out = alpha
    ? await sharp(buf).png().toBuffer()
    : await sharp(buf).jpeg().toBuffer();
  const uri = `data:image/${alpha ? "png" : "jpeg"};base64,${out.toString("base64")}`;

  if (bgCache.size >= BG_CACHE_MAX)
    bgCache.delete(bgCache.keys().next().value!);
  bgCache.set(key, uri);
  return uri;
}

type El = { type: string; props: Record<string, unknown> };
const el = (
  type: string,
  style: Record<string, unknown>,
  children?: El[] | string,
  extra?: Record<string, unknown>,
): El => ({ type, props: { style, children, ...extra } });

// ponytail: strip emoji/arrows/symbols the bundled fonts have no glyphs for -
// satori renders them as tofu boxes. Upgrade path: satori's loadAdditionalAsset
// with an emoji CDN if emoji-in-slides ever matters.
//
// Newlines survive (the text div is `pre-wrap`): a long-note slide is written as
// paragraphs and flattening it into one block destroys the whole look. Runs of
// blank lines collapse to one so a stray triple-return can't blow the layout.
export function sanitizeText(text: string): string {
  return text
    .replace(/[←-⇿☀-➿⬀-⯿]|\p{Extended_Pictographic}/gu, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]*\n[^\S\n]*/g, "\n")
    .trim();
}

function blockEl(
  b: TextBlock,
  text: string,
  width: number,
  height: number,
): El {
  return el(
    "div",
    {
      position: "absolute",
      left: (b.x / 100) * width,
      top: (b.y / 100) * height,
      width: (b.w / 100) * width,
      display: "flex",
      justifyContent:
        b.align === "center"
          ? "center"
          : b.align === "right"
            ? "flex-end"
            : "flex-start",
    },
    [
      el(
        "div",
        {
          fontSize: b.fontSize,
          fontFamily: b.fontFamily,
          fontWeight: b.fontWeight,
          color: b.color,
          textAlign: b.align,
          lineHeight: b.lineHeight,
          whiteSpace: "pre-wrap",
          ...(b.shadow ? { textShadow: b.shadow } : {}),
          ...(b.background
            ? {
                backgroundColor: b.background,
                padding: b.padding ?? 0,
                borderRadius: b.radius ?? 0,
              }
            : {}),
        },
        b.uppercase ? text.toUpperCase() : text,
      ),
    ],
  );
}

/** One icon tile: a rounded, clipped wrapper carrying the shadow, with the
 *  square image inside it. satori supports neither `filter` nor a shadow on an
 *  <img>, so the wrapper is what makes the reference's drop-shadow reachable. */
function iconTile(src: string, px: number, ic: IconBlock): El {
  return el(
    "div",
    {
      display: "flex",
      width: px,
      height: px,
      borderRadius: ((ic.radius ?? 24) / 100) * px,
      overflow: "hidden",
      ...(ic.shadow ? { boxShadow: ic.shadow } : {}),
    },
    [el("img", { width: px, height: px, objectFit: "cover" }, undefined, { src })],
  );
}

function iconEl(
  ic: IconBlock,
  srcs: string[],
  width: number,
  height: number,
): El {
  const px = (ic.size / 100) * width;
  const tiles = srcs.map((s) => iconTile(s, px, ic));
  if (ic.bind !== "all")
    return el(
      "div",
      { position: "absolute", left: (ic.x / 100) * width, top: (ic.y / 100) * height, display: "flex" },
      tiles,
    );
  // the cover slide's logo strip: however many items there are, centred and
  // wrapping, so five apps and eight apps both look composed
  return el(
    "div",
    {
      position: "absolute",
      left: (ic.x / 100) * width,
      top: (ic.y / 100) * height,
      width: ((ic.w ?? 100 - 2 * ic.x) / 100) * width,
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "center",
      gap: ((ic.gap ?? 3) / 100) * width,
    },
    tiles,
  );
}

function mediaEl(m: ItemMediaBlock, srcs: string[], width: number, height: number): El {
  const gap = ((m.gap ?? 2) / 100) * width;
  const totalW = (m.w / 100) * width;
  const cellW = (totalW - gap * (srcs.length - 1)) / srcs.length;
  return el("div", {
    position: "absolute", left: (m.x / 100) * width, top: (m.y / 100) * height,
    width: totalW, height: (m.h / 100) * height, display: "flex", gap,
  }, srcs.map((src) => el("div", {
    width: cellW, height: "100%", display: "flex", overflow: "hidden",
    borderRadius: ((m.radius ?? 0) / 100) * width,
  }, [el("img", { width: "100%", height: "100%", objectFit: m.fit ?? "cover" }, undefined, { src })])));
}

/** Render one slideshow frame to a JPEG buffer.
 *  Every block draws its own `text` - the caller fills those in at compose time
 *  (see lib/compose.ts). `backgrounds` supplies one url per background cell.
 *
 *  `opts.transparent` renders the text ALONE on a transparent canvas and returns
 *  PNG rather than JPEG - that is a video's text layer (see renderTextLayer). */
export async function renderFrame(
  spec: FrameSpec,
  backgrounds: string | string[],
  opts?: { transparent?: boolean },
): Promise<Buffer> {
  const { width, height, dim, blocks } = spec;
  const transparent = opts?.transparent === true;
  const bgUrls = Array.isArray(backgrounds) ? backgrounds : [backgrounds];
  const n = transparent ? 0 : (spec.bgCount ?? 1);
  const cells = await Promise.all(
    Array.from({ length: n }, async (_, i) => {
      try {
        return await toDataUri(bgUrls[i % bgUrls.length]);
      } catch {
        return null;
      }
    }),
  );
  const layout = backgroundCells((spec.bgCount ?? 1));
  // the image grid fills a rect, not necessarily the canvas - a template can
  // drop the photo into a slot and leave the rest of the canvas its own colour
  const box = spec.imageBox ?? FULL_BLEED;
  const boxX = (box.x / 100) * width;
  const boxY = (box.y / 100) * height;
  const boxW = (box.w / 100) * width;
  const boxH = (box.h / 100) * height;
  const cropAt = (i: number) => spec.imageCrops?.[i] ?? { x: 50, y: 50, zoom: 1 };

  const texts = blocks.map((b) => sanitizeText(b.text ?? ""));

  // Icons are decoded up front because the tree has to be built synchronously.
  // A failed icon is dropped rather than thrown: a background is the slide, an
  // app tile is one element on it, and losing a whole slideshow
  // because one CDN blinked is the wrong trade.
  const iconBlocks = transparent ? [] : (spec.icons ?? []);
  const iconSrcs = new Map<string, string>();
  const mediaBlocks = transparent ? [] : (spec.media ?? []);
  const mediaSrcs = new Map<string, string>();
  await Promise.all(
    [...new Set(iconBlocks.flatMap((ic) => resolveIconUrls(ic, spec)))].map(
      async (url) => {
        try {
          iconSrcs.set(url, await toDataUri(url, true));
        } catch {
          /* skip this tile */
        }
      },
    ),
  );
  await Promise.all(
    [...new Set(mediaBlocks.flatMap((m) => resolveItemMedia(m, spec)))].map(async (url) => {
      try {
        mediaSrcs.set(url, await toDataUri(url));
      } catch {
        /* skip this screenshot */
      }
    }),
  );

  const scene = spec.scene;
  const backgroundEls = scene && cells[0]
    ? [
        el(
          "div",
          {
            position: "absolute",
            left: boxX,
            top: boxY,
            width: boxW,
            height: boxH,
            overflow: "hidden",
            display: "flex",
          },
          [
            el(
              "img",
              {
                ...(() => {
                  const crop = cropAt(0);
                  return {
                    left:
                      -scene.index * boxW * crop.zoom +
                      ((50 - crop.x) / 100) * boxW,
                    top: ((50 - crop.y) / 100) * boxH,
                    width: boxW * scene.total * crop.zoom,
                    height: boxH * crop.zoom,
                  };
                })(),
                position: "absolute",
                objectFit: "cover",
              },
              undefined,
              { src: cells[0] },
            ),
          ],
        ),
      ]
    : cells.flatMap((src, i) => {
        if (!src) return [];
        const crop = cropAt(i);
        const cell = layout[i];
        return [el(
          "div",
          {
            position: "absolute",
            left: boxX + (cell.x / 100) * boxW,
            top: boxY + (cell.y / 100) * boxH,
            width: (cell.w / 100) * boxW,
            height: (cell.h / 100) * boxH,
            overflow: "hidden",
            display: "flex",
          },
          [
            el(
              "img",
              {
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: `${crop.x}% ${crop.y}%`,
                transform: `scale(${crop.zoom})`,
                transformOrigin: `${crop.x}% ${crop.y}%`,
              },
              undefined,
              { src },
            ),
          ],
        )];
      });

  const tree = el(
    "div",
    {
      width,
      height,
      display: "flex",
      position: "relative",
      // satori emits a transparent root's full-canvas rect inside a <mask>
      // instead of as a paint, which is what lets resvg keep the alpha
      backgroundColor: transparent ? "transparent" : (spec.bg ?? "#000"),
    },
    [
      ...backgroundEls,
      // the dim is an image dimmer, so it covers the image rect - identical to
      // the whole canvas when the image is full bleed
      el("div", {
        position: "absolute",
        left: boxX,
        top: boxY,
        width: boxW,
        height: boxH,
        backgroundColor: `rgba(0,0,0,${dim})`,
      }),
      // icons under the text: a long app name should overlap its own tile
      // rather than disappear behind it
      ...iconBlocks.flatMap((ic) => {
        const srcs = resolveIconUrls(ic, spec).flatMap((u) => {
          const s = iconSrcs.get(u);
          return s ? [s] : [];
        });
        return srcs.length ? [iconEl(ic, srcs, width, height)] : [];
      }),
      ...mediaBlocks.flatMap((m) => {
        const srcs = resolveItemMedia(m, spec).flatMap((u) => {
          const src = mediaSrcs.get(u);
          return src ? [src] : [];
        });
        return srcs.length ? [mediaEl(m, srcs, width, height)] : [];
      }),
      ...blocks.flatMap((b, i) =>
        texts[i] ? [blockEl(b, texts[i], width, height)] : [],
      ),
    ],
  );

  const wanted = new Map(
    blocks.map((b) => [`${b.fontFamily}:${b.fontWeight}`, b]),
  );
  const fonts = (
    await Promise.all(
      [...wanted.values()].map((b) =>
        getFontEntries(b.fontFamily, b.fontWeight),
      ),
    )
  ).flat();

  // any script the template font can't draw (CJK, Thai, Cyrillic, ...) is
  // fetched on demand as a subsetted Noto face, so nothing renders as tofu.
  // A few scripts (Arabic) use OpenType shaping satori's engine can't do and
  // throw mid-render; rather than fail the whole slideshow, retry without the
  // fallback so those degrade to tofu while every other script still renders.
  let svg: string;
  try {
    svg = await satori(tree as never, {
      width,
      height,
      fonts,
      loadAdditionalAsset: (code: string, segment: string) =>
        loadFallbackFont(code, segment) as never,
    });
  } catch {
    svg = await satori(tree as never, { width, height, fonts });
  }

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
  }).render();
  const pngBuf = Buffer.from(png.asPng());
  // resvg emits colour type 6 (truecolour + alpha); the sharp jpeg step is the
  // only thing that flattens it, so a text layer returns before it
  if (transparent) return pngBuf;
  return sharp(pngBuf).jpeg({ quality: 90 }).toBuffer();
}

/**
 * A video's text cue as a transparent PNG, drawn over the cutting photos by the
 * canvas at playback time. Deliberately the same renderer as every still: text
 * in a video comes out identical to text in a carousel, and there is no second
 * text layout engine to keep in sync with this file and templates/preview.tsx.
 *
 * The spec's `dim` still paints, so a cue with dim > 0 carries its own
 * full-frame scrim for legibility over a busy photo at no extra cost.
 */
export const renderTextLayer = (spec: FrameSpec): Promise<Buffer> =>
  renderFrame(spec, [], { transparent: true });
