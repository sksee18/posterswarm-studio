"use client";

import { useState } from "react";
import { ImageLightbox } from "@/components/image-lightbox";
import { useT } from "@/lib/i18n-client";

/** The rendered slides. Click opens the lightbox with prev/next instead of
 *  spawning a browser tab per frame, which is what checking slide 6 of 8 used
 *  to cost. */
export function FrameStrip({ frames }: { frames: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const items = frames.map((url) => ({ url }));
  const t = useT();

  return (
    <>
      <div className="mb-6 flex gap-3 overflow-x-auto pb-2">
        {frames.map((f, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(i)}
            title={t("Slide {n}", { n: i + 1 })}
            className="w-40 shrink-0 overflow-hidden rounded-md border border-border transition-colors hover:border-neutral-500"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f}
              alt={t("Slide {n}", { n: i + 1 })}
              className="w-full"
            />
          </button>
        ))}
      </div>

      {open !== null && (
        <ImageLightbox
          items={items}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
