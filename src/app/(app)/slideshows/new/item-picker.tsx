"use client";

/**
 * The input for the item formats (App Stack, Ranked Countdown, Tier List): an
 * ordered list of apps. The ORDER IS THE RANKING - #1 is last in a countdown,
 * S tier is first in a tier list - so reordering is the primary interaction and
 * gets drag plus keyboard arrows, not a hidden "rank" field.
 *
 * Adding is one box that takes both a name off the curated list and a pasted
 * url, because behind it they are the same call (see lib/appicon.ts).
 */

import { useMemo, useRef, useState, useTransition } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import { APPS, searchApps, type KnownApp } from "@/lib/apps";
import type { SlideItem } from "@/lib/template-types";
import { moveSlide } from "@/lib/compose";
import { resolveAppIcon } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/busy";
import { useT } from "@/lib/i18n-client";

const MIME = "text/x-item-index";

export function ItemPicker({
  items,
  onChange,
  catalogApps,
}: {
  items: SlideItem[];
  onChange: (items: SlideItem[]) => void;
  catalogApps: KnownApp[];
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startResolve] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (input: string, name?: string) => {
    setError("");
    startResolve(async () => {
      const res = await resolveAppIcon(input, name);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // a second copy of one app is never intended - it would render the same
      // tile twice and break the ranking it is supposed to express
      if (items.some((i) => i.name === res.data.name)) {
        setError(t("{name} is already on the list", { name: res.data.name }));
        return;
      }
      onChange([...items, res.data]);
      setQuery("");
      inputRef.current?.focus();
    });
  };

  const apps = useMemo(() => {
    const names = new Set(catalogApps.map((app) => app.name.toLowerCase()));
    return [...catalogApps, ...APPS.filter((app) => !names.has(app.name.toLowerCase()))];
  }, [catalogApps]);
  const suggestions: KnownApp[] = searchApps(query, 16, apps).filter(
    (a) => !items.some((i) => i.name === a.name),
  );
  // a bare name that is not on the list is not a domain, so offer the url path
  const looksLikeUrl = /\./.test(query.trim());

  const move = (from: number, to: number) => onChange(moveSlide(items, from, to));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {items.map((item, i) => (
          <div
            key={item.name + i}
            draggable
            onDragStart={(e) => e.dataTransfer.setData(MIME, String(i))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const from = e.dataTransfer.getData(MIME);
              if (!from) return;
              e.preventDefault();
              move(Number(from), i);
            }}
            className="glass flex items-center gap-2 rounded-full py-1 pl-1 pr-2"
          >
            <span className="text-muted/60 cursor-grab" aria-hidden>
              <GripVertical size={13} />
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.iconUrl}
              alt=""
              className="h-6 w-6 rounded-md object-contain"
            />
            <span className="text-sm">{item.name}</span>
            {/* arrows so the ranking is reachable without a pointer */}
            <span className="flex flex-col leading-none">
              <button
                type="button"
                title={t("Move earlier")}
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
                className="text-muted hover:text-foreground text-[9px] disabled:opacity-25"
              >
                ▲
              </button>
              <button
                type="button"
                title={t("Move later")}
                disabled={i === items.length - 1}
                onClick={() => move(i, i + 2)}
                className="text-muted hover:text-foreground text-[9px] disabled:opacity-25"
              >
                ▼
              </button>
            </span>
            <button
              type="button"
              title={t("Remove")}
              onClick={() => onChange(items.filter((_, k) => k !== i))}
              className="text-muted hover:text-red-400"
            >
              <X size={13} />
            </button>
          </div>
        ))}

        {!open && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setOpen(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            <Plus size={14} /> {t("Add app")}
          </Button>
        )}
      </div>

      {open && (
        <div className="glass-panel mt-3 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={query}
              placeholder={t("Search apps, or paste a website")}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key !== "Enter") return;
                e.preventDefault();
                const first = suggestions[0];
                if (first) add(first.listing ?? first.domain, first.name);
                else if (looksLikeUrl) add(query);
              }}
            />
            {pending && <Spinner />}
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("Done")}
            </Button>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((a) => (
              <button
                key={a.domain}
                type="button"
                disabled={pending}
                onClick={() => add(a.listing ?? a.domain, a.name)}
                className="hover:bg-accent-dim rounded-full border border-border px-3 py-1 text-sm disabled:opacity-50"
              >
                {a.name}
              </button>
            ))}
            {looksLikeUrl && !suggestions.some((s) => s.domain === query.trim()) && (
              <button
                type="button"
                disabled={pending}
                onClick={() => add(query)}
                className="bg-accent-dim text-accent rounded-full border border-accent/40 px-3 py-1 text-sm disabled:opacity-50"
              >
                {t("Use")} {query.trim()}
              </button>
            )}
          </div>

          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          <p className="text-muted mt-2 text-xs">
            {t(
              "Paste a website, an App Store or Play Store link, or a direct image url. Store links give the sharpest icon.",
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/** Whether this template wants an item list at all. Kept next to the picker so
 *  the composer has one thing to ask. */
export const wantsItems = (
  templates: { id: string; itemMode?: boolean }[],
  id: string,
) => !!templates.find((x) => x.id === id)?.itemMode;

export { APPS };
