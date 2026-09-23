"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FullscreenSlideDialog, SlideEditor } from "../../slide-editor";
import {
  AppendSlideCell,
  SavedSlideTray,
  asComposed,
  slideDropProps,
  slideHandleProps,
  type SavedSlide,
} from "../../saved-slide-tray";
import { resaveSlideshow } from "../../actions";
import { Busy } from "@/components/busy";
import { useToast } from "@/components/toast";
import { useT } from "@/lib/i18n-client";
import { moveSlide, type ComposedSlide } from "@/lib/compose";
import type { ImageLibrary } from "@/lib/image-library";

/** Reopens a rendered slideshow over its saved specs. Same editing surface as
 *  the composer's preview step - the fix for a typo on slide 3 being "delete it
 *  and run the composer again". */
export function EditSlides({
  id,
  title,
  collectionId,
  slides: initial,
  initialImageLibrary,
  savedSlides,
}: {
  id: string;
  title: string;
  collectionId: string | null;
  slides: ComposedSlide[];
  initialImageLibrary: ImageLibrary;
  savedSlides: SavedSlide[];
}) {
  const [slides, setSlides] = useState(initial);
  const [activeBox, setActiveBox] = useState<Record<number, number>>({});
  const [trayTag, setTrayTag] = useState("");
  const imageLibrary = initialImageLibrary;
  const [fullscreen, setFullscreen] = useState<number | null>(null);
  const [saving, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const t = useT();

  const dirty = JSON.stringify(slides) !== JSON.stringify(initial);

  const patch = (i: number, box: number, p: Record<string, unknown>) =>
    setSlides((prev) =>
      prev.map((s, si) =>
        si === i
          ? {
              ...s,
              frameUrl: undefined,
              spec: {
                ...s.spec,
                blocks: s.spec.blocks.map((b, bi) =>
                  bi === box ? { ...b, ...p } : b,
                ),
              },
            }
          : s,
      ),
    );

  const changeSlide = (i: number, next: ComposedSlide) =>
    setSlides((prev) =>
      prev.map((slide, si) =>
        si === i
          ? next
          : next.spec.scene
            ? {
                ...slide,
                frameUrl: undefined,
                spec: { ...slide.spec, imageCrops: next.spec.imageCrops },
              }
            : slide,
      ),
    );

  const applyFontToAll = (family: string) =>
    setSlides((prev) =>
      prev.map((slide) => ({
        ...slide,
        frameUrl: undefined,
        spec: {
          ...slide.spec,
          blocks: slide.spec.blocks.map((block) => ({
            ...block,
            fontFamily: family,
          })),
        },
      })),
    );

  /** Insert banked slides before position `i`; `i === slides.length` appends. */
  const insertSaved = (i: number, picked: SavedSlide[]) => {
    if (picked.length === 0) return;
    setSlides((prev) => {
      const next = [...prev];
      next.splice(i, 0, ...picked.map(asComposed));
      return next;
    });
  };

  const dropSaved = (i: number, savedId: string) => {
    const saved = savedSlides.find((s) => s.id === savedId);
    if (saved) insertSaved(i, [saved]);
  };

  const moveTo = (to: number, from: string) =>
    setSlides((prev) => moveSlide(prev, Number(from), to));

  const save = () =>
    start(async () => {
      try {
        await resaveSlideshow(id, slides);
        router.push(`/slideshows/${id}`);
      } catch (e) {
        toast(e instanceof Error ? e.message : t("Could not re-render"));
      }
    });

  return (
    <div className="pb-16">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          {t("Edit slides")}
          <span className="ml-2 text-sm font-normal text-muted">{title}</span>
        </h1>
        <div className="flex items-center gap-3">
          <Link
            href={`/slideshows/${id}`}
            className="text-sm text-muted hover:text-foreground"
          >
            {t("Cancel")}
          </Link>
          <button
            disabled={!dirty || saving}
            onClick={save}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink transition-all hover:brightness-110 disabled:opacity-50"
          >
            {saving ? t("Re-rendering…") : t("Save & re-render")}
          </button>
        </div>
      </div>

      <p className="mb-6 text-xs text-muted">
        {t("Saving re-renders every frame and counts as one generation.")}
      </p>

      {saving && (
        <div className="mb-6">
          <Busy label={t("Re-rendering frames")} />
        </div>
      )}

      {savedSlides.length > 0 && (
        <SavedSlideTray
          slides={savedSlides}
          tag={trayTag}
          onTagChange={setTrayTag}
        />
      )}

      {/* same self-scaling track as the composer preview */}
      <div className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(min(15rem,100%),1fr))]">
        {slides.map((slide, i) => (
          <div
            key={i}
            {...slideDropProps({
              onSaved: (sid) => dropSaved(i, sid),
              onMove: (from) => moveTo(i, from),
            })}
          >
            <SlideEditor
              slide={slide}
              index={i}
              activeBox={activeBox[i] ?? 0}
              imageLibrary={imageLibrary}
              defaultCollectionId={collectionId}
              onExpand={() => setFullscreen(i)}
              onSelectBox={(j) => setActiveBox((p) => ({ ...p, [i]: j }))}
              onPatch={(box, p) => patch(i, box, p)}
              onRemove={
                slides.length > 1
                  ? () => setSlides((prev) => prev.filter((_, si) => si !== i))
                  : undefined
              }
              handleProps={slideHandleProps(String(i))}
              onMove={
                slides.length > 1
                  ? // an arrow step is a swap, so the target index is past the
                    // neighbour when moving right
                    (d) => moveTo(d < 0 ? i - 1 : i + 2, String(i))
                  : undefined
              }
              onSlideChange={(next) => changeSlide(i, next)}
            />
          </div>
        ))}
        {savedSlides.length > 0 && (
          <AppendSlideCell
            ratio={
              (slides[0]?.spec.width ?? 1080) / (slides[0]?.spec.height ?? 1920)
            }
            slides={savedSlides}
            onPick={(picked) => insertSaved(slides.length, picked)}
            onSaved={(sid) => dropSaved(slides.length, sid)}
            onMove={(from) => moveTo(slides.length, from)}
          />
        )}
      </div>
      {fullscreen !== null && slides[fullscreen] && (
        <FullscreenSlideDialog
          index={fullscreen}
          total={slides.length}
          onIndex={setFullscreen}
          onClose={() => setFullscreen(null)}
        >
          <SlideEditor
            slide={slides[fullscreen]}
            index={fullscreen}
            activeBox={activeBox[fullscreen] ?? 0}
            imageLibrary={imageLibrary}
            defaultCollectionId={collectionId}
            onSelectBox={(box) =>
              setActiveBox((current) => ({ ...current, [fullscreen]: box }))
            }
            onPatch={(box, value) => patch(fullscreen, box, value)}
            onSlideChange={(next) => changeSlide(fullscreen, next)}
            expanded
            fontControls
            onApplyFontToAll={applyFontToAll}
          />
        </FullscreenSlideDialog>
      )}
    </div>
  );
}
