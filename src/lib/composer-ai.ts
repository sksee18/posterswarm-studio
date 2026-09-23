export type AiBatchConfig = {
  id: string;
  title: string;
  templateId: string;
  collectionId: string;
  cta: string;
  caption: string;
  aiSlides: string[][] | null;
  seriesTemplateId?: string;
  sceneImageIds?: string[];
};

export type ComposerAiCommand = {
  carousels: number;
  slides: number;
  captionOnly: boolean;
  addOneSlide: boolean;
};

/** Keep an item-aware visual, otherwise prefer the named template. */
export function compatibleItemTemplateId(
  templates: { id: string; name: string; itemMode?: boolean }[],
  currentId: string,
  preferredName?: string,
) {
  if (preferredName) {
    const preferred = templates.find((x) => x.itemMode && x.name === preferredName);
    if (preferred) return preferred.id;
  }
  if (templates.some((x) => x.id === currentId && x.itemMode)) return currentId;
  return templates.find((x) => x.itemMode)?.id
    ?? currentId;
}

export function parseComposerAiCommand(
  command: string,
  carouselControl: number,
  slideControl: number,
): ComposerAiCommand {
  const count = command.match(/(?:write|generate)\s+(\d+)\s+carousels?/i);
  const slides = command.match(/(\d+)\s+(?:total\s+)?slides?/i);
  return {
    carousels: Math.min(25, Math.max(1, count ? Number(count[1]) : carouselControl)),
    slides: Math.min(35, Math.max(2, slides ? Number(slides[1]) : slideControl)),
    captionOnly: /caption/i.test(command) && !/(slide|hook|cta|hashtag|name|title)/i.test(command.replace(/caption/gi, "")),
    addOneSlide: /add\s+(?:one|1)\s+(?:more\s+)?slide/i.test(command),
  };
}

/** Split a batch evenly across the selected collections, then randomize which
 * slideshow gets each collection. */
export function distributedCollections(
  collectionIds: string[],
  count: number,
  rand: () => number = Math.random,
): string[] {
  if (collectionIds.length === 0 || count < 1) return [];
  const out = Array.from(
    { length: count },
    (_, i) => collectionIds[i % collectionIds.length],
  );
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function ensureBatchConfigs(
  count: number,
  existing: AiBatchConfig[],
  defaults: Pick<AiBatchConfig, "templateId" | "collectionId" | "cta">,
  createId = () => crypto.randomUUID(),
): AiBatchConfig[] {
  return Array.from({ length: count }, (_, i) => existing[i] ?? {
    id: createId(),
    title: "",
    templateId: defaults.templateId,
    collectionId: defaults.collectionId,
    cta: defaults.cta,
    caption: "",
    aiSlides: null,
    seriesTemplateId: undefined,
    sceneImageIds: [],
  });
}
