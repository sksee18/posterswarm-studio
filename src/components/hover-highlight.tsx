"use client";

import { useRef, useState } from "react";

/** A single lit cell that slides to whatever link the cursor is on.
 *
 *  Shared by the marketing nav pill (horizontal) and the app sidebar
 *  (vertical). It reads a rect, so neither axis is special-cased and there is
 *  no orientation prop - change the feel here and both navs move together.
 *
 *  The highlight is decoration only: it is aria-hidden and pointer-events-none,
 *  and every link keeps its own `hover:` and `aria-current` styling, so with JS
 *  off nothing about the nav is broken.
 *
 *  ponytail: no CSS-only version of this exists - sliding between siblings
 *  needs a measurement. One rect in state is the whole implementation. */
export function HoverHighlight({
  children,
  className = "",
  highlightClassName = "glass rounded-full",
}: {
  children: React.ReactNode;
  className?: string;
  highlightClassName?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [r, setR] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // Measured off the target's own rect rather than offsetLeft/offsetTop: those
  // are relative to the nearest positioned ancestor, which is not necessarily
  // this container once a link picks up a transform.
  function onOver(e: React.PointerEvent) {
    const el = (e.target as HTMLElement).closest("a,button");
    const parent = box.current;
    if (!el || !parent || !parent.contains(el)) return;
    const a = el.getBoundingClientRect();
    const b = parent.getBoundingClientRect();
    setR({ x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height });
  }

  return (
    <div
      ref={box}
      className={`relative ${className}`}
      onPointerOver={onOver}
      onPointerLeave={() => setR(null)}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute top-0 left-0 transition-all duration-300 ease-out ${highlightClassName}`}
        style={{
          transform: `translate3d(${r?.x ?? 0}px, ${r?.y ?? 0}px, 0)`,
          width: r?.w ?? 0,
          height: r?.h ?? 0,
          opacity: r ? 1 : 0,
        }}
      />
      {children}
    </div>
  );
}
