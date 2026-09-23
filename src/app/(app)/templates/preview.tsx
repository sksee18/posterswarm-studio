"use client";

/**
 * CSS mirror of lib/render.ts - same TemplateDoc, same layout rules,
 * rendered as scaled DOM for instant preview. Font sizes scale with
 * container width via container query units against a 1080-wide canvas.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { FrameSpec, TextBlock } from "@/lib/template-types";
import { backgroundCells, FULL_BLEED, resolveIconUrls, resolveItemMedia } from "@/lib/template-types";

/**
 * Load a family from Google Fonts for the browser preview, at every weight the
 * renderer can use (FontWeight in lib/fonts.ts is 400/700/800).
 *
 * The `wght` axis is the whole point. `css2?family=X` alone serves the 400 face
 * only, so a block at weight 700 got a browser-synthesised bold - measured
 * 2026-08-06: TikTok Sans faux-700 lays "1. What this ingredient actually does"
 * out 5.6% narrower than the real 700 face (879px against 929px in a 909px box).
 * The preview fitted it on one line, satori wrapped it onto two, and the second
 * line landed on top of the box below. That is the "perfect in the preview,
 * jumbled after render" bug.
 *
 * Asking for a weight a family hasn't got is safe in this combined form (checked
 * across FONT_SUGGESTIONS: `Alfa+Slab+One:wght@400;700;800` is a 200 serving
 * plain 400 faces, while `:wght@700` on its own is a 400 error). Those families
 * then draw their regular face, which is exactly what getFontEntries falls back
 * to server-side.
 */
function ensureFontLink(family: string) {
  const id = "gf-" + family.replace(/\W+/g, "-").toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700;800&display=swap`;
  document.head.appendChild(link);
}

export function useFontLinks(families: string[]) {
  const key = families.join("|");
  useEffect(() => {
    key.split("|").forEach((f) => f && ensureFontLink(f));
  }, [key]);
}

/**
 * Fonts this browser has successfully used before, so a family is typed once and
 * picked from a list forever after.
 *
 * localStorage, not the database: it is a per-person convenience with no bearing
 * on what renders, and a schema column plus an action for it would be more
 * machinery than the feature.
 *
 * useSyncExternalStore rather than useState + a mount effect, because the value
 * lives outside React and reading it in an effect both trips this repo's
 * set-state-in-effect lint rule and renders one frame of the wrong list.
 */
const RECENT_KEY = "recent-fonts";
const RECENT_MAX = 12;
const listeners = new Set<() => void>();

function readRecent(): string {
  try {
    return localStorage.getItem(RECENT_KEY) ?? "[]";
  } catch {
    return "[]"; // Safari private mode throws on localStorage
  }
}

function writeRecent(next: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, RECENT_MAX)));
  } catch {
    /* nothing to do - the picker just won't remember */
  }
  listeners.forEach((l) => l());
}

export function useRecentFonts() {
  const raw = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      // `storage` fires only in OTHER tabs, so the local set above notifies too
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    readRecent,
    () => "[]", // server snapshot: no localStorage, so nothing is remembered yet
  );

  const fonts = useMemo<string[]>(() => {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }, [raw]);

  return {
    fonts,
    /** most recent first, deduped case-insensitively */
    remember(family: string) {
      const f = family.trim();
      if (!f) return;
      const rest = fonts.filter((x) => x.toLowerCase() !== f.toLowerCase());
      if (fonts[0]?.toLowerCase() === f.toLowerCase()) return; // already on top
      writeRecent([f, ...rest]);
    },
    forget(family: string) {
      writeRecent(fonts.filter((x) => x !== family));
    },
  };
}

/** Did the family actually resolve to a real face? Any Google Fonts name works,
 *  so a typo silently falls back to Inter and the only symptom is "my font did
 *  nothing". Shared by the template editor and the video editor. */
export function useFontLoaded(family: string): "loading" | "ok" | "missing" {
  // The answer is stored WITH the family it is about, so "loading" is derived
  // rather than set. Resetting state at the top of the effect would both trip
  // the set-state-in-effect rule and let a slow resolve for a previous family
  // land on the current one.
  const [done, setDone] = useState<{
    family: string;
    status: "ok" | "missing";
  } | null>(null);

  useEffect(() => {
    if (!family.trim()) return;
    let live = true;
    const settle = (status: "ok" | "missing") =>
      live && setDone({ family, status });
    const t = setTimeout(() => {
      document.fonts
        .load(`16px "${family}"`)
        .then((faces) => settle(faces.length > 0 ? "ok" : "missing"))
        .catch(() => settle("missing"));
    }, 600); // debounce typing + give the stylesheet time to attach
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [family]);

  return done?.family === family ? done.status : "loading";
}

/** Shared inner-text styling for both preview components. */
export function blockTextStyle(b: TextBlock): React.CSSProperties {
  return {
    // px at 1080 canvas → cqw (container query width units)
    fontSize: `${(b.fontSize / 1080) * 100}cqw`,
    fontFamily: `'${b.fontFamily}', var(--font-inter), sans-serif`,
    fontWeight: b.fontWeight,
    // satori never fakes a weight it hasn't got, so neither may the preview:
    // where a family has no bold face both now draw the regular one (see
    // ensureFontLink). Without this the browser smears a fake bold and the two
    // wrap at different words.
    fontSynthesis: "none",
    color: b.color,
    textAlign: b.align,
    lineHeight: b.lineHeight,
    whiteSpace: "pre-wrap",
    textTransform: b.uppercase ? "uppercase" : "none",
    ...(b.shadow ? { textShadow: b.shadow } : {}),
    ...(b.background
      ? {
          background: b.background,
          padding: `${((b.padding ?? 0) / 1080) * 100}cqw`,
          borderRadius: `${((b.radius ?? 0) / 1080) * 100}cqw`,
        }
      : {}),
  };
}

export const justify = (align: TextBlock["align"]) =>
  align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";

/** Background layer laid into frame.imageBox, or the whole canvas by default. */
export function PreviewBackground({
  frame,
  backgroundUrls,
}: {
  frame: FrameSpec;
  backgroundUrls: string[];
}) {
  const n = frame.bgCount ?? 1;
  const cells = backgroundCells(n);
  const box = frame.imageBox ?? FULL_BLEED;
  const cropAt = (i: number) => frame.imageCrops?.[i] ?? { x: 50, y: 50, zoom: 1 };
  const sceneCrop = cropAt(0);
  const rect: React.CSSProperties = {
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.w}%`,
    height: `${box.h}%`,
  };
  return (
    <>
      {frame.scene ? (
        <div className="pointer-events-none absolute overflow-hidden" style={rect}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={backgroundUrls[0]}
            alt=""
            className="absolute top-0 h-full max-w-none object-cover"
            style={{
              width: `${frame.scene.total * 100 * sceneCrop.zoom}%`,
              height: `${100 * sceneCrop.zoom}%`,
              left: `${
                -frame.scene.index * 100 * sceneCrop.zoom +
                (50 - sceneCrop.x)
              }%`,
              top: `${50 - sceneCrop.y}%`,
            }}
          />
        </div>
      ) : (
        <div className="pointer-events-none absolute" style={rect}>
          {cells.map((cell, i) => {
          const url = backgroundUrls[i % backgroundUrls.length];
          const crop = cropAt(i);
          return url ? (
            <div
              key={i}
              className="absolute overflow-hidden"
              style={{
                left: `${cell.x}%`,
                top: `${cell.y}%`,
                width: `${cell.w}%`,
                height: `${cell.h}%`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  objectPosition: `${crop.x}% ${crop.y}%`,
                  transform: `scale(${crop.zoom})`,
                  transformOrigin: `${crop.x}% ${crop.y}%`,
                }}
              />
            </div>
          ) : (
            <div key={i} />
          );
          })}
        </div>
      )}
      <div
        className="pointer-events-none absolute"
        style={{ ...rect, background: `rgba(0,0,0,${frame.dim})` }}
      />
    </>
  );
}

