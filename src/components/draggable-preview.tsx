"use client";

import { useState, useRef } from "react";
import type { FrameSpec, ImageBox, ImageCrop } from "@/lib/template-types";
import { backgroundCells, FULL_BLEED, SAFE_ZONE } from "@/lib/template-types";
import {
  PreviewBackground,
  PreviewIcons,
  blockTextStyle,
  justify,
  useFontLinks,
} from "@/app/(app)/templates/preview";
import { useT } from "@/lib/i18n-client";

/** Magnetic distance in canvas percent. Close enough to feel intentional but
 * small enough that freely placing a box remains easy. */
const SNAP_TOLERANCE = 1.25;

/** What a pointer gesture is currently moving. Text boxes, icon tiles and the
 *  photo slot are all rects in canvas %, so one drag implementation serves all
 *  three - only the write-back differs. */
type Handle = { kind: "block" | "icon" | "image"; index: number };

export function DraggablePreview({
  frame,
  backgroundUrl,
  backgroundUrls,
  className = "",
  activeBlock,
  onChange,
  onSelectBlock,
  onAddBlock,
  onDeleteBlock,
  onResize,
  activeIcon,
  onSelectIcon,
  onIconChange,
  onIconResize,
  onImageBoxChange,
  imageBoxActive,
  onSelectImageBox,
  cropCell,
  onEditImage,
  onImageCropChange,
}: {
  frame: FrameSpec;
  backgroundUrl?: string;
  backgroundUrls?: string[];
  className?: string;
  /** highlighted block (editor's selected text box) */
  activeBlock?: number;
  onChange: (blockIndex: number, newX: number, newY: number) => void;
  onSelectBlock?: (blockIndex: number) => void;
  /** Icon tiles become draggable when these are supplied. Omit them and the
   *  icons still draw, they just aren't editable - which is what the composer
   *  and the video editor want. */
  activeIcon?: number;
  onSelectIcon?: (iconIndex: number) => void;
  onIconChange?: (iconIndex: number, x: number, y: number) => void;
  onIconResize?: (iconIndex: number, size: number) => void;
  /** The photo slot, dragged and resized like anything else. Its four numbers
   *  were the last thing in this editor you could only type. */
  onImageBoxChange?: (box: ImageBox) => void;
  imageBoxActive?: boolean;
  onSelectImageBox?: () => void;
  /** Double-click selects one rendered image cell for crop adjustment. */
  cropCell?: number | null;
  onEditImage?: (cell: number) => void;
  onImageCropChange?: (cell: number, crop: ImageCrop) => void;
  /** drag the selected box's right edge to set its width. Omit to keep the box
   *  fixed-width (the width is still a % under the hood, but nobody has to
   *  think in them). */
  onResize?: (blockIndex: number, newW: number) => void;
  /** double-click on empty canvas drops a new text box there (% coords).
   *  Omit to keep the preview read-only in that respect. */
  onAddBlock?: (xPct: number, yPct: number) => void;
  /** shows a delete handle on the selected box, including index 0 when the
   *  slide has a spare - the handler decides what gets promoted. */
  onDeleteBlock?: (blockIndex: number) => void;
}) {
  useFontLinks(frame.blocks.map((b) => b.fontFamily));

  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    target: Handle;
    x: number;
    y: number;
    initX: number;
    initY: number;
  } | null>(null);
  /** The active magnetic guides, either the canvas centre or another box edge. */
  const [snapped, setSnapped] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [resize, setResize] = useState<{
    target: Handle;
    x: number;
    y: number;
    initW: number;
    initH: number;
  } | null>(null);
  const [cropDrag, setCropDrag] = useState<{
    x: number;
    y: number;
    crop: ImageCrop;
  } | null>(null);

  const icons = frame.icons ?? [];
  const box = frame.imageBox ?? FULL_BLEED;
  const imageCount = frame.bgCount ?? 1;
  const imageCells = backgroundCells(imageCount);

  /** Where a handle currently sits, in canvas %. */
  const posOf = (h: Handle) =>
    h.kind === "block"
      ? frame.blocks[h.index]
      : h.kind === "icon"
        ? icons[h.index]
        : box;
  /** Its width, for the snap maths and the drag clamp. Icons are square, so
   *  `size` is both. */
  const widthOf = (h: Handle) =>
    h.kind === "block"
      ? frame.blocks[h.index].w
      : h.kind === "icon"
        ? icons[h.index].size
        : box.w;

  const startDrag = (target: Handle) => (e: React.PointerEvent) => {
    e.preventDefault(); // Prevent text selection
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    if (target.kind === "block") onSelectBlock?.(target.index);
    if (target.kind === "icon") onSelectIcon?.(target.index);
    if (target.kind === "image") onSelectImageBox?.();
    const p = posOf(target);
    setDrag({ target, x: e.clientX, y: e.clientY, initX: p.x, initY: p.y });
  };

  const startResize = (target: Handle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation(); // or the box starts dragging under the handle
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    setResize({
      target,
      x: e.clientX,
      y: e.clientY,
      initW: widthOf(target),
      initH: target.kind === "image" ? box.h : 0,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (cropDrag && containerRef.current && cropCell != null) {
      const r = containerRef.current.getBoundingClientRect();
      const dx = ((e.clientX - cropDrag.x) / r.width) * 100;
      const dy = ((e.clientY - cropDrag.y) / r.height) * 100;
      onImageCropChange?.(cropCell, {
        ...cropDrag.crop,
        x: Math.max(0, Math.min(100, cropDrag.crop.x - dx)),
        y: Math.max(0, Math.min(100, cropDrag.crop.y - dy)),
      });
      return;
    }
    if (resize && containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      const dw = ((e.clientX - resize.x) / r.width) * 100;
      const p = posOf(resize.target);
      // floor of 8% (4% for an icon, which is legitimately small) so nothing can
      // be dragged down to an unclickable sliver, and it can grow to the canvas
      // edge but not past it
      if (resize.target.kind === "block")
        onResize?.(
          resize.target.index,
          Math.max(8, Math.min(100 - p.x, resize.initW + dw)),
        );
      else if (resize.target.kind === "icon")
        onIconResize?.(
          resize.target.index,
          Math.max(4, Math.min(100 - p.x, resize.initW + dw)),
        );
      else {
        const dh = ((e.clientY - resize.y) / r.height) * 100;
        onImageBoxChange?.({
          ...box,
          w: Math.max(8, Math.min(100 - box.x, resize.initW + dw)),
          h: Math.max(8, Math.min(100 - box.y, resize.initH + dh)),
        });
      }
      return;
    }
    if (!drag || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const w = widthOf(drag.target);
    // convert dx/dy from pixels to percentages
    const pctX = ((e.clientX - drag.x) / containerRect.width) * 100;
    const pctY = ((e.clientY - drag.y) / containerRect.height) * 100;

    let newX = Math.max(0, Math.min(100 - w, drag.initX + pctX));
    let newY = Math.max(0, Math.min(100, drag.initY + pctY));

    // Snap left, centre and right edges to the canvas centre and nearby boxes.
    // The box height is measured because text wraps, so vertical snapping stays
    // accurate even when a body line is taller than its title.
    const hPct =
      ((e.currentTarget as HTMLElement).getBoundingClientRect().height /
        containerRect.height) *
      100;
    // every draggable rect is a snap target for every other one, so an icon
    // lines up with the headline beside it and not just with the canvas centre
    const key = `${drag.target.kind}:${drag.target.index}`;
    const others = [...containerRef.current.querySelectorAll<HTMLElement>("[data-block]")]
      .filter((el) => el.dataset.block !== key)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          left: ((rect.left - containerRect.left) / containerRect.width) * 100,
          right: ((rect.right - containerRect.left) / containerRect.width) * 100,
          top: ((rect.top - containerRect.top) / containerRect.height) * 100,
          bottom: ((rect.bottom - containerRect.top) / containerRect.height) * 100,
        };
      });
    const xTargets = [50, ...others.flatMap((box) => [box.left, (box.left + box.right) / 2, box.right])];
    const yTargets = [50, ...others.flatMap((box) => [box.top, (box.top + box.bottom) / 2, box.bottom])];
    const snap = (position: number, size: number, targets: number[]) => {
      let best: { value: number; offset: number; delta: number } | null = null;
      for (const offset of [0, size / 2, size]) for (const value of targets) {
        const delta = Math.abs(position + offset - value);
        if (delta <= SNAP_TOLERANCE && (!best || delta < best.delta)) best = { value, offset, delta };
      }
      return best;
    };
    const xSnap = snap(newX, w, xTargets);
    const ySnap = snap(newY, hPct, yTargets);
    if (xSnap) newX = xSnap.value - xSnap.offset;
    if (ySnap) newY = ySnap.value - ySnap.offset;
    if (xSnap?.value !== snapped.x || ySnap?.value !== snapped.y)
      setSnapped({ x: xSnap?.value ?? null, y: ySnap?.value ?? null });

    if (drag.target.kind === "block") onChange(drag.target.index, newX, newY);
    else if (drag.target.kind === "icon")
      onIconChange?.(drag.target.index, newX, newY);
    else onImageBoxChange?.({ ...box, x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setDrag(null);
    setResize(null);
    setCropDrag(null);
    setSnapped({ x: null, y: null });
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  // Double-click on bare canvas = a new text box, placed where you clicked.
  // The safe-zone overlay is pointer-events-none, so anything that is not a
  // block reaches this as the container itself.
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    if ((e.target as HTMLElement).closest("[data-block]")) return;
    const r = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    if (
      onEditImage &&
      x >= box.x &&
      x <= box.x + box.w &&
      y >= box.y &&
      y <= box.y + box.h
    ) {
      const cellX = ((x - box.x) / box.w) * 100;
      const cellY = ((y - box.y) / box.h) * 100;
      const cell = imageCells.findIndex(
        (c) =>
          cellX >= c.x &&
          cellX <= c.x + c.w &&
          cellY >= c.y &&
          cellY <= c.y + c.h,
      );
      onEditImage(Math.max(0, cell));
      return;
    }
    if (!onAddBlock) return;
    onAddBlock(x, y);
  };

  // The script block is flagged when it strays out of the safe zone (SAFE_ZONE
  // is the single source of truth, shared with the generator). Half a percent
  // of slop so a block parked exactly on the line doesn't flicker unsafe.
  const b0 = frame.blocks[0];
  const eps = 0.5;
  const isUnsafe =
    b0.x < SAFE_ZONE.left - eps ||
    b0.y < SAFE_ZONE.top - eps ||
    b0.x + b0.w > 100 - SAFE_ZONE.right + eps ||
    b0.y > 100 - SAFE_ZONE.bottom + eps;

  const bgs = backgroundUrls ?? (backgroundUrl ? [backgroundUrl] : []);

  return (
    <div
      ref={containerRef}
      onDoubleClick={handleDoubleClick}
      className={`relative overflow-hidden select-none ${className} ${
        isUnsafe
          ? "ring-2 ring-red-500 ring-offset-2 ring-offset-background"
          : ""
      }`}
      style={{
        containerType: "inline-size" as never,
        background: frame.bg ?? "#111",
      }}
    >
      <PreviewBackground frame={frame} backgroundUrls={bgs} />

      {cropCell != null && onImageCropChange && (
        <div
          className="absolute z-40 cursor-move border-2 border-accent bg-accent/5"
          style={{
            left: `${box.x + (imageCells[cropCell]?.x ?? 0) * box.w / 100}%`,
            top: `${box.y + (imageCells[cropCell]?.y ?? 0) * box.h / 100}%`,
            width: `${(imageCells[cropCell]?.w ?? 100) * box.w / 100}%`,
            height: `${(imageCells[cropCell]?.h ?? 100) * box.h / 100}%`,
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            setCropDrag({
              x: e.clientX,
              y: e.clientY,
              crop: frame.imageCrops?.[cropCell] ?? {
                x: 50,
                y: 50,
                zoom: 1,
              },
            });
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          title={t("Drag to reposition the image")}
        />
      )}
      <PreviewIcons frame={frame} />

      {/* The photo slot. Four number fields until now, and the only part of a
          template you could not place by looking at it. */}
      {onImageBoxChange && (
        <div
          data-block="image:0"
          onPointerDown={startDrag({ kind: "image", index: 0 })}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          title={t("Drag to move the photo slot")}
          className={`absolute z-20 border-2 border-dashed ${
            imageBoxActive ? "border-accent bg-accent/10" : "border-white/30"
          }`}
          style={{
            left: `${box.x}%`,
            top: `${box.y}%`,
            width: `${box.w}%`,
            height: `${box.h}%`,
            cursor: drag ? "grabbing" : "grab",
          }}
        >
          <span className="micro absolute left-1 top-1 text-white/70">
            {t("photo")}
          </span>
          {imageBoxActive && (
            <span
              onPointerDown={startResize({ kind: "image", index: 0 })}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              title={t("Drag to resize the photo slot")}
              className="absolute -bottom-1.5 -right-1.5 z-30 h-3.5 w-3.5 cursor-nwse-resize rounded-full border border-white/70 bg-accent"
            />
          )}
        </div>
      )}

      {/* Icon tiles: transparent hit targets over what PreviewIcons already
          drew, so the tile itself is never duplicated or restyled here. */}
      {onIconChange &&
        icons.map((ic, i) => (
          <div
            key={i}
            data-block={`icon:${i}`}
            onPointerDown={startDrag({ kind: "icon", index: i })}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            title={t("Drag to move this icon")}
            className={`absolute z-20 rounded-md ${
              activeIcon === i
                ? "outline-dashed outline-1 outline-accent"
                : "outline-dashed outline-1 outline-white/25"
            }`}
            style={{
              left: `${ic.x}%`,
              top: `${ic.y}%`,
              // a strip spans its row width; a lone tile is its own size
              width: ic.bind === "all" ? `${ic.w ?? 100 - 2 * ic.x}%` : `${ic.size}%`,
              // both are one tile TALL, and a tile is square in pixels - which
              // on a 3:4 canvas is a taller number in percent
              height: `${(ic.size * frame.width) / frame.height}%`,
              cursor: drag ? "grabbing" : "grab",
            }}
          >
            {activeIcon === i && (
              <span
                onPointerDown={startResize({ kind: "icon", index: i })}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                title={t("Drag to resize this icon")}
                className="absolute -bottom-1.5 -right-1.5 z-30 h-3 w-3 cursor-nwse-resize rounded-full border border-white/70 bg-accent"
              />
            )}
          </div>
        ))}

      {/* TikTok safe zone: the four bands where its own UI covers the post.
          Always faintly shaded so hand placement can see them; the shading and
          the corridor outline both darken while dragging. Same SAFE_ZONE the
          generator clamps to, so preview and output agree. */}
      <div
        className={`pointer-events-none absolute inset-0 z-10 transition-opacity ${
          drag ? "opacity-100" : "opacity-45"
        }`}
      >
        <div
          className="absolute inset-x-0 top-0 bg-red-500/30"
          style={{ height: `${SAFE_ZONE.top}%` }}
        />
        <div
          className="absolute inset-x-0 bottom-0 bg-red-500/30"
          style={{ height: `${SAFE_ZONE.bottom}%` }}
        />
        <div
          className="absolute left-0 bg-red-500/30"
          style={{
            width: `${SAFE_ZONE.left}%`,
            top: `${SAFE_ZONE.top}%`,
            bottom: `${SAFE_ZONE.bottom}%`,
          }}
        />
        <div
          className="absolute right-0 bg-red-500/30"
          style={{
            width: `${SAFE_ZONE.right}%`,
            top: `${SAFE_ZONE.top}%`,
            bottom: `${SAFE_ZONE.bottom}%`,
          }}
        />
        {/* the safe corridor outline */}
        <div
          className={`absolute rounded-sm border border-dashed ${
            drag ? "border-white/70" : "border-white/30"
          }`}
          style={{
            top: `${SAFE_ZONE.top}%`,
            bottom: `${SAFE_ZONE.bottom}%`,
            left: `${SAFE_ZONE.left}%`,
            right: `${SAFE_ZONE.right}%`,
          }}
        />
      </div>

      {/* Centre guides, the Canva/Photoshop tell: they appear only when the box
          is exactly centred, because the box snapped there. Accent, so they
          read as "you hit it" rather than as more chrome, and above the blocks
          so a line is never hidden behind the text it refers to. */}
      {(snapped.x !== null || snapped.y !== null) && (
        <div className="pointer-events-none absolute inset-0 z-30">
          {snapped.x !== null && (
            <span className="absolute inset-y-0 w-px -translate-x-1/2 bg-accent shadow-[0_0_6px_var(--accent)]" style={{ left: `${snapped.x}%` }} />
          )}
          {snapped.y !== null && (
            <span className="absolute inset-x-0 h-px -translate-y-1/2 bg-accent shadow-[0_0_6px_var(--accent)]" style={{ top: `${snapped.y}%` }} />
          )}
        </div>
      )}

      {frame.blocks.map((b, i) => {
        const text = b.text ?? "";
        // An empty box still needs a hit target, or it can't be selected or
        // dragged. Placeholder is preview-only - renderFrame skips empty
        // blocks, so nothing extra reaches the output image.
        const empty = !text;
        return (
          <div
            key={i}
            data-block={`block:${i}`}
            className={`absolute z-20 flex ${
              activeBlock === i
                ? "outline-dashed outline-1 outline-white/60"
                : ""
            } ${empty ? "outline-dashed outline-1 outline-white/25" : ""}`}
            onPointerDown={startDrag({ kind: "block", index: i })}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: `${b.w}%`,
              justifyContent: justify(b.align),
              cursor: drag ? "grabbing" : "grab",
            }}
          >
            <div
              style={blockTextStyle(b)}
              className={empty ? "opacity-40" : ""}
            >
              {empty ? (b.label ?? t("empty")) : text}
            </div>
            {/* Width handle on the selected box's right edge. A grab bar rather
                than a number field: the box's width decides where the text
                wraps, which is a thing you judge by looking at it. */}
            {onResize && activeBlock === i && (
              <span
                onPointerDown={startResize({ kind: "block", index: i })}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                title={t("Drag to set how wide this text box is")}
                className="absolute -right-1 top-1/2 z-30 h-8 w-2 -translate-y-1/2 cursor-ew-resize rounded-full border border-white/70 bg-accent/80"
              />
            )}

            {/* any box can go, down to the last one - deleting index 0 promotes
                the next box to script line (see removeBox in slide-editor) */}
            {onDeleteBlock && activeBlock === i && frame.blocks.length > 1 && (
              <button
                type="button"
                title={t("Delete this text box")}
                // stops the drag from starting under the button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteBlock(i);
                }}
                className="absolute -right-2 -top-2 z-30 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-xs leading-none text-muted hover:text-red-400"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
