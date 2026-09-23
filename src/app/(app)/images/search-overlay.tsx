"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Maximize2, X } from "lucide-react";
import type { PinResult } from "@/lib/pinterest";
import { ImageLightbox } from "@/components/image-lightbox";
import { pinterestSearch, savePins } from "./actions";
import { CollectionPicker } from "./images-client";
import type { ImageLibrary } from "@/lib/image-library";
import { readHiResMin, writeHiResMin } from "./filter-pref";
import { useT } from "@/lib/i18n-client";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ponytail: cap the auto-fill below so a filter that matches nothing can't walk
// the whole result set. Raise it if real searches hit the cap.
const AUTOFILL_MAX = 10;

export function SearchOverlay({
  collections,
  onClose,
  onSaved,
}: {
  collections: { id: string; name: string }[];
  onClose: () => void;
  onSaved?: (saved: ImageLibrary) => void;
}) {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(""); // the query the results belong to
  const [pins, setPins] = useState<PinResult[] | null>(null);
  const [bookmark, setBookmark] = useState<string | null>(null);
  const [hiResOnly, setHiResOnly] = useState(false);
  // threshold is a per-browser setting, edited right here where it acts
  const [minRes, setMinRes] = useState(readHiResMin);
  const [pinSel, setPinSel] = useState<
    Map<string, { pin: PinResult; query: string }>
  >(new Map());
  const [pinError, setPinError] = useState("");
  const [picking, setPicking] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [loadingMore, startLoadMore] = useTransition();
  const t = useT();
  const toast = useToast();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoFills = useRef(0);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  const shown = (pins ?? []).filter((p) => !hiResOnly || p.width >= minRes);

  // JS masonry: place each pin in the currently-shortest column so loading a
  // page only grows columns downward. CSS `columns` rebalances all columns on
  // append, which reshuffles already-shown images sideways. Equal-width columns
  // mean rendered height is proportional to height/width. `i` is kept for the
  // lightbox, which indexes into `shown`.
  const COLS = 4;
  const columns: { p: PinResult; i: number }[][] = Array.from(
    { length: COLS },
    () => [],
  );
  const colHeights = new Array(COLS).fill(0);
  shown.forEach((p, i) => {
    let k = 0;
    for (let j = 1; j < COLS; j++) if (colHeights[j] < colHeights[k]) k = j;
    columns[k].push({ p, i });
    colHeights[k] += p.height / (p.width || 1);
  });

  function search() {
    const q = query.trim();
    if (!q) return;
    setPinError("");
    setPins(null);
    setBookmark(null);
    autoFills.current = 0;
    start(async () => {
      try {
        const page = await pinterestSearch(q);
        setSearched(q);
        setPins(page.results);
        setBookmark(page.bookmark);
      } catch (e) {
        setPinError(e instanceof Error ? e.message : t("Search failed"));
      }
    });
  }

  function loadMore() {
    if (!bookmark || loadingMore) return;
    startLoadMore(async () => {
      try {
        const page = await pinterestSearch(searched, bookmark);
        setPins((prev) => {
          const seen = new Set((prev ?? []).map((p) => p.id));
          return [
            ...(prev ?? []),
            ...page.results.filter((p) => !seen.has(p.id)),
          ];
        });
        setBookmark(page.bookmark);
      } catch (e) {
        setPinError(e instanceof Error ? e.message : t("Loading more failed"));
      }
    });
  }

  // infinite scroll: next page when the user scrolls within 300px of the bottom
  // (plain scroll handler - IntersectionObserver proved unreliable in embedded browsers)
  function maybeLoadMore() {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) loadMore();
  }

  // A filter can hide enough pins that the panel never overflows; with no
  // scrollbar the scroll handler never fires and paging stalls. Top up until it
  // overflows or the results run out.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !bookmark || loadingMore) return;
    if (autoFills.current >= AUTOFILL_MAX) return;
    if (el.scrollHeight <= el.clientHeight) {
      autoFills.current += 1;
      loadMore();
    }
  }, [shown.length, bookmark, loadingMore]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(pin: PinResult) {
    setPinSel((prev) => {
      const next = new Map(prev);
      if (next.has(pin.id)) next.delete(pin.id);
      else next.set(pin.id, { pin, query: searched });
      return next;
    });
  }

  function saveChosen(target?: { id?: string; newName?: string } | null) {
    start(async () => {
      try {
        const saved = await savePins(
          [...pinSel.values()],
          {
            collectionId: target?.id,
            collectionName: target?.newName,
          },
        );
        onSaved?.({
          images: saved.images,
          collections: saved.collection ? [saved.collection] : [],
        });
        onClose();
      } catch (e) {
        // savePins calls requireQuota, so running out of image allowance here
        // used to throw straight out of the transition to the error page - and
        // took a 40-pin selection with it. Stay open, say why, keep the picks.
        toast(e instanceof Error ? e.message : t("Could not save those"));
      }
    });
  }

  return (
    <dialog
      ref={dialogRef}
      // React simulates bubbling for `close`, so the nested lightbox's close
      // event reaches this handler too - only react to our own dialog closing
      onClose={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      onKeyDown={(e) => {
        // the embedded test browser delivers the keydown but never fires the
        // dialog's native `cancel`, so Escape has to close it by hand - and it
        // calls onClose() rather than dialog.close(), because the parent closes
        // this overlay by unmounting it. Going through close() left the overlay
        // shut but mounted, and "Search Pinterest" then did nothing.
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      className="glass-panel m-auto h-[85vh] max-h-none w-[90vw] max-w-5xl rounded-2xl p-0 text-foreground backdrop:bg-black/70"
    >
      <div className="flex h-full flex-col">
        {/* search bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder={t("Search images…")}
            className="min-w-40 flex-1"
          />
          <Button
            variant="primary"
            onClick={search}
            disabled={pending || !query.trim()}
          >
            {pending && pins === null ? t("Searching…") : t("Search")}
          </Button>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted">
            <input
              type="checkbox"
              checked={hiResOnly}
              onChange={(e) => {
                setHiResOnly(e.target.checked);
                autoFills.current = 0;
              }}
            />
            ≥
            <input
              type="number"
              min={0}
              step={10}
              value={minRes}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                setMinRes(v);
                writeHiResMin(v);
                autoFills.current = 0;
              }}
              aria-label={t("Minimum image width in pixels")}
              className="w-20 rounded-md border border-border bg-white/[0.03] px-2 py-1 text-xs outline-none transition-colors focus:border-border-strong"
            />
            px
          </label>
          <button
            onClick={onClose}
            aria-label={t("Close")}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {pinError && (
          <p className="border-b border-border px-4 py-2 text-sm text-red-400">
            {pinError}
          </p>
        )}

        {/* results */}
        <div
          ref={scrollRef}
          onScroll={maybeLoadMore}
          className="flex-1 overflow-y-auto p-4"
        >
          {pins === null ? (
            <p className="mt-16 text-center text-sm text-muted">
              {t("Search for background images.")}
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                {t("{count} results for “{query}”", {
                  count: shown.length,
                  query: searched,
                })}
              </p>
              {/* Fixed JS columns, not CSS columns or a grid: pins keep their
                  real aspect ratio, and appending a page never reshuffles what's
                  already shown */}
              <div className="flex gap-1.5">
                {columns.map((col, ci) => (
                  <div key={ci} className="flex flex-1 flex-col gap-1.5">
                    {col.map(({ p, i }) => (
                      // same shape as the library grid: a presentational
                      // wrapper with the select and lightbox buttons as
                      // siblings, so picking pins works from the keyboard
                      <div
                        key={p.id}
                        style={{ aspectRatio: `${p.width} / ${p.height}` }}
                        className={`group relative overflow-hidden rounded-lg transition-all ${
                          pinSel.has(p.id)
                            ? "ring-2 ring-accent"
                            : "hover:opacity-90"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.thumb}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          aria-pressed={pinSel.has(p.id)}
                          aria-label={t("Select image")}
                          onClick={() => toggle(p)}
                          className="absolute inset-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-accent"
                        />
                        {pinSel.has(p.id) && (
                          <span className="pointer-events-none absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-md bg-accent text-accent-ink">
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightbox(i);
                          }}
                          aria-label={t("View full size")}
                          className="absolute right-1.5 top-1.5 z-10 hidden rounded-md bg-black/60 p-1 text-white/80 backdrop-blur-sm transition-colors hover:text-white group-hover:block focus-visible:block"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </button>
                        <span
                          className={`absolute bottom-1 right-1 rounded-md bg-black/60 px-1 py-0.5 text-[10px] tabular-nums backdrop-blur-sm ${
                            p.width >= minRes
                              ? "text-green-300"
                              : "text-neutral-300"
                          }`}
                        >
                          {p.width}×{p.height}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {loadingMore && (
                <p className="py-3 text-center text-sm text-muted">
                  {t("Loading more…")}
                </p>
              )}
              {!bookmark && (
                <p className="py-3 text-center text-xs text-muted">
                  {t("End of results")}
                </p>
              )}
            </>
          )}
        </div>

        {/* Selection is a basket across queries. The destination is chosen
            only when the whole basket is ready to save. */}
        {pins !== null && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border p-4">
            <span className="mr-auto text-sm text-muted">
              {t("{count} selected", { count: pinSel.size })}
            </span>
            {picking ? (
              <CollectionPicker
                collections={collections}
                busy={pending}
                onCancel={() => setPicking(false)}
                onPick={(target) => saveChosen(target)}
              />
            ) : (
              <Button
                variant="primary"
                disabled={pinSel.size === 0 || pending}
                onClick={() => setPicking(true)}
              >
                {t("Choose destination and save")}
              </Button>
            )}
          </div>
        )}
      </div>

      {lightbox !== null && shown[lightbox] && (
        <ImageLightbox
          items={shown.map((p) => ({
            url: p.url,
            width: p.width,
            height: p.height,
          }))}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </dialog>
  );
}
