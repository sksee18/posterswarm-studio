"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Select } from "@/components/select";
import type { ImageLibrary } from "@/lib/image-library";
import { useT } from "@/lib/i18n-client";

/** Compact image picker with an optional collection filter. */
export function ImagePicker({
  library,
  cells,
  onPick,
  defaultCollectionId,
  onLoadCollection,
  loadedCollections,
  loadingCollection,
  collectionsWithMore,
  className = "",
}: {
  library: ImageLibrary;
  cells: string[];
  onPick: (url: string, cell: number) => void;
  defaultCollectionId?: string | null;
  onLoadCollection?: (collectionId: string, more?: boolean) => Promise<void>;
  loadedCollections?: ReadonlySet<string>;
  loadingCollection?: string | null;
  collectionsWithMore?: ReadonlySet<string>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [cell, setCell] = useState(0);
  const [collectionId, setCollectionId] = useState(() =>
    defaultCollectionId &&
    library.collections.some(({ id }) => id === defaultCollectionId)
      ? defaultCollectionId
      : "all",
  );
  const [loadError, setLoadError] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const t = useT();
  const requestCollection = async (id: string, more = false) => {
    if (!onLoadCollection) return;
    setLoadError("");
    try {
      await onLoadCollection(id, more);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t("Could not load images"));
    }
  };

  const active = Math.min(cell, Math.max(0, cells.length - 1));
  const shown =
    collectionId === "all"
      ? library.images
      : library.images.filter((image) =>
          image.collectionIds.includes(collectionId),
        );

  useLayoutEffect(() => {
    const button = buttonRef.current;
    const panel = panelRef.current;
    if (!open || !button || !panel) return;

    panel.showPopover();
    const place = () => {
      const trigger = button.getBoundingClientRect();
      const width = Math.min(288, window.innerWidth - 16);
      const height = panel.offsetHeight;
      const below = trigger.bottom + 8;
      const top =
        below + height <= window.innerHeight - 8
          ? below
          : Math.max(8, trigger.top - height - 8);
      const left = Math.min(
        Math.max(8, trigger.right - width),
        window.innerWidth - width - 8,
      );
      panel.style.width = `${width}px`;
      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !buttonRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div className={className}>
      <button
        ref={buttonRef}
        type="button"
        disabled={library.images.length === 0}
        onClick={() => setOpen((current) => !current)}
        title={t("Change background image")}
        className="rounded-md border border-border bg-surface px-2 py-1 text-foreground outline-none hover:bg-neutral-800 disabled:opacity-40"
      >
        {t("Change image")}
      </button>

      {open && (
        <div
          ref={panelRef}
          popover="manual"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
          style={{ position: "fixed", inset: "auto", margin: 0 }}
          className="rounded-md border border-border bg-surface p-2 text-foreground shadow-2xl"
        >
          <Select
            value={collectionId}
            onChange={(value) => {
              setCollectionId(value);
              if (onLoadCollection && !loadedCollections?.has(value)) void requestCollection(value);
            }}
            options={[
              { value: "all", label: t("All images") },
              ...library.collections.map((collection) => ({
                value: collection.id,
                label: collection.name,
              })),
            ]}
            className="mb-2 w-full text-xs"
            aria-label={t("Image library")}
          />

          {cells.length > 1 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {cells.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setCell(index)}
                  className={`rounded border px-2 py-1 text-xs ${
                    index === active
                      ? "border-accent text-accent"
                      : "border-border text-muted"
                  }`}
                >
                  {t("Slot {n}", { n: index + 1 })}
                </button>
              ))}
            </div>
          )}

          {loadingCollection === collectionId ? (
            <p className="py-8 text-center text-xs text-muted" role="status">{t("Loading images...")}</p>
          ) : <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto">
            {shown.map((image) => (
              <button
                key={image.id}
                type="button"
                onClick={() => {
                  onPick(image.url, active);
                  setOpen(false);
                }}
                className={`overflow-hidden rounded ${
                  cells[active] === image.url ? "ring-2 ring-accent" : ""
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              </button>
            ))}
            {shown.length === 0 && (
              <p className="col-span-full py-8 text-center text-xs text-muted">
                {t("No images in this collection")}
              </p>
            )}
          </div>}
          {loadError && <p className="mt-2 text-xs text-red-400" role="alert">{loadError}</p>}
          {onLoadCollection && collectionsWithMore?.has(collectionId) && loadingCollection !== collectionId && (
            <button type="button" onClick={() => void requestCollection(collectionId, true)} className="mt-2 w-full rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-foreground">
              {t("Load more")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
