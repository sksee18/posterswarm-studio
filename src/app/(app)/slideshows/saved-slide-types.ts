import type { ComposedSlide } from "@/lib/compose";

export type SavedSlide = { id: string; name: string; tags: string[]; role: string; spec: unknown; bgUrls: unknown; frameUrl: string };

export const asComposed = (slide: SavedSlide): ComposedSlide => ({ role: "body", spec: slide.spec as ComposedSlide["spec"], bgUrls: slide.bgUrls as string[], frameUrl: slide.frameUrl });

const SAVED_MIME = "text/saved-slide";
const SLIDE_MIME = "text/slide-index";
export type DropHandlers = { onSaved: (savedId: string) => void; onMove?: (from: string) => void };
export const slideDropProps = ({ onSaved, onMove }: DropHandlers) => ({
  onDragOver: (event: React.DragEvent) => event.preventDefault(),
  onDrop: (event: React.DragEvent) => {
    const from = event.dataTransfer.getData(SLIDE_MIME);
    if (from && onMove) { event.preventDefault(); onMove(from); return; }
    const savedId = event.dataTransfer.getData(SAVED_MIME);
    if (savedId) { event.preventDefault(); onSaved(savedId); }
  },
});
export const slideHandleProps = (from: string) => ({ draggable: true, onDragStart: (event: React.DragEvent) => event.dataTransfer.setData(SLIDE_MIME, from) });
export const savedSlideDrag = (id: string) => ({ draggable: true, onDragStart: (event: React.DragEvent) => event.dataTransfer.setData(SAVED_MIME, id) });
