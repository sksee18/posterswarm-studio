"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

export function PopoverMenu({ x, y, onClose, label, className = "w-52", children }: { x: number; y: number; onClose: () => void; label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    menu.showPopover();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y + 6, window.innerHeight - menu.offsetHeight - 8))}px`;
    menu.querySelector<HTMLElement>("button, a, input, [tabindex]:not([tabindex='-1'])")?.focus();
    return () => returnFocus.current?.focus();
  }, [x, y]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [onClose]);

  return <div ref={ref} popover="manual" role="menu" aria-label={label} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }} style={{ position: "fixed", inset: "auto", margin: 0 }} className={`glass-panel rounded-xl p-2 text-sm ${className}`}>{children}</div>;
}
