"use client";

import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { DraggablePreview } from "@/components/draggable-preview";
import { ImagePicker } from "@/components/image-picker";
import { Select } from "@/components/select";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n-client";
import { newTextBlock, type ImageCrop } from "@/lib/template-types";
import type { ComposedSlide } from "@/lib/compose";
import type { T } from "@/lib/locales";
import type { ImageLibrary } from "@/lib/image-library";
import { FONT_SUGGESTIONS } from "@/lib/template-types";
import {
  useFontLoaded,
  useRecentFonts,
} from "@/app/(app)/templates/preview";

// b.label is template-authored, so it stays as written; only the fallbacks translate
const blockName = (b: { label?: string }, idx: number, t: T) =>
  b.label ?? (idx === 0 ? t("Main text") : t("Fixed text"));

/** Size steps for a secondary box, as a fraction of the main line. Sizes are px
 *  at a 1080 canvas, so a fraction travels between templates where a raw px
 *  value would not. 0.75 is what compose.ts grows a "title | body" box at. */
export const SIZE_STEPS = [
  { value: "1", label: "Same as title" },
  { value: "0.85", label: "Large" },
  { value: "0.75", label: "Body" },
  { value: "0.6", label: "Small" },
  { value: "0.45", label: "Caption" },
] as const;

/**
 * One editable slide: draggable preview, a textarea for the selected box, and
 * that box's align / size / colour, plus the background picker.
 *
 * Shared by the composer's preview step and the edit page for a saved
 * slideshow, so there is exactly one slide-editing surface in the app.
 *
 * Structural edits (add or remove a box, change a background) go back through
 * one `onSlideChange` rather than a callback each: the parents only have to
 * swap slide i, and the immutable spec rebuilding stays here instead of being
 * copied into both of them.
 */