/**
 * Icon tiles: the mirror of iconEl in lib/render.ts. Sizes are % of the canvas
 * width, which for an absolutely-positioned child of the canvas is what a plain
 * `%` width already means, so no cqw conversion is needed here - only the row
 * gap needs cqw, because a flex `gap` in % resolves against the row, not the
 * canvas.
 */
export function PreviewIcons({ frame }: { frame: FrameSpec }) {
  return (
    <>
      {(frame.icons ?? []).map((ic, i) => {
        const srcs = resolveIconUrls(ic, frame);
        if (!srcs.length) return null;
        const tiles = srcs.map((src, k) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={k}
            src={src}
            alt=""
            className="h-full w-full object-cover"
            style={{
              width: ic.bind === "all" ? `${ic.size}cqw` : "100%",
              height: ic.bind === "all" ? `${ic.size}cqw` : "100%",
              borderRadius: `${ic.radius ?? 24}%`,
              ...(ic.shadow ? { boxShadow: ic.shadow } : {}),
            }}
          />
        ));
        return (
          <div
            key={i}
            className="pointer-events-none absolute flex"
            style={
              ic.bind === "all"
                ? {
                    left: `${ic.x}%`,
                    top: `${ic.y}%`,
                    width: `${ic.w ?? 100 - 2 * ic.x}%`,
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: `${ic.gap ?? 3}cqw`,
                  }
                : {
                    left: `${ic.x}%`,
                    top: `${ic.y}%`,
                    width: `${ic.size}%`,
                    aspectRatio: "1",
                  }
            }
          >
            {tiles}
          </div>
        );
      })}
    </>
  );
}

function PreviewItemMedia({ frame }: { frame: FrameSpec }) {
  return (frame.media ?? []).map((m, i) => {
    const srcs = resolveItemMedia(m, frame);
    if (!srcs.length) return null;
    return <div key={i} className="pointer-events-none absolute flex overflow-hidden" style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.w}%`, height: `${m.h}%`, gap: `${m.gap ?? 2}cqw`, borderRadius: `${m.radius ?? 0}cqw` }}>
      {srcs.map((src, k) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={k} src={src} alt="" className="min-w-0 flex-1" style={{ objectFit: m.fit ?? "cover" }} />
      ))}
    </div>;
  });
}

export function TemplatePreview({
  frame,
  backgroundUrl,
  className = "",
}: {
  frame: FrameSpec;
  backgroundUrl?: string;
  className?: string;
}) {
  useFontLinks(frame.blocks.map((b) => b.fontFamily));

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        containerType: "inline-size" as never,
        background: frame.bg ?? "#111",
      }}
    >
      <PreviewBackground
        frame={frame}
        backgroundUrls={backgroundUrl ? [backgroundUrl] : []}
      />
      <PreviewIcons frame={frame} />
      <PreviewItemMedia frame={frame} />
      {frame.blocks.map((b, i) => {
        const t = b.text ?? "";
        if (!t) return null;
        return (
          <div
            key={i}
            className="absolute flex"
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: `${b.w}%`,
              justifyContent: justify(b.align),
            }}
          >
            <div style={blockTextStyle(b)}>{t}</div>
          </div>
        );
      })}
    </div>
  );
}
