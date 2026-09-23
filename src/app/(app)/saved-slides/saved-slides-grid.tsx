"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { FilterBar } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { deleteSavedSlides, updateSavedSlide } from "./actions";
import { loadSavedSlides, type SavedSlideCard } from "./actions";
import type { PageCursor } from "@/lib/pagination";
import { useT } from "@/lib/i18n-client";

/** The tip bank. Rename and retag inline; the frame itself is edited from the
 *  slideshow that produced it. */
export function SavedSlidesGrid({ slides, nextCursor: initialCursor, total, filters, tags }: { slides: SavedSlideCard[]; nextCursor: PageCursor | null; total: number; filters: { q?: string; tag?: string }; tags: string[] }) {
  const [loaded, setLoaded] = useState(slides);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const t = useT();
  const [items, removeOptimistic] = useOptimistic(
    loaded,
    (state, ids: string[]) => state.filter((s) => !ids.includes(s.id)),
  );

  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const tag = params.get("tag") ?? "";

  const visible = useMemo(
    () =>
      items.filter(
        (s) =>
          (!q || s.name.toLowerCase().includes(q)) &&
          (!tag || s.tags.includes(tag)),
      ),
    [items, q, tag],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <FilterBar
        placeholder={t("Search saved slides")}
        tags={tags}
        count={visible.length}
        total={total}
      />

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
          <span className="text-muted">
            {t("{count} selected", { count: selected.size })}
          </span>
          <Button
            variant="danger"
            className="border border-border"
            onClick={() => {
              const ids = [...selected];
              setSelected(new Set());
              start(async () => {
                removeOptimistic(ids);
                try {
                  await deleteSavedSlides(ids);
                } catch (e) {
                  toast(
                    e instanceof Error ? e.message : t("Could not delete those"),
                  );
                }
              });
            }}
          >
            {t("Delete")}
          </Button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-muted hover:text-foreground"
          >
            {t("Clear")}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {visible.map((s) => (
          <div
            key={s.id}
            className={`rounded-lg border p-2 transition-colors ${
              selected.has(s.id)
                ? "border-white"
                : "border-border hover:border-neutral-500"
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(s.id)}
              className="mb-2 block w-full overflow-hidden rounded-md bg-surface"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.frameUrl} alt={s.name} className="w-full" />
            </button>

            {editing === s.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const name = String(fd.get("name") ?? "");
                  const tags = String(fd.get("tags") ?? "")
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean);
                  setEditing(null);
                  start(async () => {
                    await updateSavedSlide(s.id, { name, tags });
                  });
                }}
                className="space-y-1"
              >
                <input
                  name="name"
                  defaultValue={s.name}
                  autoFocus
                  aria-label={t("Slide name")}
                  className="w-full rounded border border-border bg-surface px-1.5 py-1 text-xs outline-none"
                />
                <input
                  name="tags"
                  defaultValue={s.tags.join(", ")}
                  placeholder={t("tags, comma separated")}
                  aria-label={t("Slide tags")}
                  className="w-full rounded border border-border bg-surface px-1.5 py-1 text-xs outline-none placeholder:text-muted"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded bg-foreground py-1 text-xs font-medium text-background disabled:opacity-50"
                >
                  {t("Save")}
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(s.id)}
                title={t("Rename or retag")}
                className="block w-full text-left"
              >
                <p className="truncate text-xs">{s.name}</p>
                <p className="truncate text-[10px] text-muted">
                  {s.tags.length
                    ? s.tags.map((x) => `#${x}`).join(" ")
                    : t(s.role)}
                </p>
              </button>
            )}
          </div>
        ))}
      </div>

      {nextCursor && (
        <div className="mt-6 flex justify-center">
          <Button disabled={pending} onClick={() => start(async () => {
            try {
              const page = await loadSavedSlides({ cursor: nextCursor, ...filters });
              setLoaded((current) => [...current, ...page.items.filter((item) => !current.some((row) => row.id === item.id))]);
              setNextCursor(page.nextCursor);
            } catch (error) {
              toast(error instanceof Error ? error.message : t("Could not load more slides"));
            }
          })}>{pending ? t("Loading...") : t("Load more")}</Button>
        </div>
      )}

      {visible.length === 0 && (
        <p className="mt-16 text-center text-sm text-muted">
          {t("Nothing matches that filter.")}
        </p>
      )}
    </div>
  );
}
