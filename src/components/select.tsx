"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  /** up to a few cover urls, shown as tiny squares on the right of the row */
  thumbs?: string[];
  /** right-aligned secondary text, e.g. an item count */
  hint?: string;
};

/**
 * The app's dropdown. A native <select> paints its option list with the OS
 * widget - white, system font, square corners - which is the one place the
 * dark UI broke character, and no amount of CSS reaches inside it.
 *
 * ponytail: a button plus a list, ~90 lines, instead of a headless-UI
 * dependency. It covers what every call site here actually does: pick one
 * string from a short list. No multi-select, no search, no async options.
 *
 * The option list is a `popover`, so it paints in the top layer: it cannot be
 * clipped or covered by an ancestor's overflow, z-index or stacking context.
 * That matters here because `.panel`/`.glass` are `backdrop-filter`, which makes
 * a stacking context AND a containing block for fixed children - a plain
 * `absolute z-50` list was painted under the next panel down the page, and
 * `position: fixed` alone would not have escaped either. `<main>` is `z-10` and
 * the mobile bottom nav is `z-50` outside it, so no z-index could have won.
 *
 * ponytail: `popover="manual"` plus one `getBoundingClientRect`, not a
 * positioning library. Placement is below the button, flipped above when the
 * list would not fit. No collision handling on the x axis, no arrow, no
 * `anchor-name` (Chromium only).
 */
export function Select({
  value,
  onChange,
  options,
  className = "",
  placeholder,
  disabled = false,
  title,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();

  const current = options.find((o) => o.value === value);
  const selectedIndex = options.findIndex((o) => o.value === value);

  const openMenu = () => {
    if (disabled) return;
    setActive(selectedIndex < 0 ? 0 : selectedIndex);
    setOpen(true);
  };

  const pick = (i: number) => {
    const opt = options[i];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
  };

  // Show the list and park it under the button. A popover is display:none until
  // showPopover(), and the UA styles centre it in the viewport, so placement has
  // to happen in script - written straight to .style rather than through state,
  // which keeps the scroll handler from re-rendering the whole list.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const height = Math.min(list.scrollHeight, 256); // max-h-64
      const below = window.innerHeight - r.bottom;
      list.style.top = `${
        below < height + 8 && r.top > below ? r.top - height - 4 : r.bottom + 4
      }px`;
      list.style.left = `${Math.max(
        8,
        Math.min(r.left, window.innerWidth - list.offsetWidth - 8),
      )}px`;
      list.style.minWidth = `${r.width}px`;
    };
    list.showPopover();
    place();
    // capture: page-level scroll events do not fire in the embedded browser, and
    // only a capturing listener sees the scrolling container's own
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      // no hidePopover: the list unmounts on close, which force-hides it
    };
  }, [open]);

  // Close on a click anywhere else. pointerdown rather than click so the menu
  // is gone before the other control reacts. The popover is still a DOM child of
  // rootRef - only its paint moves to the top layer - so contains() holds.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // keep the highlighted row visible when arrowing through a long list
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const move = (delta: number) => {
    setActive((i) => {
      // skip past disabled rows rather than landing on one
      let next = i;
      for (let step = 0; step < options.length; step++) {
        next = (next + delta + options.length) % options.length;
        if (!options[next]?.disabled) break;
      }
      return next;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        // the select-only combobox pattern: a button alone cannot carry
        // aria-activedescendant, so the arrow keys would be silent to a screen
        // reader
        role="combobox"
        aria-haspopup="listbox"
        aria-controls={open ? `${id}-list` : undefined}
        aria-expanded={open}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-left text-foreground outline-none transition-colors hover:border-neutral-500 focus-visible:border-neutral-500 disabled:opacity-40 ${className}`}
      >
        <span className={`truncate ${current ? "" : "text-muted"}`}>
          {current?.label ?? placeholder ?? ""}
        </span>
        <svg
          viewBox="0 0 10 6"
          aria-hidden
          className={`ml-auto h-1.5 w-2.5 shrink-0 fill-none stroke-current stroke-[1.5] text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="M1 1l4 4 4-4" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          // manual, not auto: light dismiss would race the pointerdown handler
          // above, which also has to run for clicks on other Selects
          popover="manual"
          style={{ position: "fixed", inset: "auto", margin: 0 }}
          className="max-h-64 overflow-y-auto rounded-md border border-border bg-surface py-1 text-foreground shadow-lg shadow-black/50"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled}
              onPointerEnter={() => !o.disabled && setActive(i)}
              // a <label> ancestor forwards a click on this <li> to its first
              // labelable descendant - which is whatever button happens to sit
              // in the label, not necessarily this Select. preventDefault
              // cancels that activation behavior.
              onClick={(e) => {
                e.preventDefault();
                pick(i);
              }}
              className={`flex cursor-pointer items-center gap-2 whitespace-nowrap px-2 py-1 ${
                i === active ? "bg-accent-dim" : ""
              } ${o.disabled ? "cursor-default opacity-40" : ""} ${
                o.value === value ? "text-accent" : ""
              }`}
            >
              {/* a dot for the current pick */}
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  o.value === value ? "bg-accent" : "bg-transparent"
                }`}
              />
              {o.label}
              {(o.thumbs?.length || o.hint) && (
                <span className="ml-auto flex shrink-0 items-center gap-1 pl-3">
                  {o.thumbs?.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={src}
                      src={src}
                      alt=""
                      loading="lazy"
                      className="h-5 w-5 rounded-sm object-cover"
                    />
                  ))}
                  {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
