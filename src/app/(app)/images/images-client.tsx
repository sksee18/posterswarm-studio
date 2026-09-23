"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Check, ImageOff, Maximize2, MoreHorizontal } from "lucide-react";
import { ImageLightbox } from "@/components/image-lightbox";
import { Select } from "@/components/select";
import { SearchOverlay } from "./search-overlay";
import { useToast } from "@/components/toast";
import { useT } from "@/lib/i18n-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { loadImages, type ImagePageItem } from "./actions";
import type { PageCursor } from "@/lib/pagination";
import { PopoverMenu } from "@/components/ui/popover-menu";
import {
  uploadImages,
  createCollection,
  deleteCollection,
  deleteImages,
  addToCollection,
  removeFromCollection,
} from "./actions";

type Img = ImagePageItem;
export type Col = { id: string; name: string; count: number; covers: string[] };
type Membership = { collectionId: string; imageId: string };

/** Inline collection chooser: pick existing or type a new name. */
export function CollectionPicker({
  collections,
  onPick,
  onCancel,
  busy,
}: {
  collections: { id: string; name: string }[];
  onPick: (target: { id?: string; newName?: string } | null) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [choice, setChoice] = useState<string>("none");
  const [newName, setNewName] = useState("");
  const t = useT();
  return (
    <div className="flex items-center gap-2 text-sm">
      <Select
        value={choice}
        onChange={setChoice}
        options={[
          { value: "none", label: t("No collection") },
          ...collections.map((c) => ({ value: c.id, label: c.name })),
          { value: "__new__", label: t("New collection…") },
        ]}
        className="py-1.5"
      />
      {choice === "__new__" && (
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("Name")}
          className="w-36"
        />
      )}
      <Button
        variant="primary"
        disabled={busy || (choice === "__new__" && !newName.trim())}
        onClick={() =>
          onPick(
            choice === "none"
              ? null
              : choice === "__new__"
                ? { newName: newName.trim() }
                : { id: choice },
          )
        }
      >
        {busy ? t("Saving…") : t("Confirm")}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        {t("Cancel")}
      </Button>
    </div>
  );
}

/** Index tile: a 2×2 mosaic of the collection's first images, name and count.
 *  Housekeeping hides in the menu so the card stays image-first. */
