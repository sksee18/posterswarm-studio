"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * The one dialog shell. Mount-controlled: the parent renders it conditionally
 * and passes onClose; every close path calls onClose directly, because the
 * native `close` event never reaches React in the embedded browser and Escape
 * does not fire cancel there either (see AGENTS.md). The onClose guard stops
 * a nested dialog's simulated close bubbling from closing this one.
 */
export function Dialog({
  onClose,
  title,
  width = "w-[28rem]",
  className = "",
  placement = "center",
  children,
}: {
  onClose: () => void;
  title?: string;
  width?: string;
  className?: string;
  placement?: "center" | "bottom";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      onClose={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`glass-panel max-w-[92vw] rounded-2xl p-5 text-foreground backdrop:bg-black/70 ${placement === "bottom" ? "mb-[calc(5rem+env(safe-area-inset-bottom))] mt-auto" : "m-auto"} ${width} ${className}`}
    >
      {title && (
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-11 min-w-11 rounded-md p-2 text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {children}
    </dialog>
  );
}