export function SlideEditor({
  slide,
  index,
  activeBox,
  imageLibrary,
  defaultCollectionId,
  onLoadImageCollection,
  loadedImageCollections,
  loadingImageCollection,
  imageCollectionsWithMore,
  onSelectBox,
  onPatch,
  onSlideChange,
  onSaveSlide,
  onRemove,
  onMove,
  handleProps,
  onApplySizes,
  onExpand,
  expanded = false,
  fontControls = false,
  onApplyFontToAll,
}: {
  slide: ComposedSlide;
  index: number;
  activeBox: number;
  imageLibrary: ImageLibrary;
  defaultCollectionId?: string | null;
  onLoadImageCollection?: (collectionId: string, more?: boolean) => Promise<void>;
  loadedImageCollections?: ReadonlySet<string>;
  loadingImageCollection?: string | null;
  imageCollectionsWithMore?: ReadonlySet<string>;
  onSelectBox: (box: number) => void;
  onPatch: (box: number, patch: Record<string, unknown>) => void;
  onSlideChange: (next: ComposedSlide) => void;
  /** when given, shows "Save slide" to bank this one for reuse */
  onSaveSlide?: () => void;
  /** when given, shows a delete control that drops this slide from the grid */
  onRemove?: () => void;
  /** when given, shows the arrow pair. `delta` is -1 or +1. HTML5 drag has no
   *  keyboard path at all, so this is how the grid is reorderable without a
   *  mouse - same call the video timeline's arrows make. */
  onMove?: (delta: number) => void;
  /** spread onto the header label to make it the reorder drag handle */
  handleProps?: React.HTMLAttributes<HTMLSpanElement> & { draggable?: boolean };
  /** when given, shows "Apply to all", which pushes this slide's title and body
   *  sizes onto every other slide */
  onApplySizes?: () => void;
  onExpand?: () => void;
  /** Compact two-column layout used by the viewport overlay. */
  expanded?: boolean;
  fontControls?: boolean;
  onApplyFontToAll?: (family: string) => void;
}) {
  // clamped: a slide can lose boxes between renders, and a stale index would
  // read undefined off blocks[]
  const bi = Math.min(activeBox, slide.spec.blocks.length - 1);
  const block = slide.spec.blocks[bi];
  const t = useT();
  const [cropCell, setCropCell] = useState<number | null>(null);
  const recentFonts = useRecentFonts();
  const fontStatus = useFontLoaded(block.fontFamily);

  // the size picker is relative to the script line, so the same step reads the
  // same way on any template
  const mainSize = slide.spec.blocks[0]?.fontSize ?? 0;
  const nearestStep = SIZE_STEPS.reduce((best, s) => {
    const r = mainSize ? block.fontSize / mainSize : 1;
    return Math.abs(+s.value - r) < Math.abs(+best.value - r) ? s : best;
  }).value;

  // Any structural edit invalidates a pre-rendered frame. A slide dealt in from
  // the saved-slide library carries frameUrl and createSlideshow reuses it
  // instead of rendering, so keeping it here would silently throw the edit away.
  const change = (next: ComposedSlide) =>
    onSlideChange({ ...next, frameUrl: undefined });

  const setBg = (url: string, cell: number) => {
    const imageCrops = [...(slide.spec.imageCrops ?? [])];
    imageCrops[cell] = { x: 50, y: 50, zoom: 1 };
    change({
      ...slide,
      bgUrls: slide.bgUrls.map((u, i) => (i === cell ? url : u)),
      spec: { ...slide.spec, imageCrops },
    });
  };

  const setCrop = (cell: number, crop: ImageCrop) => {
    const imageCrops = [...(slide.spec.imageCrops ?? [])];
    imageCrops[cell] = crop;
    change({ ...slide, spec: { ...slide.spec, imageCrops } });
  };

  const activeCrop =
    cropCell == null
      ? null
      : slide.spec.imageCrops?.[cropCell] ?? { x: 50, y: 50, zoom: 1 };

  /** `at` is the double-clicked point on the canvas, in % of it */
  const addBox = (at?: { x: number; y: number }) => {
    change({
      ...slide,
      spec: {
        ...slide.spec,
        blocks: [
          ...slide.spec.blocks,
          newTextBlock(slide.spec.blocks[0], at),
        ],
      },
    });
    onSelectBox(slide.spec.blocks.length);
  };

  const removeBox = (idx: number) => {
    // Deleting the main line promotes the next box: jitter, anchors and the
    // saved script all read blocks[0], so a slide must never be left without
    // one. The last box stays - an empty slide has nothing to edit or select.
    if (slide.spec.blocks.length < 2) return;
    const blocks = slide.spec.blocks.filter((_, i) => i !== idx);
    // the promoted box becomes the script line, so it loses its AI label
    if (idx === 0) blocks[0] = { ...blocks[0], label: undefined };
    change({ ...slide, spec: { ...slide.spec, blocks } });
    onSelectBox(Math.max(0, idx - 1));
  };

  return (
    <div
      className={
        expanded
          ? "grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(14rem,22rem)] grid-rows-[auto_minmax(0,1fr)] gap-x-5 gap-y-2"
          : "flex flex-col gap-2"
      }
    >
      <span
        className={`flex items-center justify-between text-xs font-medium uppercase text-muted ${
          expanded ? "col-span-2" : ""
        }`}
      >
        <span
          {...handleProps}
          className={
            handleProps?.draggable
              ? "cursor-grab select-none active:cursor-grabbing"
              : undefined
          }
          title={handleProps?.draggable ? t("Drag to reorder") : undefined}
        >
          {t(slide.role)} {index + 1}
        </span>
        <span className="flex items-center gap-3">
          {onMove && (
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onMove(-1)}
                aria-label={t("Move slide earlier")}
                className="text-muted transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onMove(1)}
                aria-label={t("Move slide later")}
                className="text-muted transition-colors hover:text-foreground"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
          {onSaveSlide && (
            <button
              type="button"
              onClick={onSaveSlide}
              title={t(
                "Bank this slide so it can be dealt into later slideshows without rendering again",
              )}
              className="normal-case tracking-normal text-muted underline hover:text-foreground"
            >
              {t("Save slide")}
            </button>
          )}
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              title={t("Edit fullscreen")}
              aria-label={t("Edit fullscreen")}
              className="text-muted transition-colors hover:text-foreground"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              title={t("Remove this slide")}
              aria-label={t("Remove this slide")}
              className="text-muted transition-colors hover:text-red-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </span>
      <div className={expanded ? "flex min-h-0 items-center justify-center" : ""}>
        <div
          style={{
            aspectRatio: `${slide.spec.width} / ${slide.spec.height}`,
            ...(expanded
              ? {
                  width: `min(100%, calc((100dvh - 8rem) * ${slide.spec.width / slide.spec.height}))`,
                }
              : undefined),
          }}
          className={expanded ? "max-h-full" : "h-full w-full"}
        >
          <DraggablePreview
            frame={slide.spec}
            backgroundUrls={slide.bgUrls}
            className="h-full w-full rounded-md border border-border"
            activeBlock={bi}
            onSelectBlock={onSelectBox}
            onChange={(blockIdx, newX, newY) =>
              onPatch(blockIdx, { x: newX, y: newY })
            }
            onAddBlock={(x, y) => addBox({ x, y })}
            onDeleteBlock={removeBox}
            onResize={(blockIdx, w) => onPatch(blockIdx, { w })}
            cropCell={cropCell}
            onEditImage={setCropCell}
            onImageCropChange={setCrop}
          />
        </div>
      </div>

      <div
        className={`flex min-h-0 flex-col gap-2 ${
          expanded ? "justify-center" : "mt-1"
        }`}
      >
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted">
            {blockName(block, bi, t)}
            {slide.spec.blocks.length > 1 && ` - ${t("click a box to switch")}`}
          </span>
          <textarea
            value={block.text ?? ""}
            onChange={(e) => onPatch(bi, { text: e.target.value })}
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-neutral-500"
            rows={2}
          />
        </label>

        {fontControls && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              list="slideshow-fonts"
              value={block.fontFamily}
              onChange={(e) => onPatch(bi, { fontFamily: e.target.value })}
              onBlur={() => recentFonts.remember(block.fontFamily)}
              aria-label={t("Font family")}
              className="min-w-40 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-foreground outline-none focus:border-border-strong"
            />
            <datalist id="slideshow-fonts">
              {[...recentFonts.fonts, ...FONT_SUGGESTIONS].map((font) => (
                <option key={font} value={font} />
              ))}
            </datalist>
            <span
              className={fontStatus === "missing" ? "text-red-400" : "text-muted"}
            >
              {fontStatus === "missing" ? t("Font not found") : t("Font")}
            </span>
            {onApplyFontToAll && (
              <Button
                variant="ghost"
                onClick={() => onApplyFontToAll(block.fontFamily)}
                disabled={fontStatus === "missing"}
              >
                {t("Apply font to slideshow")}
              </Button>
            )}
          </div>
        )}

        {/* These style the SELECTED box, same as the textarea above them.
            flex-wrap is load-bearing: six controls do not fit one line in a
            grid column, and without it they clipped each other ("Change image"
            rendered as "Chan imag"). shrink-0 keeps each one its own size
            rather than squashing them all to fit. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs [&>*]:shrink-0">
          <Select
            value={block.align}
            onChange={(v) => onPatch(bi, { align: v })}
            options={[
              { value: "left", label: t("Left") },
              { value: "center", label: t("Center") },
              { value: "right", label: t("Right") },
            ]}
            className="px-1"
            aria-label={t("Align")}
          />
          {/* relative picker for secondary boxes only: on the main line every
              step would measure against itself and compound on each change */}
          {bi > 0 && mainSize > 0 && (
            <Select
              value={nearestStep}
              onChange={(v) =>
                onPatch(bi, { fontSize: Math.round(mainSize * Number(v)) })
              }
              options={SIZE_STEPS.map((s) => ({
                value: s.value,
                label: t(s.label),
              }))}
              className="px-1"
              aria-label={t("Text size")}
            />
          )}
          <input
            type="number"
            value={block.fontSize}
            onChange={(e) => onPatch(bi, { fontSize: Number(e.target.value) })}
            className="w-16 rounded-md border border-border bg-surface px-1 py-1 outline-none"
            title={t("Font size")}
          />
          <input
            type="color"
            value={block.color}
            onChange={(e) => onPatch(bi, { color: e.target.value })}
            className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
            title={t("Text color")}
          />
          <button
            type="button"
            onClick={() => addBox()}
            title={t("Add a text box. You can also double-click the preview")}
            className="rounded-md border border-dashed border-border px-2 py-1 text-muted outline-none hover:text-foreground"
          >
            {t("+ Text")}
          </button>
          {onApplySizes && (
            <button
              type="button"
              onClick={onApplySizes}
              title={t(
                "Give every slide this slide's title size, and the same body size relative to it",
              )}
              className="rounded-md border border-border px-2 py-1 text-muted outline-none hover:text-foreground"
            >
              {t("Apply to all")}
            </button>
          )}
          <ImagePicker
            className="ml-auto"
            library={imageLibrary}
            cells={slide.bgUrls}
            onPick={setBg}
            defaultCollectionId={defaultCollectionId}
            onLoadCollection={onLoadImageCollection}
            loadedCollections={loadedImageCollections}
            loadingCollection={loadingImageCollection}
            collectionsWithMore={imageCollectionsWithMore}
          />
        </div>
        {activeCrop && cropCell != null && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent-dim p-2 text-xs">
            <span className="text-muted">{t("Image crop")}</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={activeCrop.zoom}
              onChange={(e) =>
                setCrop(cropCell, {
                  ...activeCrop,
                  zoom: Number(e.target.value),
                })
              }
              aria-label={t("Image zoom")}
              className="w-28 accent-accent"
            />
            <span className="w-10 tabular-nums text-muted">
              {activeCrop.zoom.toFixed(2)}x
            </span>
            <button
              type="button"
              onClick={() => setCrop(cropCell, { x: 50, y: 50, zoom: 1 })}
              className="text-muted hover:text-foreground"
            >
              {t("Reset")}
            </button>
            <button
              type="button"
              onClick={() => setCropCell(null)}
              className="ml-auto text-foreground"
            >
              {t("Done")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function FullscreenSlideDialog({
  index,
  total,
  onIndex,
  onClose,
  children,
}: {
  index: number;
  total: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const step = (delta: number) =>
    onIndex((index + delta + total) % total);

  return (
    <dialog
      ref={ref}
      onClose={(e) => e.target === ref.current && onClose()}
      onClick={(e) => e.target === ref.current && onClose()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        } else if (e.key === "ArrowLeft" && total > 1) step(-1);
        else if (e.key === "ArrowRight" && total > 1) step(1);
      }}
      className="m-auto h-[calc(100dvh-2rem)] max-h-none w-[calc(100vw-2rem)] max-w-6xl overflow-hidden rounded-2xl border border-border bg-background/95 p-0 text-foreground shadow-2xl shadow-black/70 backdrop:bg-black/75"
    >
      <div className="flex h-full min-h-0 flex-col p-4">
        <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm text-muted">
            <button disabled={total < 2} onClick={() => step(-1)}>
              {t("Previous")}
            </button>
            <span className="tabular-nums">
              {index + 1} / {total}
            </span>
            <button disabled={total < 2} onClick={() => step(1)}>
              {t("Next")}
            </button>
          </div>
          <Button variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
            {t("Close")}
          </Button>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </dialog>
  );
}
