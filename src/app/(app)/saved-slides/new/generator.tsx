"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Busy } from "@/components/busy";
import { Select } from "@/components/select";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/input";
import {
  buildSlides,
  lineFromSlide,
  moveSlide,
  splitBoxes,
  type ComposedSlide,
} from "@/lib/compose";
import type { ImageLibrary } from "@/lib/image-library";
import { useT } from "@/lib/i18n-client";
import { getPreviewData } from "../../slideshows/actions";
import {
  FullscreenSlideDialog,
  SlideEditor,
} from "../../slideshows/slide-editor";
import { saveSlide } from "../actions";
import { ItemPicker, wantsItems } from "../../slideshows/new/item-picker";
import type { SlideItem } from "@/lib/template-types";

export function SavedSlideGenerator({
  templates,
  collections,
  imageLibrary,
  catalogApps,
}: {
  templates: { id: string; name: string; itemMode?: boolean }[];
  collections: { id: string; name: string }[];
  imageLibrary: ImageLibrary;
  catalogApps: { name: string; domain: string }[];
}) {
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? "");
  const [items, setItems] = useState<SlideItem[]>([]);
  const [slides, setSlides] = useState<ComposedSlide[]>([]);
  const [activeBox, setActiveBox] = useState<Record<number, number>>({});
  const [fullscreen, setFullscreen] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();
  const itemMode = wantsItems(templates, templateId);

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const preview = () => {
    setError("");
    startLoading(async () => {
      try {
        const { doc, backgrounds } = await getPreviewData(
          templateId,
          collectionId,
        );
        setSlides(
          buildSlides(
            doc,
            lines.map((line) => ({
              role: "body" as const,
              texts: splitBoxes(line, []),
            })),
            backgrounds,
            Math.random,
            items,
          ),
        );
        setActiveBox({});
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("Failed to load preview"));
      }
    });
  };

  const patchBlock = (index: number, blockIndex: number, patch: Record<string, unknown>) =>
    setSlides((current) =>
      current.map((slide, slideIndex) =>
        slideIndex === index
          ? {
              ...slide,
              frameUrl: undefined,
              spec: {
                ...slide.spec,
                blocks: slide.spec.blocks.map((block, i) =>
                  i === blockIndex ? { ...block, ...patch } : block,
                ),
              },
            }
          : slide,
      ),
    );

  const saveAll = () => {
    setError("");
    startSaving(async () => {
      try {
        for (const slide of slides) {
          const name = lineFromSlide(slide).trim().slice(0, 60);
          if (!name) throw new Error(t("Give every slide some text before saving"));
          await saveSlide({ name, templateId, slide });
        }
        router.push("/saved-slides");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("Could not save those slides"));
      }
    });
  };

  if (slides.length === 0) {
    return (
      <div className="max-w-3xl">
        <PageHeader title={t("New saved slides")} />
        <div className="space-y-6">
          <div>
            <p className="micro mb-2">{t("Slide text")}</p>
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={16}
              placeholder={t("One slide per line. Use title | supporting text for multiple boxes.")}
              className="resize-y font-mono"
            />
          </div>
          {itemMode && (
            <div>
              <p className="micro mb-2">{t("Choose one app for each saved slide")}</p>
              <ItemPicker items={items} onChange={setItems} catalogApps={catalogApps} />
              {items.length !== lines.length && (
                <p className="mt-2 text-xs text-muted">{t("Add {count} apps to match your {count} slide lines.", { count: lines.length })}</p>
              )}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              value={templateId}
              onChange={setTemplateId}
              options={templates.map((template) => ({ value: template.id, label: template.name }))}
              aria-label={t("Template")}
            />
            <Select
              value={collectionId}
              onChange={setCollectionId}
              options={collections.map((collection) => ({ value: collection.id, label: collection.name }))}
              aria-label={t("Background collection")}
            />
          </div>
          <Button
            variant="primary"
            disabled={loading || lines.length === 0 || !templateId || !collectionId || (itemMode && items.length !== lines.length)}
            onClick={preview}
            className="w-full py-3"
          >
            {loading ? t("Loading preview…") : t("Preview {count} slides", { count: lines.length })}
          </Button>
          {loading && <Busy label={t("Loading preview")} />}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  const changeSlide = (index: number, next: ComposedSlide) =>
    setSlides((current) => current.map((slide, i) => (i === index ? next : slide)));

  return (
    <div>
      <PageHeader
        title={t("Preview & adjust ({count} slides)", { count: slides.length })}
        actions={
          <>
            {saving && <Busy label={t("Rendering saved slides")} />}
            <Button disabled={saving} onClick={() => setSlides([])}>{t("Back")}</Button>
            <Button variant="primary" disabled={saving} onClick={saveAll}>
              {saving ? t("Rendering…") : t("Render & save all")}
            </Button>
          </>
        }
      />
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      <div className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(min(15rem,100%),1fr))]">
        {slides.map((slide, index) => (
          <SlideEditor
            key={index}
            slide={slide}
            index={index}
            activeBox={Math.min(activeBox[index] ?? 0, slide.spec.blocks.length - 1)}
            imageLibrary={imageLibrary}
            defaultCollectionId={collectionId}
            onExpand={() => setFullscreen(index)}
            onSelectBox={(box) => setActiveBox((current) => ({ ...current, [index]: box }))}
            onPatch={(box, patch) => patchBlock(index, box, patch)}
            onSlideChange={(next) => changeSlide(index, next)}
            onRemove={slides.length > 1 ? () => setSlides((current) => current.filter((_, i) => i !== index)) : undefined}
            onMove={slides.length > 1 ? (delta) => setSlides((current) => moveSlide(current, index, delta < 0 ? index - 1 : index + 2)) : undefined}
          />
        ))}
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
            activeBox={Math.min(activeBox[fullscreen] ?? 0, slides[fullscreen].spec.blocks.length - 1)}
            imageLibrary={imageLibrary}
            defaultCollectionId={collectionId}
            onSelectBox={(box) => setActiveBox((current) => ({ ...current, [fullscreen]: box }))}
            onPatch={(box, patch) => patchBlock(fullscreen, box, patch)}
            onSlideChange={(next) => changeSlide(fullscreen, next)}
            expanded
            fontControls
          />
        </FullscreenSlideDialog>
      )}
    </div>
  );
}
