"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n-client";

export type LightboxItem = {
  url: string;
  width?: number | null;
  height?: number | null;
};

/** Full-size image viewer with prev/next.
 *  Native <dialog> gives Escape, focus trapping and top-layer stacking free. */
export function ImageLightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: LightboxItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const item = items[index];
  if (!item) return null;

  const step = (delta: number) =>
    onIndex((index + delta + items.length) % items.length);

  return (
    <dialog
      ref={ref}
      // Every close path calls onClose() itself rather than dialog.close():
      // the parent unmounts this component to close it, and the native `close`
      // event does not reach React in the embedded browser, so relying on it
      // left the dialog shut but still mounted - after which no tile could
      // reopen it, because showModal() only runs on mount.
      onClose={(e) => {
        if (e.target === ref.current) onClose();
      }}
      onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "Escape"].includes(e.key)) return;
        // this dialog renders inside the search overlay's dialog, so without
        // stopPropagation an Escape here would close that one too
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "ArrowLeft") step(-1);
        else if (e.key === "ArrowRight") step(1);
        else onClose();
      }}
      // backdrop click: the dialog box itself is the full viewport, so close
      // only when the press landed on the dialog and not on its contents
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-black/80"
    >
      <div className="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt=""
          className="pointer-events-auto max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
        />
        <div className="glass-panel pointer-events-auto flex items-center gap-4 rounded-full px-4 py-2 text-sm">
          <button
            onClick={() => step(-1)}
            disabled={items.length < 2}
            aria-label={t("Previous image")}
            className="text-muted hover:text-foreground disabled:opacity-30"
          >
            ←
          </button>
          <span className="tabular-nums text-muted">
            {index + 1} / {items.length}
            {item.width && item.height ? (
              <span
                className={`ml-2 ${item.width >= 1080 ? "text-green-300" : ""}`}
              >
                {item.width}×{item.height}
              </span>
            ) : null}
          </span>
          <button
            onClick={() => step(1)}
            disabled={items.length < 2}
            aria-label={t("Next image")}
            className="text-muted hover:text-foreground disabled:opacity-30"
          >
            →
          </button>
          <button
            onClick={onClose}
            className="border-l border-border pl-4 text-muted hover:text-foreground"
          >
            {t("Close")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