function CollectionCard({
  name,
  count,
  covers,
  onOpen,
  onMenu,
}: {
  name: string;
  count: number;
  covers: Img[];
  onOpen: () => void;
  onMenu?: (x: number, y: number) => void;
}) {
  return (
    <div className="group relative">
      <button
        onClick={onOpen}
        className="w-full overflow-hidden rounded-xl text-left transition-all hover:opacity-90"
      >
        <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-xl bg-border">
          {Array.from({ length: 4 }, (_, i) => {
            const img = covers[i];
            return img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={img.id}
                src={img.url}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div key={i} className="bg-white/[0.03]" />
            );
          })}
        </div>
        <div className="flex items-baseline justify-between gap-2 px-1 py-2">
          <span className="truncate text-sm">{name}</span>
          <span className="shrink-0 text-xs text-muted">{count}</span>
        </div>
      </button>
      {onMenu && (
        <button
          onClick={(e) => onMenu(e.clientX, e.clientY)}
          aria-label="Menu"
          className="absolute right-1.5 top-1.5 hidden rounded-md bg-black/60 p-1 text-muted backdrop-blur-sm transition-colors hover:text-foreground group-hover:block"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** null = the collections index; otherwise "all", "ungrouped", or a collection id */
type View = string | null;

export function ImagesClient({
  images: initialImages,
  collections,
  memberships: initialMemberships,
  nextCursor: initialCursor,
  total,
  ungrouped,
}: {
  images: Img[];
  collections: Col[];
  memberships: Membership[];
  nextCursor: PageCursor | null;
  total: number;
  ungrouped: { count: number; covers: Img[] };
}) {
  const [images, setImages] = useState(initialImages);
  const [memberships, setMemberships] = useState(initialMemberships);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [viewTotal, setViewTotal] = useState(total);
  const [loadingView, setLoadingView] = useState(false);
  const [view, setView] = useState<View>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [picking, setPicking] = useState<"selection" | "new" | null>(null);
  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState<{ col: Col; x: number; y: number } | null>(
    null,
  );
  const [pending, start] = useTransition();
  const toast = useToast();
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);

  // one pass over memberships instead of an O(n·m) scan per render - the index
  // needs counts and covers per collection on top of the filtering
  const byImage = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const row of memberships) {
      const s = m.get(row.imageId) ?? new Set<string>();
      s.add(row.collectionId);
      m.set(row.imageId, s);
    }
    return m;
  }, [memberships]);

  const inCollection = (id: string, colId: string) =>
    byImage.get(id)?.has(colId) ?? false;

  const imagesIn = (v: View) =>
    v === "all"
      ? images
      : v === "ungrouped"
        ? images.filter((i) => !byImage.has(i.id))
        : images.filter((i) => v != null && inCollection(i.id, v));

  const visible = view === null ? [] : imagesIn(view);

  const shownCollections = filter.trim()
    ? collections.filter((c) =>
        c.name.toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : collections;

  const viewName =
    view === "all"
      ? t("All images")
      : view === "ungrouped"
        ? t("Ungrouped")
        : (collections.find((c) => c.id === view)?.name ?? "");

  /** Leave a collection view and drop any selection made inside it. */
  function backToIndex() {
    setView(null);
    setSelected(new Set());
    setLightbox(null);
  }

  function openView(next: Exclude<View, null>) {
    setView(next);
    setSelected(new Set());
    setLightbox(null);
    if (next === "all") {
      setImages(initialImages);
      setMemberships(initialMemberships);
      setNextCursor(initialCursor);
      setViewTotal(total);
      return;
    }
    setLoadingView(true);
    start(async () => {
      try {
        const page = await loadImages({ cursor: null, view: next === "ungrouped" ? "ungrouped" : { collectionId: next } });
        setImages(page.items);
        setMemberships(page.items.flatMap((image) => image.collectionIds.map((collectionId) => ({ collectionId, imageId: image.id }))));
        setNextCursor(page.nextCursor);
        setViewTotal(page.total);
      } catch (error) {
        toast(error instanceof Error ? error.message : t("Could not load images"));
        setImages([]);
        setMemberships([]);
        setNextCursor(null);
        setViewTotal(0);
      } finally {
        setLoadingView(false);
      }
    });
  }

  function toggle(id: string) {
    return (prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    };
  }

  async function resolveTarget(
    target: {
      id?: string;
      newName?: string;
    } | null,
  ): Promise<string | undefined> {
    if (!target) return undefined;
    if (target.id) return target.id;
    return await createCollection(target.newName!);
  }

  return (
    <div>
      {/* header */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          {view !== null && (
            <button
              onClick={backToIndex}
              className="text-sm font-normal text-muted hover:text-foreground"
            >
              ← {t("Back")}
            </button>
          )}
          {view === null ? t("Images") : viewName}
          {view !== null && (
            <span className="text-sm font-normal text-muted">
              {visible.length}
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          {view === null && collections.length > 3 && (
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("Filter collections…")}
              className="w-44"
            />
          )}
          <Button onClick={() => setSearchOpen(true)}>
            {t("Search images")}
          </Button>
          {/* disabled while uploading: picking a second batch mid-upload started
              a second uploadImages against the same image quota */}
          <Button
            variant="primary"
            disabled={pending}
            onClick={() => fileRef.current?.click()}
          >
            {pending ? t("Uploading…") : t("Upload")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const fd = new FormData();
              for (const f of e.target.files ?? []) fd.append("files", f);
              // uploading while inside a collection files them straight into
              // it - that's how a library gets built from your own assets
              if (view && view !== "all" && view !== "ungrouped")
                fd.append("collectionId", view);
              start(async () => {
                try {
                  await uploadImages(fd);
                } catch (err) {
                  // hitting the image quota mid-upload threw to the error page
                  toast(
                    err instanceof Error ? err.message : t("Upload failed"),
                  );
                }
              });
              e.target.value = "";
            }}
          />
        </div>
      </header>

      {searchOpen && (
        <SearchOverlay
          collections={collections}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* collections index */}
      {view === null && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            <CollectionCard
              name={t("All images")}
              count={total}
              covers={initialImages.slice(0, 4)}
              onOpen={() => openView("all")}
            />
            {ungrouped.count > 0 && (
              <CollectionCard
                name={t("Ungrouped")}
                count={ungrouped.count}
                covers={ungrouped.covers}
                onOpen={() => openView("ungrouped")}
              />
            )}
            {shownCollections.map((c) => {
                return (
                <CollectionCard
                  key={c.id}
                  name={c.name}
                  count={c.count}
                  covers={c.covers.map((url, index) => ({ id: `${c.id}-${index}`, url, width: null, height: null, source: "collection", collectionIds: [c.id] }))}
                  onOpen={() => openView(c.id)}
                  onMenu={(x, y) => setMenu({ col: c, x, y })}
                />
              );
            })}
          </div>

          <div className="mt-6">
            {picking === "new" ? (
              <CollectionPicker
                collections={[]}
                busy={pending}
                onCancel={() => setPicking(null)}
                onPick={(target) => {
                  start(async () => {
                    await resolveTarget(target);
                    setPicking(null);
                  });
                }}
              />
            ) : (
              <button
                onClick={() => setPicking("new")}
                className="rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
              >
                {t("+ New collection")}
              </button>
            )}
          </div>
        </>
      )}

      {/* collection card menu */}
      {menu && (
        <PopoverMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} label={t("Collection actions")}>
          <div className="space-y-1">
            <p className="truncate px-1.5 pt-0.5 text-xs text-muted">
              {menu.col.name}
            </p>
            <Button
              variant="danger"
              className="w-full justify-start px-1.5 py-1 text-xs"
              onClick={() =>
                start(async () => {
                  await deleteCollection(menu.col.id);
                  setMenu(null);
                })
              }
            >
              {t("Delete collection (images are kept)")}
            </Button>
          </div>
        </PopoverMenu>
      )}

      {/* image grid */}
      {view !== null &&
        (loadingView ? (
          <p className="mt-16 text-center text-sm text-muted" role="status">{t("Loading images...")}</p>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<ImageOff />}
            message={t("Nothing here yet.")}
            action={
              <Button onClick={() => setSearchOpen(true)}>
                {t("Search images")}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {visible.map((img, i) => (
              // A presentational wrapper holding two SIBLING buttons: select
              // (the whole tile) and the lightbox icon. Selecting is the primary
              // action here and used to be a bare onClick on this div, so it was
              // mouse-only - but the two cannot nest, because a <button> inside a
              // <button> is invalid and browsers do not agree on what it means.
              <div
                key={img.id}
                className={`group relative aspect-[3/4] overflow-hidden rounded-lg transition-all ${
                  selected.has(img.id)
                    ? "ring-2 ring-accent"
                    : "hover:opacity-90"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  aria-pressed={selected.has(img.id)}
                  aria-label={t("Select image")}
                  onClick={() => setSelected(toggle(img.id))}
                  className="absolute inset-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-accent"
                />
                {selected.has(img.id) && (
                  // decorative, so clicks pass through to the select button
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
                  // z-10 to sit above the full-tile select button behind it
                  className="absolute right-1.5 top-1.5 z-10 hidden rounded-md bg-black/60 p-1 text-white/80 backdrop-blur-sm transition-colors hover:text-white group-hover:block focus-visible:block"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
                {img.width && img.height && (
                  <span
                    className={`absolute bottom-1 right-1 rounded-md bg-black/60 px-1 py-0.5 text-[10px] tabular-nums backdrop-blur-sm ${
                      img.width >= 1080 ? "text-green-300" : "text-neutral-300"
                    }`}
                  >
                    {img.width}×{img.height}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}

      {/* floating selection bar */}
      {selected.size > 0 && (
        <div className="glass-panel fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl px-4 py-2.5 text-sm md:bottom-6">
          <span className="text-muted">
            {t("{count} selected", { count: selected.size })}
          </span>
          {picking === "selection" ? (
            <CollectionPicker
              collections={collections}
              busy={pending}
              onCancel={() => setPicking(null)}
              onPick={(target) => {
                start(async () => {
                  try {
                    const colId = await resolveTarget(target);
                    if (colId) await addToCollection([...selected], colId);
                    setSelected(new Set());
                    setPicking(null);
                  } catch (e) {
                    toast(
                      e instanceof Error ? e.message : t("Could not add those"),
                    );
                  }
                });
              }}
            />
          ) : (
            <>
              <Button onClick={() => setPicking("selection")}>
                {t("Add to collection")}
              </Button>
              {/* only inside a real collection - "all" and "ungrouped" are
                  synthetic views with nothing to remove from */}
              {view !== null && view !== "all" && view !== "ungrouped" && (
                <Button
                  onClick={() =>
                    start(async () => {
                      try {
                        await removeFromCollection([...selected], view);
                        setSelected(new Set());
                      } catch (e) {
                        toast(
                          e instanceof Error
                            ? e.message
                            : t("Could not remove those"),
                        );
                      }
                    })
                  }
                  title={t("Take these out of {name} without deleting them", {
                    name: viewName,
                  })}
                >
                  {t("Remove from {name}", { name: viewName })}
                </Button>
              )}
              <Button
                variant="danger"
                onClick={() =>
                  start(async () => {
                    try {
                      await deleteImages([...selected]);
                      setSelected(new Set());
                    } catch (e) {
                      toast(
                        e instanceof Error
                          ? e.message
                          : t("Could not delete those"),
                      );
                    }
                  })
                }
              >
                {t("Delete")}
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            {t("Clear")}
          </Button>
        </div>
      )}

      {view !== null && nextCursor && (
        <div className="mt-8 flex justify-center">
          <Button disabled={pending} onClick={() => start(async () => {
            try {
              const page = await loadImages({ cursor: nextCursor, view: view === "ungrouped" ? "ungrouped" : view === "all" ? "all" : { collectionId: view } });
              setImages((current) => [...current, ...page.items.filter((item) => !current.some((row) => row.id === item.id))]);
              setMemberships((current) => [...current, ...page.items.flatMap((item) => item.collectionIds.map((collectionId) => ({ collectionId, imageId: item.id })))]);
              setNextCursor(page.nextCursor);
            } catch (error) {
              toast(error instanceof Error ? error.message : t("Could not load more images"));
            }
          })}>{pending ? t("Loading...") : t("Load more {remaining}", { remaining: Math.max(0, viewTotal - images.length) })}</Button>
        </div>
      )}

      {lightbox !== null && visible[lightbox] && (
        <ImageLightbox
          items={visible}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
