"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Select } from "@/components/select";
import { useT } from "@/lib/i18n-client";
import { savedSlideDrag, slideDropProps, type DropHandlers, type SavedSlide } from "./saved-slide-types";
import { Button } from "@/components/ui/button";
export { asComposed, slideDropProps, slideHandleProps } from "./saved-slide-types";
export type { SavedSlide } from "./saved-slide-types";

/** The tip bank as a drag source: tag filter plus a strip of rendered frames.
 *  `children` lands on the right of the header row for per-screen actions.
 *  The tag filter is controlled because the composer's "Deal" button deals from
 *  the same filtered pool the strip is showing. */
export function SavedSlideTray({
  slides,
  tag,
  onTagChange,
  children,
  onLoadMore,
  loadingMore = false,
  availableTags,
}: {
  slides: SavedSlide[];
  tag: string;
  onTagChange: (tag: string) => void;
  children?: ReactNode;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  availableTags?: string[];
}) {
  const t = useT();

  return (
    <div className="panel mb-8 rounded-xl p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="micro">{t("Saved slides")}</span>
        <Select
          value={tag}
          onChange={onTagChange}
          aria-label={t("Filter saved slides by tag")}
          options={[
            { value: "", label: t("All tags") },
            ...(availableTags ?? [...new Set(slides.flatMap((s) => s.tags))])
              .sort()
              .map((x) => ({ value: x, label: x })),
          ]}
        />
        {children}
      </div>
      <p className="mb-2 text-xs text-muted">
        {t("Drag one onto a slide to insert it there, or onto the end to add.")}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {slides
          .filter((s) => !tag || s.tags.includes(tag))
          .map((s) => (
            <div
              key={s.id}
        {...savedSlideDrag(s.id)}
              title={s.name}
              className="w-20 shrink-0 cursor-grab overflow-hidden rounded-lg active:cursor-grabbing"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.frameUrl} alt={s.name} loading="lazy" decoding="async" width={80} height={142} className="aspect-[9/16] w-full object-cover" />
            </div>
          ))}
      </div>
      {onLoadMore && (
        <Button className="mt-3" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? t("Loading…") : t("Load more")}
        </Button>
      )}
    </div>
  );
}

/**
 * Pick banked slides without dragging, several at a time.
 *
 * Same expanding-panel shape as ImagePicker, and for the same reason: this
 * opens inside an already-dense grid column and a modal would be heavier than
 * the job. Dragging is fine for one slide, but filling a slot in each of eight
 * slideshows is a drag per slot, which is what this replaces.
 *
 * Selection is click order, so the order you pick them in is the order they
 * land in.
 */
export function SlidePicker({
  slides,
  onPick,
  label,
  className = "",
}: {
  slides: SavedSlide[];
  /** picked in click order; the caller decides where they go */
  onPick: (picked: SavedSlide[]) => void;
  label: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const confirm = () => {
    const picked = chosen
      .map((id) => slides.find((s) => s.id === id))
      .filter((s): s is SavedSlide => !!s);
    if (picked.length) onPick(picked);
    setChosen([]);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={slides.length === 0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        title={t("Add slides from the bank")}
        className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border-strong px-2 py-1 text-xs text-muted outline-none transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
      >
        {label}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-border bg-surface p-2 shadow-lg shadow-black/50">
          <div className="grid max-h-64 grid-cols-3 gap-1 overflow-y-auto">
            {slides.map((s) => {
              const at = chosen.indexOf(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  title={s.name}
                  onClick={() =>
                    setChosen((c) =>
                      c.includes(s.id)
                        ? c.filter((x) => x !== s.id)
                        : [...c, s.id],
                    )
                  }
                  className={`relative overflow-hidden rounded ${at >= 0 ? "ring-2 ring-accent" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.frameUrl} alt={s.name} loading="lazy" decoding="async" width={80} height={142} className="aspect-[9/16] w-full object-cover" />
                  {at >= 0 && (
                    <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-medium text-accent-ink">
                      {at + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={chosen.length === 0}
            onClick={confirm}
            className="mt-2 w-full rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-ink transition-all hover:brightness-110 disabled:opacity-40"
          >
            {chosen.length
              ? t("Add {count} slides", { count: chosen.length })
              : t("Pick slides to add")}
          </button>
        </div>
      )}
    </div>
  );
}

/** The trailing cell of a slide grid: drop here to append, or pick from the
 *  bank. Sized to a slide so the grid keeps its rhythm. */
export function AppendSlideCell({
  ratio,
  slides,
  onPick,
  ...handlers
}: DropHandlers & {
  ratio: number;
  slides: SavedSlide[];
  onPick: (picked: SavedSlide[]) => void;
}) {
  const t = useT();
  return (
    <div
      {...slideDropProps(handlers)}
      style={{ aspectRatio: ratio }}
      className="mt-6 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong p-3 text-center"
    >
      <SlidePicker
        slides={slides}
        onPick={onPick}
        label={t("+ Add slides")}
        className="w-full"
      />
      <span className="text-[10px] text-muted">{t("or drop one here")}</span>
    </div>
  );
}
