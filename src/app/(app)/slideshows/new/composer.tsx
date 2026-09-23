"use client";

import { useState, useTransition, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Sparkles } from "lucide-react";
import {
  aiFill,
  aiFillMetadata,
  aiAddBody,
  planCampaign,
  getPreviewData,
  checkBatchQuota,
  createOneSlideshow,
  resolveAppIcon,
} from "../actions";
import {
  BODY_SCALE,
  applyContinuousScene,
  buildSlides,
  lineFromSlide,
  moveSlide,
  numberSlides,
  resizeSlides,
  rolesFor,
  splitBoxes,
  textsFromSlide,
  type ComposedSlide,
} from "@/lib/compose";
import { type CampaignPostPlan } from "@/lib/campaign";
import type { GeneratedCopy } from "@/lib/llm";
import { normalizeScript } from "@/lib/normalize-script";
import type { SlideItem, SlideRole } from "@/lib/template-types";
import { ItemPicker, wantsItems } from "./item-picker";
import { Busy } from "@/components/busy";
import { asComposed, slideDropProps, slideHandleProps, type SavedSlide } from "../saved-slide-types";
import { loadComposerSlides, saveSlide } from "../../saved-slides/actions";
import { useT } from "@/lib/i18n-client";
import { Select } from "@/components/select";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import {
  distributedCollections,
  compatibleItemTemplateId,
  ensureBatchConfigs,
  parseComposerAiCommand,
  type AiBatchConfig as BatchConfig,
} from "@/lib/composer-ai";
import { mergeImageLibrary, type ImageLibrary } from "@/lib/image-library";
import { APPS } from "@/lib/apps";
import { draftKey, previewKey, readPreview, removePreview, writePreview } from "./draft-persistence";
import { ALL_BACKGROUNDS_ID, type PageCursor } from "@/lib/pagination";
import { loadImages } from "../../images/actions";

const SlideEditor = dynamic(() => import("../slide-editor").then((module) => module.SlideEditor), { loading: () => <Busy label="Loading editor" /> });
const FullscreenSlideDialog = dynamic(() => import("../slide-editor").then((module) => module.FullscreenSlideDialog));
const SavedSlideTray = dynamic(() => import("../saved-slide-tray").then((module) => module.SavedSlideTray));
const SlidePicker = dynamic(() => import("../saved-slide-tray").then((module) => module.SlidePicker));
const AppendSlideCell = dynamic(() => import("../saved-slide-tray").then((module) => module.AppendSlideCell));
const CampaignEditor = dynamic(() => import("./campaign-editor").then((module) => module.CampaignEditor), { loading: () => <Busy label="Loading campaign" /> });
const PreviewEditor = dynamic(() => import("./preview-editor").then((module) => module.PreviewEditor), { loading: () => <Busy label="Loading preview" /> });
const SIZE_STEPS = [
  { value: "1", label: "Same as title" },
  { value: "0.85", label: "Large" },
  { value: "0.75", label: "Body" },
  { value: "0.6", label: "Small" },
  { value: "0.45", label: "Caption" },
] as const;

const V2_DRAFT_KEY = "composer:draft:v2";
const LEGACY_DRAFT_KEY = "composer:draft";
const LAST_KEY = "composer:last-used";
const CAMPAIGN_DRAFT_KEY = "composer:campaign-draft";

type PreviewBatch = {
  configId: string;
  slides: ComposedSlide[];
  backgrounds: string[];
  images: { id: string; url: string; width: number | null; height: number | null }[];
};

/** An unfilled body slot: a body slide with no text and no banked frame. Slots
 *  are optional now - a drop can land anywhere - but reuse mode still makes a
 *  row of them for "Deal" to fill in one go. */
const isSlot = (s?: ComposedSlide) =>
  !!s && s.role === "body" && !s.frameUrl && !(s.spec.blocks[0]?.text ?? "").trim();

async function resolveGeneratedItems(
  items: SlideItem[],
  withScreenshots = false,
): Promise<{ items: SlideItem[]; failed?: string }> {
  const resolved: SlideItem[] = [];
  for (const item of items) {
    if (item.iconUrl && (!withScreenshots || item.screenshotUrls?.length)) {
      resolved.push(item);
      continue;
    }
    const app = APPS.find((candidate) => candidate.name === item.name);
    if (!app) return { items: resolved, failed: item.name };
    const result = await resolveAppIcon(app.listing ?? app.domain, app.name, withScreenshots);
    if (!result.ok) return { items: resolved, failed: item.name };
    resolved.push(result.data);
  }
  return { items: resolved };
}

async function aiFillWithIcons(input: Parameters<typeof aiFill>[0], withScreenshots = false) {
  const excluded = [...(input.excludeApps ?? [])];
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await aiFill({ ...input, excludeApps: excluded });
    if (!result.ok) return result;
    const resolved = await resolveGeneratedItems(result.data.items, withScreenshots);
    if (!resolved.failed)
      return { ok: true as const, data: { ...result.data, items: resolved.items } };
    excluded.push(resolved.failed);
  }
  return {
    ok: false as const,
    error: "AI could not find five apps with usable icons. Try a different topic.",
  };
}

export function Composer({
  templates,
  collections,
  textTemplates,
  initialMode,
  savedSlides: initialSavedSlides,
  savedSlidesCursor: initialSavedSlidesCursor,
  savedSlidesTotal,
  savedSlideTags,
  catalogApps,
}: {
  templates: { id: string; name: string; itemMode?: boolean; itemScreenshots?: boolean }[];
  collections: {
    id: string;
    name: string;
    count: number;
    covers: string[];
  }[];
  textTemplates: { id: string; name: string; defaultSlides: number; generateCta: boolean; useTitles: boolean; campaignSummary: string; appSelection: "none" | "catalog"; visualTemplate?: string }[];
  initialMode: "manual" | "campaign";
  savedSlides: SavedSlide[];
  savedSlidesCursor: PageCursor | null;
  savedSlidesTotal: number;
  savedSlideTags: string[];
  catalogApps: { name: string; domain: string }[];
}) {
  const t = useT();
  const [scriptText, setScriptText] = useState("");
  // the script as it was before "Match formatting", so one press can undo it.
  // Cleared on any manual edit, which is what turns the button back.
  const [preFormat, setPreFormat] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [nPoints, setNPoints] = useState(7);
  const [carouselCount, setCarouselCount] = useState(1);
  const [aiConfirmation, setAiConfirmation] = useState("");
  // one text template (AI voice/style) for the whole fill run - a mass control,
  // not a per-post one
  const [textTemplateId, setTextTemplateId] = useState("");
  // write only the hooks; body slides come from the tip bank on the next screen
  const [reuseSlides, setReuseSlides] = useState(false);
  const [trayTag, setTrayTag] = useState("");
  const [savedSlides, setSavedSlides] = useState(initialSavedSlides);
  const [savedSlidesCursor, setSavedSlidesCursor] = useState(initialSavedSlidesCursor);
  const [loadingSavedSlides, setLoadingSavedSlides] = useState(false);
  const [banked, setBanked] = useState(0);
  const [fullscreen, setFullscreen] = useState<{
    configId: string;
    index: number;
  } | null>(null);
  // "1" leaves each template's own title size alone; "" leaves the body boxes
  // at whatever the template sized them, rather than forcing a ratio on it
  const [titleScale, setTitleScale] = useState("1");
  const [bodyRatio, setBodyRatio] = useState("");
  const [numbered, setNumbered] = useState(false);

  // Shared settings apply to every slideshow in the batch; the per-slideshow
  // "Customize" disclosure is the override, replacing the old grid of
  // apply-to-all links.
  const [sharedTemplateId, setSharedTemplateId] = useState(
    templates[0]?.id ?? "",
  );
  const [sharedCollectionIds, setSharedCollectionIds] = useState<string[]>(
    collections[0]?.id ? [collections[0].id] : [],
  );
  const sharedCollectionId = sharedCollectionIds[0] ?? "";
  const [sharedCta, setSharedCta] = useState("");
  // The apps an item-format slideshow is about, in rank order.
  // ponytail: one list for the whole batch, like the other shared settings. A
  // batch of countdowns with DIFFERENT app sets would need this per-config;
  // nobody has asked, and the picker is already the widest control on the page.
  const [items, setItems] = useState<SlideItem[]>([]);
  const itemMode = wantsItems(templates, sharedTemplateId);

  const [configs, setConfigs] = useState<BatchConfig[]>([]);
  const [mode, setMode] = useState<"manual" | "campaign">(initialMode);
  const [campaignFacts, setCampaignFacts] = useState("");
  const [campaignAudience, setCampaignAudience] = useState("");
  const [campaignObjective, setCampaignObjective] = useState("");
  const [campaignCount, setCampaignCount] = useState(20);
  const [campaignSeries, setCampaignSeries] = useState<string[]>(() => textTemplates.slice(0, 2).map((row) => row.id));
  const [campaignVisuals, setCampaignVisuals] = useState<string[]>(() => templates.slice(0, 1).map((row) => row.id));
  const [campaignPosts, setCampaignPosts] = useState<CampaignPostPlan[]>([]);
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [campaignProgress, setCampaignProgress] = useState<{ done: number; total: number } | null>(null);
  const campaignStopRef = useRef(false);
  const draftLoadedRef = useRef(false);
  const skipConfigSyncRef = useRef(false);

  const loadMoreSavedSlides = async () => {
    if (!savedSlidesCursor || loadingSavedSlides) return;
    setLoadingSavedSlides(true);
    try {
      const page = await loadComposerSlides({ cursor: savedSlidesCursor, tag: trayTag || undefined });
      setSavedSlides((current) => {
        const known = new Set(current.map((slide) => slide.id));
        return [...current, ...page.items.filter((slide) => !known.has(slide.id))];
      });
      setSavedSlidesCursor(page.nextCursor);
    } finally {
      setLoadingSavedSlides(false);
    }
  };

  const changeTrayTag = async (tag: string) => {
    setTrayTag(tag);
    setLoadingSavedSlides(true);
    try {
      const page = await loadComposerSlides({ cursor: null, tag: tag || undefined });
      setSavedSlides(page.items);
      setSavedSlidesCursor(page.nextCursor);
    } finally {
      setLoadingSavedSlides(false);
    }
  };

  const blocks = scriptText
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Sync configs array length to blocks length. New slideshows inherit the
  // shared settings above the list.
  useEffect(() => {
    if (skipConfigSyncRef.current) {
      skipConfigSyncRef.current = false;
      return;
    }
    setConfigs((prev) => {
      if (prev.length === blocks.length) return prev;
      if (blocks.length === 0) return [];
      const assignments = distributedCollections(
        sharedCollectionIds,
        blocks.length,
      );
      return Array.from({ length: blocks.length }, (_, index) => ({
        ...(prev[index] ?? {
          id: crypto.randomUUID(),
          title: "",
          templateId: sharedTemplateId,
          cta: sharedCta,
          caption: "",
          aiSlides: null,
        }),
        collectionId: assignments[index] ?? sharedCollectionId,
      }));
    });
  }, [blocks.length, sharedTemplateId, sharedCollectionId, sharedCollectionIds, sharedCta]);

  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);

  // Preview state
  const [step, setStep] = useState<"form" | "preview">("form");
  const [previewBatches, setPreviewBatches] = useState<PreviewBatch[]>([]);
  const [previewSignature, setPreviewSignature] = useState("");
  const [activeBox, setActiveBox] = useState<Record<string, number>>({});
  const previewImageLibrary = useMemo<ImageLibrary>(() => {
    const byId = new Map<string, ImageLibrary["images"][number]>();
    for (const batch of previewBatches) {
      const collectionId = configs.find((config) => config.id === batch.configId)?.collectionId;
      for (const image of batch.images) {
        const current = byId.get(image.id);
        const collectionIds = collectionId
          ? [...new Set([...(current?.collectionIds ?? []), collectionId])]
          : current?.collectionIds ?? [];
        byId.set(image.id, { ...image, collectionIds });
      }
    }
    return {
      collections: collections.map(({ id, name }) => ({ id, name })),
      images: [...byId.values()],
    };
  }, [collections, configs, previewBatches]);
  const [loadedImageLibrary, setLoadedImageLibrary] = useState<ImageLibrary>({ collections: [], images: [] });
  const [imageCursors, setImageCursors] = useState<Record<string, PageCursor | null | undefined>>({});
  const [loadingImageCollection, setLoadingImageCollection] = useState<string | null>(null);
  const imageLibrary = useMemo(() => mergeImageLibrary(previewImageLibrary, loadedImageLibrary), [previewImageLibrary, loadedImageLibrary]);
  const loadedImageCollections = useMemo(() => new Set([
    ...configs.map((config) => config.collectionId),
    ...Object.keys(imageCursors),
  ]), [configs, imageCursors]);
  const imageCollectionsWithMore = useMemo(() => new Set(Object.entries(imageCursors).flatMap(([id, cursor]) => cursor ? [id] : [])), [imageCursors]);
  const loadImageCollection = async (collectionId: string, more = false) => {
    if (loadingImageCollection) return;
    const cursor = more ? imageCursors[collectionId] ?? null : null;
    if (more && !cursor) return;
    setLoadingImageCollection(collectionId);
    try {
      const all = collectionId === "all" || collectionId === ALL_BACKGROUNDS_ID;
      const page = await loadImages({
        cursor,
        view: all ? "all" : { collectionId },
        backgroundsOnly: true,
      });
      setLoadedImageLibrary((current) => mergeImageLibrary(current, {
        collections: [],
        images: page.items.map((image) => ({
          id: image.id,
          url: image.url,
          width: image.width,
          height: image.height,
          collectionIds: all ? [...new Set([...image.collectionIds, ALL_BACKGROUNDS_ID])] : image.collectionIds,
        })),
      }));
      setImageCursors((current) => ({ ...current, [collectionId]: page.nextCursor }));
    } finally {
      setLoadingImageCollection(null);
    }
  };
  const [loadingPreview, startLoadingPreview] = useTransition();
  const [creating, startCreate] = useTransition();
  const router = useRouter();
  const formDraftKey = draftKey();
  const previewDraftKey = previewKey();

  // Restore one complete local working session. IDs are checked against the
  // current server data so deleting a template or collection cannot strand the
  // composer on an unusable selection.
  useEffect(() => {
    void (async () => {
    try {
      const templateIds = new Set(templates.map((row) => row.id));
      const collectionIds = new Set(collections.map((row) => row.id));
      const textTemplateIds = new Set(textTemplates.map((row) => row.id));
      const last = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null");
      let draft = JSON.parse(localStorage.getItem(formDraftKey) ?? localStorage.getItem(V2_DRAFT_KEY) ?? "null");

      if (!draft) {
        const legacy = JSON.parse(
          localStorage.getItem(LEGACY_DRAFT_KEY) ?? "null",
        );
        const campaign = JSON.parse(
          localStorage.getItem(CAMPAIGN_DRAFT_KEY) ?? "null",
        );
        if (legacy || campaign)
          draft = {
            scriptText: legacy?.scriptText ?? "",
            instructions: legacy?.instructions ?? "",
            nPoints: legacy?.nPoints ?? 7,
            campaignFacts: campaign?.facts ?? "",
            campaignAudience: campaign?.audience ?? "",
            campaignObjective: campaign?.objective ?? "",
            campaignCount: campaign?.count ?? 20,
            campaignSeries: campaign?.series ?? [],
            campaignVisuals: campaign?.visuals ?? [],
            campaignPosts: campaign?.posts ?? [],
          };
      }

      const pickTemplate = (value: unknown) =>
        typeof value === "string" && templateIds.has(value)
          ? value
          : templates[0]?.id ?? "";
      const pickCollection = (value: unknown) =>
        typeof value === "string" && collectionIds.has(value)
          ? value
          : collections[0]?.id ?? "";

      if (!draft) {
        if (last?.templateId) setSharedTemplateId(pickTemplate(last.templateId));
        if (last?.collectionId)
          setSharedCollectionIds([pickCollection(last.collectionId)]);
        if (textTemplateIds.has(last?.textTemplateId))
          setTextTemplateId(last.textTemplateId);
        draftLoadedRef.current = true;
        return;
      }

      setScriptText(typeof draft.scriptText === "string" ? draft.scriptText : "");
      setInstructions(typeof draft.instructions === "string" ? draft.instructions : "");
      setNPoints(Number.isFinite(draft.nPoints) ? draft.nPoints : 7);
      setCarouselCount(
        Number.isFinite(draft.carouselCount) ? draft.carouselCount : 1,
      );
      setTextTemplateId(
        textTemplateIds.has(draft.textTemplateId) ? draft.textTemplateId : "",
      );
      setReuseSlides(draft.reuseSlides === true);
      const restoredTrayTag = typeof draft.trayTag === "string" ? draft.trayTag : "";
      setTrayTag(restoredTrayTag);
      if (restoredTrayTag) {
        const page = await loadComposerSlides({ cursor: null, tag: restoredTrayTag });
        setSavedSlides(page.items);
        setSavedSlidesCursor(page.nextCursor);
      }
      setTitleScale(typeof draft.titleScale === "string" ? draft.titleScale : "1");
      setBodyRatio(typeof draft.bodyRatio === "string" ? draft.bodyRatio : "");
      setNumbered(draft.numbered === true);
      setSharedTemplateId(pickTemplate(draft.sharedTemplateId));
      const restoredCollectionIds = Array.isArray(draft.sharedCollectionIds)
        ? draft.sharedCollectionIds.filter((id: string) => collectionIds.has(id))
        : [pickCollection(draft.sharedCollectionId)];
      setSharedCollectionIds(
        restoredCollectionIds.length
          ? restoredCollectionIds
          : collections[0]?.id
            ? [collections[0].id]
            : [],
      );
      setSharedCta(typeof draft.sharedCta === "string" ? draft.sharedCta : "");
      setItems(Array.isArray(draft.items) ? draft.items : []);
      setMode(draft.mode === "campaign" ? "campaign" : "manual");
      setCampaignFacts(typeof draft.campaignFacts === "string" ? draft.campaignFacts : "");
      setCampaignAudience(typeof draft.campaignAudience === "string" ? draft.campaignAudience : "");
      setCampaignObjective(typeof draft.campaignObjective === "string" ? draft.campaignObjective : "");
      setCampaignCount(
        Number.isFinite(draft.campaignCount) ? draft.campaignCount : 20,
      );
      setCampaignSeries(
        Array.isArray(draft.campaignSeries)
          ? draft.campaignSeries.filter((id: string) =>
              textTemplateIds.has(id),
            )
          : [],
      );
      setCampaignVisuals(
        Array.isArray(draft.campaignVisuals)
          ? draft.campaignVisuals.filter((id: string) => templateIds.has(id))
          : [],
      );
      setCampaignPosts(Array.isArray(draft.campaignPosts) ? draft.campaignPosts : []);

      const restoredConfigs: BatchConfig[] = Array.isArray(draft.configs)
        ? draft.configs.map((config: BatchConfig) => ({
            ...config,
            templateId: pickTemplate(config.templateId),
            collectionId: pickCollection(config.collectionId),
          }))
        : [];
      setConfigs(restoredConfigs);
      skipConfigSyncRef.current = restoredConfigs.length > 0;

      const snapshot = await readPreview<{ previewBatches?: PreviewBatch[]; activeBox?: Record<string, number>; step?: string; previewSignature?: string }>(previewDraftKey).catch(() => null);
      const restoredBatches: PreviewBatch[] = Array.isArray(snapshot?.previewBatches) ? snapshot.previewBatches : Array.isArray(draft.previewBatches) ? draft.previewBatches : [];
      const configIds = new Set(restoredConfigs.map((config) => config.id));
      const validPreview =
        restoredBatches.length > 0 &&
        restoredBatches.every(
          (batch) =>
            configIds.has(batch.configId) &&
            Array.isArray(batch.slides) &&
            batch.slides.length > 0,
        );
      if (validPreview) {
        setPreviewBatches(restoredBatches);
        setActiveBox(
          snapshot?.activeBox && typeof snapshot.activeBox === "object"
            ? snapshot.activeBox
            : draft.activeBox && typeof draft.activeBox === "object" ? draft.activeBox
            : {},
        );
        setStep(snapshot?.step === "preview" || draft.step === "preview" ? "preview" : "form");
        setPreviewSignature(
          typeof snapshot?.previewSignature === "string" ? snapshot.previewSignature : typeof draft.previewSignature === "string"
            ? draft.previewSignature
            : "",
        );
      }
    } catch {
      /* A corrupt or oversized browser draft must never block the composer. */
    } finally {
      draftLoadedRef.current = true;
    }
    })();
    // Read once. Server props are the validation snapshot for this page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draftLoadedRef.current) return;
    const id = setTimeout(() => {
      try {
        localStorage.setItem(
          formDraftKey,
          JSON.stringify({
            version: 2,
            scriptText,
            instructions,
            nPoints,
            carouselCount,
            textTemplateId,
            reuseSlides,
            trayTag,
            titleScale,
            bodyRatio,
            numbered,
            sharedTemplateId,
            sharedCollectionIds,
            sharedCta,
            items,
            configs,
            mode,
            campaignFacts,
            campaignAudience,
            campaignObjective,
            campaignCount,
            campaignSeries,
            campaignVisuals,
            campaignPosts,
          }),
        );
        localStorage.removeItem(V2_DRAFT_KEY);
        localStorage.removeItem(LEGACY_DRAFT_KEY);
        localStorage.removeItem(CAMPAIGN_DRAFT_KEY);
      } catch {
        /* Private mode or storage quota: editing still works for this visit. */
      }
    }, 400);
    return () => clearTimeout(id);
  }, [
    scriptText,
    instructions,
    nPoints,
    carouselCount,
    textTemplateId,
    reuseSlides,
    trayTag,
    titleScale,
    bodyRatio,
    numbered,
    sharedTemplateId,
    sharedCollectionIds,
    sharedCta,
    items,
    configs,
    mode,
    campaignFacts,
    campaignAudience,
    campaignObjective,
    campaignCount,
    campaignSeries,
    campaignVisuals,
    campaignPosts,
    step,
    formDraftKey,
  ]);

  useEffect(() => {
    if (!draftLoadedRef.current) return;
    const id = setTimeout(() => {
      void writePreview(previewDraftKey, { previewBatches, previewSignature, activeBox, step }).catch(() => undefined);
    }, 1000);
    return () => clearTimeout(id);
  }, [previewBatches, previewSignature, activeBox, step, previewDraftKey]);

  const validCount = blocks.filter((b, i) => {
    const lines = b
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const c = configs[i];
    // one line is a valid block: a single-slide template renders exactly that
    return c && c.templateId && c.collectionId && lines.length >= 1;
  }).length;

  // an item format with no apps would render a deck of blank tiles
  const canPreview =
    validCount > 0 && validCount === blocks.length && (!itemMode || reuseSlides || items.length > 0);

  const makeCampaignPlan = async () => {
    setError("");
    setCampaignBusy(true);
    try {
      const result = await planCampaign({
        brief: { productFacts: campaignFacts.trim(), audience: campaignAudience.trim(), objective: campaignObjective.trim(), count: campaignCount },
        seriesTemplateIds: campaignSeries,
        templateIds: campaignVisuals,
      });
      if (!result.ok) throw new Error(result.error);
      setCampaignPosts(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Generation failed"));
    } finally {
      setCampaignBusy(false);
    }
  };

  const regenerateCampaignSelected = async () => {
    const selected = campaignPosts.filter((post) => post.selected);
    if (!selected.length) return;
    setCampaignBusy(true);
    setError("");
    try {
      const result = await planCampaign({ brief: { productFacts: campaignFacts.trim(), audience: campaignAudience.trim(), objective: campaignObjective.trim(), count: selected.length }, seriesTemplateIds: campaignSeries, templateIds: campaignVisuals });
      if (!result.ok) throw new Error(result.error);
      let index = 0;
      setCampaignPosts((current) => current.map((post) => post.selected ? { ...result.data[index++], id: post.id, selected: true } : post));
    } catch (error) {
      setError(error instanceof Error ? error.message : t("Generation failed"));
    } finally {
      setCampaignBusy(false);
    }
  };

  const writeCampaign = async () => {
    setError("");
    setCampaignBusy(true);
    campaignStopRef.current = false;
    const selected = campaignPosts.filter((post) => post.selected && post.status === "approved");
    const generated: { post: CampaignPostPlan; copy: GeneratedCopy }[] = [];
    let generationItems = items;
    try {
      for (const [i, post] of selected.entries()) {
        if (campaignStopRef.current) break;
        setCampaignProgress({ done: i, total: selected.length });
        setCampaignPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, status: "writing", error: undefined } : p));
        const result = await aiFillWithIcons({
          templateId: post.templateId,
          textTemplateId: post.seriesTemplateId,
          topic: `Product facts:\n${campaignFacts}\n\nAudience:\n${campaignAudience}\n\nObjective:\n${campaignObjective}\n\nCampaign concept:\n${post.brief}`,
          nPoints: textTemplates.find((row) => row.id === post.seriesTemplateId)?.defaultSlides ?? 7,
          items: generationItems,
          avoid: generated.map(({ copy }) => copy.slides[0]?.[0]).filter((hook): hook is string => !!hook),
        }, templates.find((row) => row.id === post.templateId)?.itemScreenshots === true);
        if (!result.ok) {
          setCampaignPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, status: "failed", error: result.error } : p));
          continue;
        }
        generationItems = result.data.items;
        generated.push({ post, copy: result.data.copy });
        setCampaignPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, status: "written" } : p));
        setCampaignProgress({ done: i + 1, total: selected.length });
      }
      if (generated.length) {
        if (generationItems.length) setItems(generationItems);
        const collectionAssignments = distributedCollections(
          sharedCollectionIds,
          generated.length,
        );
        const nextConfigs: BatchConfig[] = generated.map(({ post, copy }, index) => ({
          id: post.id, title: post.title || copy.name, templateId: post.templateId,
          collectionId: collectionAssignments[index] ?? sharedCollectionId,
          cta: copy.slides.at(-1)?.[0] ?? "",
          caption: [copy.caption, copy.hashtags.map((h) => `#${h}`).join(" ")].filter(Boolean).join("\n\n"),
          aiSlides: copy.slides, seriesTemplateId: post.seriesTemplateId, sceneImageIds: [],
        }));
        const scripts = generated.map(({ copy }) => copy.slides.slice(0, -1).map((slide) => slide.join(" | ")).join("\n"));
        setConfigs(nextConfigs);
        setScriptText(scripts.join("\n\n"));
        setCarouselCount(nextConfigs.length);
        setMode("manual");
        setAiConfirmation(`Wrote ${nextConfigs.length} campaign posts`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Generation failed"));
    } finally {
      setCampaignBusy(false);
      setCampaignProgress(null);
    }
  };

  const updateConfig = (id: string, patch: Partial<BatchConfig>) => {
    setConfigs((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  };

  /** A shared control edits every config at once; new configs inherit it. */
  const shareOut = (patch: Partial<BatchConfig>) =>
    setConfigs((prev) => prev.map((c) => ({ ...c, ...patch })));

  const handleAiFill = async () => {
    setError("");
    setGenerating(true);
    try {
      const command = parseComposerAiCommand(instructions, carouselCount, nPoints);
      const { carousels: requestedCarousels, slides: requestedSlides, captionOnly, addOneSlide } = command;
      if (requestedCarousels !== carouselCount) setCarouselCount(requestedCarousels);
      if (requestedSlides !== nPoints) setNPoints(requestedSlides);
      const fresh = !scriptText.trim();
      const currentBlocks: string[] = fresh ? Array<string>(requestedCarousels).fill("") : [...blocks];
      let newConfigs = ensureBatchConfigs(currentBlocks.length, configs, {
        templateId: sharedTemplateId,
        collectionId: sharedCollectionId,
        cta: sharedCta,
      });
      if (fresh) {
        const collectionAssignments = distributedCollections(
          sharedCollectionIds,
          currentBlocks.length,
        );
        newConfigs = newConfigs.map((config, index) => ({
          ...config,
          collectionId: collectionAssignments[index] ?? sharedCollectionId,
        }));
      }

      const warnings: string[] = [];
      let generationItems = items;

      // Process sequentially to avoid rate limits or interleaving issues
      for (let i = 0; i < currentBlocks.length; i++) {
        const block = currentBlocks[i];
        const lines = block
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const config = newConfigs[i];
        if (!config) continue;

        if (addOneSlide && lines.length > 1) {
          const addedResult = await aiAddBody({ templateId: config.templateId, textTemplateId: textTemplateId || undefined, scriptText: block, instructions });
          if (!addedResult.ok) throw new Error(addedResult.error);
          const added = addedResult.data;
          currentBlocks[i] = [...lines, added[0] ?? ""].filter(Boolean).join("\n");
          const prior = config.aiSlides ?? [];
          newConfigs[i] = { ...config, aiSlides: config.cta.trim() && prior.length ? [...prior.slice(0, -1), added, prior.at(-1)!] : [...prior, added] };
          continue;
        }

        if (reuseSlides || lines.length <= 1) {
          // Fill full slides
          const result = await aiFillWithIcons({
            templateId: config.templateId,
            textTemplateId: textTemplateId || undefined,
            topic: instructions.trim(),
            hook: lines[0] || "",
            manualCta: config.cta.trim() || undefined,
            nPoints: requestedSlides,
            hooksOnly: reuseSlides,
            items: generationItems,
          }, templates.find((row) => row.id === config.templateId)?.itemScreenshots === true);
          if (!result.ok) throw new Error(result.error);
          generationItems = result.data.items;
          const res = result.data.copy;
          warnings.push(...res.warnings);
          if (reuseSlides) {
            const hook = res.slides[0]?.[0] ?? "";
            currentBlocks[i] = hook;
            newConfigs[i] = {
              ...config,
              aiSlides: res.slides.slice(0, 1),
              caption: `${res.caption}\n\n${res.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`,
              title: config.title || res.name,
            };
            continue;
          }
            const selectedTextTemplate = textTemplates.find((x) => x.id === textTemplateId);
            const hasCta = Boolean(config.cta.trim() || selectedTextTemplate?.generateCta || !textTemplateId);
            const mains = res.slides.map((s, slideIndex) =>
              selectedTextTemplate?.useTitles && slideIndex > 0 && (!hasCta || slideIndex < res.slides.length - 1)
                ? s.join(" | ")
                : (s[0] ?? ""),
            );
          currentBlocks[i] = (hasCta ? mains.slice(0, -1) : mains).join("\n");
          newConfigs[i] = {
            ...config,
            cta: hasCta ? (config.cta.trim() || mains[mains.length - 1] || "") : "",
            aiSlides: res.slides,
            caption: `${res.caption}\n\n${res.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`,
            // always autoname: prefer any manual title, else the model's name
            title: config.title || res.name,
          };
        } else {
          // Multi-line: fill metadata only
          const result = await aiFillMetadata({
            textTemplateId: textTemplateId || undefined,
            instructions: instructions.trim(),
            scriptText: block,
          });
          if (!result.ok) throw new Error(result.error);
          const res = result.data;
          newConfigs[i] = captionOnly
            ? {
                ...config,
                caption: [res.caption, config.caption.match(/(?:^|\s)(#[\p{L}\p{N}_-]+)/gu)?.join(" ")].filter(Boolean).join("\n\n"),
              }
            : {
                ...config,
                caption: `${res.caption}\n\n${res.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`,
                title: config.title || res.title,
              };
        }
      }
      setScriptText(currentBlocks.join("\n\n"));
      setConfigs(newConfigs);
      if (generationItems.length) setItems(generationItems);
      const done = fresh ? `Wrote ${currentBlocks.length} carousels` : addOneSlide ? "Added 1 slide to each carousel" : captionOnly ? `Updated ${currentBlocks.length} captions` : `Updated ${currentBlocks.length} carousels`;
      setAiConfirmation([done, ...new Set(warnings)].join(" "));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Generation failed"));
    } finally {
      setGenerating(false);
    }
  };

  if (collections.length === 0 || templates.length === 0) {
    return (
      <div className="panel mx-auto mt-16 max-w-lg rounded-2xl p-6 text-center">
        <h1 className="text-lg font-semibold tracking-tight">{t("Add what your first slideshow needs")}</h1>
        <p className="mt-2 text-sm text-muted">{t("Collections are optional. Any photo in your library can be used as a background.")}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {collections.length === 0 && <Link href="/images" className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink">{t("Search or upload images")}</Link>}
          {templates.length === 0 && <Link href="/templates" className="rounded-md border border-border px-3 py-2 text-sm">{t("Choose a template")}</Link>}
        </div>
      </div>
    );
  }

  const signatureFor = (script: string, rows: BatchConfig[]) =>
    JSON.stringify({
      script,
      rows: rows.map((row) => ({
        id: row.id,
        templateId: row.templateId,
        collectionId: row.collectionId,
        cta: row.cta,
        aiSlides: row.aiSlides,
        sceneImageIds: row.sceneImageIds,
      })),
      titleScale,
      bodyRatio,
      reuseSlides,
      nPoints,
      items,
    });

  const handleGeneratePreview = () => {
    const currentSignature = signatureFor(scriptText, configs);
    if (previewBatches.length > 0 && previewSignature === currentSignature) {
      setStep("preview");
      return;
    }
    setError("");
    startLoadingPreview(async () => {
      try {
        const batches = await Promise.all(
          blocks.map(async (block, i) => {
            const config = configs[i];
            if (!config) throw new Error(t("Missing config"));
            const { doc, backgrounds, images } = await getPreviewData(
              config.templateId,
              config.collectionId,
            );

            const lines = block
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            const ctaText = config.cta.trim();
            // An item format has one body slide per app, however many lines the
            // script happens to hold - the list is the outline.
            const deckItems = doc.itemMode && !reuseSlides ? items : [];
            // In reuse mode the script only supplies the hook: leave nPoints
            // body slots blank for the tip bank to fill on the next screen.
            const bodyCount = deckItems.length
              ? deckItems.length
              : reuseSlides
                ? nPoints
                : lines.length - 1;
            // a single-slide template ignores the extra lines and the cta
            const roles = rolesFor(doc, bodyCount, !!ctaText);
            const written = reuseSlides
              ? [lines[0] ?? "", ...Array<string>(nPoints).fill("")]
              : lines;
            const mains = (ctaText ? [...written, ctaText] : written).slice(
              0,
              roles.length,
            );

            const extrasFor = (slideIndex: number, role: SlideRole) => {
              if (!config.aiSlides) return [];
              const row =
                role === "cta"
                  ? config.aiSlides[config.aiSlides.length - 1]
                  : config.aiSlides[slideIndex];
              return row?.slice(1) ?? [];
            };

            let resolved = resizeSlides(
              buildSlides(
                doc,
                roles.map((role, slideIndex) => ({
                  role,
                  texts: splitBoxes(
                    mains[slideIndex] ?? "",
                    extrasFor(slideIndex, role),
                  ),
                })),
                backgrounds,
                undefined,
                deckItems,
              ),
              (c) => c * Number(titleScale),
              bodyRatio ? Number(bodyRatio) : undefined,
            );
            if (doc.backgroundMode === "continuous") {
              // The preview uses the first selected collection image until the
              // deck-level picker supplies an explicit scene image.
              resolved = applyContinuousScene(resolved, [backgrounds[0]]);
            }

            return { configId: config.id, slides: resolved, backgrounds, images };
          }),
        );

        setPreviewBatches(batches);
        setPreviewSignature(currentSignature);
        setActiveBox({});
        setStep("preview");
      } catch (e) {
        setError(e instanceof Error ? e.message : t("Failed to load preview"));
      }
    });
  };

  /** Bank a slide from the preview for reuse. Renders it once, server-side. */
  const bankSlide = (slide: ComposedSlide) => {
    const name = (slide.spec.blocks[0]?.text ?? "").trim().slice(0, 60);
    if (!name) {
      setError(t("Give the slide some text before saving it"));
      return;
    }
    startLoadingPreview(async () => {
      try {
        await saveSlide({ name, slide });
        setError("");
        setBanked((n) => n + 1);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : t("Could not save that slide"),
        );
      }
    });
  };

  /** Fan-out: shuffle the filtered bank and deal it round-robin across every
   *  open slot in every slideshow, so no slideshow repeats a slide and two
   *  slideshows never get the same run of them. */
  const dealIntoSlots = async () => {
    setLoadingSavedSlides(true);
    const pool = [...savedSlides];
    let next = savedSlidesCursor;
    try {
      while (next) {
        const page = await loadComposerSlides({ cursor: next, tag: trayTag || undefined });
        const known = new Set(pool.map((slide) => slide.id));
        pool.push(...page.items.filter((slide) => !known.has(slide.id)));
        next = page.nextCursor;
      }
      setSavedSlides(pool);
      setSavedSlidesCursor(null);
    } finally {
      setLoadingSavedSlides(false);
    }
    if (pool.length === 0) return;
    const bag = [...pool].sort(() => Math.random() - 0.5);
    let cursor = 0;
    setPreviewBatches((prev) =>
      prev.map((batch) => ({
        ...batch,
        slides: batch.slides.map((s) =>
          isSlot(s) ? asComposed(bag[cursor++ % bag.length]) : s,
        ),
      })),
    );
  };

  /** Drop a banked slide into slideshow `configId` at position `i`. An empty
   *  slot is filled - that is what a slot is for - and anything else is
   *  inserted before, so a slideshow can grow a slide anywhere without one.
   *  `i === slides.length` appends. */
  const insertSaved = (configId: string, i: number, picked: SavedSlide[]) => {
    if (picked.length === 0) return;
    setPreviewBatches((prev) =>
      prev.map((b) => {
        if (b.configId !== configId) return b;
        const slides = [...b.slides];
        slides.splice(i, isSlot(slides[i]) ? 1 : 0, ...picked.map(asComposed));
        return { ...b, slides };
      }),
    );
  };

  const dropSaved = (configId: string, i: number, savedId: string) => {
    const saved = savedSlides.find((s) => s.id === savedId);
    if (saved) insertSaved(configId, i, [saved]);
  };

  const removeSlide = (configId: string, i: number) =>
    setPreviewBatches((prev) =>
      prev.map((b) =>
        b.configId === configId
          ? { ...b, slides: b.slides.filter((_, si) => si !== i) }
          : b,
      ),
    );

  /** Reorder within one slideshow. `from` is the "configId:index" the drag
   *  handle put on the wire.
   *  ponytail: same slideshow only - a drag that crosses into another one is
   *  ignored. Dragging the bank into it already covers "put this slide there",
   *  and a cross-batch move has to fix up two batches at once. */
  const moveSlideTo = (configId: string, to: number, from: string) => {
    const [fromConfig, fromIndex] = from.split(":");
    if (fromConfig !== configId) return;
    setPreviewBatches((prev) =>
      prev.map((b) =>
        b.configId === configId
          ? { ...b, slides: moveSlide(b.slides, Number(fromIndex), to) }
          : b,
      ),
    );
  };

  /** Number every slideshow's body slides 1..N, or strip the numbers again.
   *  Each slideshow counts from 1: the same banked slide is point 2 in one and
   *  point 5 in the next, which is why the number lives on this copy of it and
   *  never on the saved_slides row. */
  const toggleNumbers = () => {
    const on = !numbered;
    setNumbered(on);
    setPreviewBatches((prev) =>
      prev.map((b) => ({ ...b, slides: numberSlides(b.slides, on) })),
    );
  };

  /** Copy one slide's title size, and its body size relative to that title,
   *  onto every slide in every slideshow. */
  const applySizesToAll = (from: ComposedSlide) => {
    const title = from.spec.blocks[0]?.fontSize;
    if (!title) return;
    const extra = from.spec.blocks.find((b, i) => i > 0 && !!b.label);
    setPreviewBatches((prev) =>
      prev.map((b) => ({
        ...b,
        slides: resizeSlides(
          b.slides,
          () => title,
          extra ? extra.fontSize / title : BODY_SCALE,
        ),
      })),
    );
  };

  const openSlots = previewBatches.reduce(
    (n, b) => n + b.slides.filter(isSlot).length,
    0,
  );

  const handleBack = () => {
    // "title | supporting line", not the title alone: the extra boxes are real
    // script, and splitBoxes reads this form straight back on the way forward.
    const main = lineFromSlide;
    const newBlocks = previewBatches.map((batch) => {
      return batch.slides
        .filter((s) => s.role !== "cta")
        .map(main)
        .join("\n");
    });
    const nextScript = newBlocks.join("\n\n");
    setScriptText(nextScript);

    const nextConfigs = configs.map((c) => {
        const batch = previewBatches.find((b) => b.configId === c.id);
        if (!batch) return c;
        const ctaSlide = batch.slides.find((s) => s.role === "cta");
        return {
          ...c,
          cta: ctaSlide ? main(ctaSlide) : c.cta,
          aiSlides: batch.slides.map(textsFromSlide),
        };
      });
    setConfigs(nextConfigs);
    setPreviewSignature(signatureFor(nextScript, nextConfigs));
    setStep("form");
  };

  const boxOf = (configId: string, i: number, slide: ComposedSlide) =>
    Math.min(
      activeBox[`${configId}-${i}`] ?? 0,
      (slide.spec.blocks.length ?? 1) - 1,
    );

  const selectBox = (configId: string, i: number, j: number) =>
    setActiveBox((prev) => ({ ...prev, [`${configId}-${i}`]: j }));

  function patchBlock(
    configId: string,
    i: number,
    blockIdx: number,
    p: Record<string, unknown>,
  ) {
    setPreviewBatches((prev) =>
      prev.map((batch) =>
        batch.configId === configId
          ? {
              ...batch,
              slides: batch.slides.map((s, si) =>
                si === i
                  ? {
                      ...s,
                      // a library slide reuses its rendered PNG at create time,
                      // so an edited one has to give that up or the edit is lost
                      frameUrl: undefined,
                      spec: {
                        ...s.spec,
                        blocks: s.spec.blocks.map((blk, bi) =>
                          bi === blockIdx ? { ...blk, ...p } : blk,
                        ),
                      },
                    }
                  : s,
              ),
            }
          : batch,
      ),
    );
  }

  const changeSlide = (configId: string, i: number, next: ComposedSlide) =>
    setPreviewBatches((prev) =>
      prev.map((batch) =>
        batch.configId === configId
          ? {
              ...batch,
              slides: batch.slides.map((slide, si) =>
                si === i
                  ? next
                  : next.spec.scene
                    ? {
                        ...slide,
                        frameUrl: undefined,
                        spec: {
                          ...slide.spec,
                          imageCrops: next.spec.imageCrops,
                        },
                      }
                    : slide,
              ),
            }
          : batch,
      ),
    );

  const applyFontToBatch = (configId: string, family: string) =>
    setPreviewBatches((prev) =>
      prev.map((batch) =>
        batch.configId === configId
          ? {
              ...batch,
              slides: batch.slides.map((slide) => ({
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
            }
          : batch,
      ),
    );

  const handleCreate = () => {
    setError("");
    startCreate(async () => {
      try {
        const inputs = previewBatches.map((batch) => {
          const config = configs.find((c) => c.id === batch.configId);
          if (!config) throw new Error(t("Config not found for batch"));
          if (batch.slides[0]?.spec.scene && !config.sceneImageIds?.length)
            throw new Error("Choose a scene image for every continuous-scene slideshow");
          // always autoname: fall back to the hook line so no slideshow is ever
          // left with a machine id for a name
          const hook =
            batch.slides[0]?.spec.blocks[0]?.text?.trim().slice(0, 60) ?? "";
          const fallbackTitle = hook || `slideshow-${batch.configId.slice(-6)}`;
          return {
            title: config.title.trim() || fallbackTitle,
            templateId: config.templateId,
            collectionId: config.collectionId,
            textTemplateId: config.seriesTemplateId || textTemplateId || undefined,
            sceneImageIds: config.sceneImageIds,
            caption: config.caption,
            // Reapply after edits and reorders so each viewport still follows
            // the current deck order rather than the original preview order.
            slides: batch.slides[0]?.spec.scene
              ? applyContinuousScene(
                  batch.slides.filter((s) => !isSlot(s)),
                  (config.sceneImageIds ?? []).map((id) => batch.images.find((image) => image.id === id)?.url).filter((url): url is string => !!url),
                )
              : batch.slides.filter((s) => !isSlot(s)),
          };
        });
        if (inputs.some((i) => i.slides.length === 0))
          throw new Error(t("A slideshow ended up with no slides"));

        // quota for the whole batch first, so an over-limit batch fails before
        // rendering any of it
        await checkBatchQuota(inputs.length);

        // one call per slideshow so the count below is real: rendering eight of
        // these runs a minute or more, and a single call cannot be seen into
        for (const input of inputs) {
          await createOneSlideshow(input);
        }
        localStorage.removeItem(formDraftKey);
        void removePreview(previewDraftKey).catch(() => undefined);
        localStorage.removeItem(LEGACY_DRAFT_KEY);
        localStorage.removeItem(CAMPAIGN_DRAFT_KEY);
        localStorage.setItem(
          LAST_KEY,
          JSON.stringify({
            templateId: sharedTemplateId,
            collectionId: sharedCollectionId,
            textTemplateId,
          }),
        );
        router.push("/slideshows");
      } catch (e) {
        if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e;
        setError(e instanceof Error ? e.message : t("Creation failed"));
      }
    });
  };

  const toggleSceneImage = (configId: string, imageId: string) => {
    const config = configs.find((row) => row.id === configId);
    const ids = config?.sceneImageIds ?? [];
    const next = ids.includes(imageId)
      ? ids.filter((id) => id !== imageId)
      : [...ids, imageId].slice(-2);
    updateConfig(configId, { sceneImageIds: next });
    const urls = next.map((id) => {
      const batch = previewBatches.find((row) => row.configId === configId);
      return batch?.images.find((image) => image.id === id)?.url;
    }).filter((value): value is string => !!value);
    setPreviewBatches((prev) => prev.map((batch) =>
      batch.configId === configId && urls.length
        ? { ...batch, slides: applyContinuousScene(batch.slides, urls) }
        : batch,
    ));
  };

  if (step === "preview") {
    return (
      // No max-width here on purpose: the form step is a reading column and
      // stays capped, but the preview is a work surface, and on a wide monitor
      // capping it stranded six slides in the middle with half the screen dark.
      // Columns are capped at 4 so extra width makes each slide BIGGER rather
      // than thinner - the controls under a slide need a minimum to sit on.
      <PreviewEditor count={previewBatches.length} creating={creating} numbered={numbered} error={error} onToggleNumbers={toggleNumbers} onBack={handleBack} onCreate={handleCreate}>

        {(savedSlides.length > 0 || banked > 0) && (
          <SavedSlideTray
            slides={savedSlides}
            tag={trayTag}
            onTagChange={(tag) => void changeTrayTag(tag)}
            availableTags={savedSlideTags}
            onLoadMore={savedSlidesCursor ? loadMoreSavedSlides : undefined}
            loadingMore={loadingSavedSlides}
          >
            {banked > 0 && (
              <span className="text-accent">
                {t("banked {count} this session", { count: banked })}
              </span>
            )}
            {openSlots > 0 && (
              <button
                type="button"
                onClick={dealIntoSlots}
                title={t(
                  "Shuffle and deal round-robin, so no slideshow repeats a slide",
                )}
                className="ml-auto rounded-md border border-border px-2.5 py-1 transition-colors hover:border-border-strong hover:text-foreground"
              >
                {t("Deal into {count} empty slots", { count: openSlots })}
              </button>
            )}
          </SavedSlideTray>
        )}

        <div className="space-y-14">
          {previewBatches.map((batch, batchIndex) => {
            const config = configs.find((c) => c.id === batch.configId);
            return (
              <div key={batch.configId} className="space-y-4">
                <h2 className="micro">
                  {t("Slideshow {n}", { n: batchIndex + 1 })}
                  {config?.title ? (
                    <span className="normal-case"> · {config.title}</span>
                  ) : (
                    ""
                  )}
                </h2>
                {batch.slides[0]?.spec.scene && config && (
                  <div className="rounded-lg border border-accent/30 bg-accent-dim p-3">
                    <p className="mb-2 text-xs text-muted">Continuous scene. Pick one image, or two to make a mid-carousel scene cut.</p>
                    <div className="flex flex-wrap gap-2">
                      {batch.images.map((image) => {
                        const chosen = config.sceneImageIds?.includes(image.id);
                        const pixels = image.width && image.height ? `${image.width} × ${image.height}` : "Size unknown";
                        return <button key={image.id} type="button" onClick={() => toggleSceneImage(batch.configId, image.id)} className={`overflow-hidden rounded border p-1 text-left ${chosen ? "border-accent ring-1 ring-accent" : "border-border"}`} title={pixels}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={image.url} alt="" className="h-14 w-14 object-cover" />
                        </button>;
                      })}
                    </div>
                    {config.sceneImageIds?.length ? <p className="mt-2 text-xs text-muted">{config.sceneImageIds.length === 1 ? "One image selected" : "Two images selected. The scene cuts at the midpoint."}</p> : <p className="mt-2 text-xs text-accent">Choose a scene image before rendering.</p>}
                  </div>
                )}
                {/* auto-fill instead of a breakpoint ladder: the column count
                    follows the container, so it scales on any screen and needs
                    no arbitrary min-[1800px] variant (those are emitted BEFORE
                    the named ones and lose to them - see AGENTS.md). */}
                <div className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(min(15rem,100%),1fr))]">
                  {batch.slides.map((slide, i) => (
                    <div
                      key={i}
                      {...slideDropProps({
                        onSaved: (savedId) =>
                          dropSaved(batch.configId, i, savedId),
                        onMove: (from) =>
                          moveSlideTo(batch.configId, i, from),
                      })}
                      className={
                        isSlot(slide)
                          ? "rounded-lg border border-dashed border-accent/60 p-1"
                          : undefined
                      }
                    >
                      {isSlot(slide) && (
                        <SlidePicker
                          slides={savedSlides}
                          onPick={(picked) =>
                            insertSaved(batch.configId, i, picked)
                          }
                          label={t("+ Fill from bank")}
                          className="mb-1"
                        />
                      )}
                      <SlideEditor
                        slide={slide}
                        index={i}
                        activeBox={boxOf(batch.configId, i, slide)}
                        imageLibrary={imageLibrary}
                        defaultCollectionId={config?.collectionId}
                        onLoadImageCollection={loadImageCollection}
                        loadedImageCollections={loadedImageCollections}
                        loadingImageCollection={loadingImageCollection}
                        imageCollectionsWithMore={imageCollectionsWithMore}
                        onExpand={() =>
                          setFullscreen({ configId: batch.configId, index: i })
                        }
                        onSelectBox={(j) => selectBox(batch.configId, i, j)}
                        onPatch={(box, patch) =>
                          patchBlock(batch.configId, i, box, patch)
                        }
                        onSaveSlide={() => bankSlide(slide)}
                        onRemove={
                          batch.slides.length > 1
                            ? () => removeSlide(batch.configId, i)
                            : undefined
                        }
                        onApplySizes={() => applySizesToAll(slide)}
                        handleProps={slideHandleProps(`${batch.configId}:${i}`)}
                        onMove={
                          batch.slides.length > 1
                            ? (d) =>
                                moveSlideTo(
                                  batch.configId,
                                  // an arrow step is a swap, so the target index
                                  // is past the neighbour when moving right
                                  d < 0 ? i - 1 : i + 2,
                                  `${batch.configId}:${i}`,
                                )
                            : undefined
                        }
                        onSlideChange={(next) =>
                          changeSlide(batch.configId, i, next)
                        }
                      />
                    </div>
                  ))}
                  {savedSlides.length > 0 && (
                    <AppendSlideCell
                      ratio={
                        (batch.slides[0]?.spec.width ?? 1080) /
                        (batch.slides[0]?.spec.height ?? 1920)
                      }
                      slides={savedSlides}
                      onPick={(picked) =>
                        insertSaved(batch.configId, batch.slides.length, picked)
                      }
                      onSaved={(savedId) =>
                        dropSaved(batch.configId, batch.slides.length, savedId)
                      }
                      onMove={(from) =>
                        moveSlideTo(batch.configId, batch.slides.length, from)
                      }
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {fullscreen && (() => {
          const batch = previewBatches.find(
            (row) => row.configId === fullscreen.configId,
          );
          const slide = batch?.slides[fullscreen.index];
          if (!batch || !slide) return null;
          return (
            <FullscreenSlideDialog
              index={fullscreen.index}
              total={batch.slides.length}
              onIndex={(index) => setFullscreen({ ...fullscreen, index })}
              onClose={() => setFullscreen(null)}
            >
              <SlideEditor
                slide={slide}
                index={fullscreen.index}
                activeBox={boxOf(batch.configId, fullscreen.index, slide)}
                imageLibrary={imageLibrary}
                defaultCollectionId={
                  configs.find((config) => config.id === batch.configId)
                    ?.collectionId
                }
                onLoadImageCollection={loadImageCollection}
                loadedImageCollections={loadedImageCollections}
                loadingImageCollection={loadingImageCollection}
                imageCollectionsWithMore={imageCollectionsWithMore}
                onSelectBox={(box) =>
                  selectBox(batch.configId, fullscreen.index, box)
                }
                onPatch={(box, patch) =>
                  patchBlock(batch.configId, fullscreen.index, box, patch)
                }
                onSlideChange={(next) =>
                  changeSlide(batch.configId, fullscreen.index, next)
                }
                onSaveSlide={() => bankSlide(slide)}
                onApplySizes={() => applySizesToAll(slide)}
                expanded
                fontControls
                onApplyFontToAll={(family) =>
                  applyFontToBatch(batch.configId, family)
                }
              />
            </FullscreenSlideDialog>
          );
        })()}
      </PreviewEditor>
    );
  }

  return (
    <div className="max-w-3xl pb-16">
      <PageHeader
        title={t("New slideshows")}
      />

      <div className="mb-6 flex gap-1 rounded-full border border-border p-1 text-sm" role="tablist" aria-label={t("Creation mode")}>
        <button type="button" role="tab" aria-selected={mode === "manual"} onClick={() => setMode("manual")} className={`min-h-11 rounded-full px-4 py-1.5 ${mode === "manual" ? "bg-accent text-accent-ink" : "text-muted"}`}>{t("Manual")}</button>
        <button type="button" role="tab" aria-selected={mode === "campaign"} onClick={() => setMode("campaign")} className={`min-h-11 rounded-full px-4 py-1.5 ${mode === "campaign" ? "bg-accent text-accent-ink" : "text-muted"}`}>{t("Campaign")}</button>
      </div>

      {mode === "campaign" ? (
        <CampaignEditor facts={campaignFacts} setFacts={setCampaignFacts} audience={campaignAudience} setAudience={setCampaignAudience} objective={campaignObjective} setObjective={setCampaignObjective} count={campaignCount} setCount={setCampaignCount} series={campaignSeries} setSeries={setCampaignSeries} visuals={campaignVisuals} setVisuals={setCampaignVisuals} posts={campaignPosts} setPosts={setCampaignPosts} busy={campaignBusy} progress={campaignProgress} textTemplates={textTemplates} templates={templates} onPlan={makeCampaignPlan} onRegenerate={regenerateCampaignSelected} onWrite={writeCampaign} onStop={() => { campaignStopRef.current = true; }} />
      ) : (
      <div className="space-y-8">
        {/* The script IS the product; everything else supports it. */}
        <div>
          <div className="mb-2 flex items-end justify-between gap-3">
            <span className="micro">
              {reuseSlides ? t("Hooks") : t("Script")}
            </span>
            <button
              type="button"
              disabled={!scriptText.trim()}
              onClick={() => {
                if (preFormat !== null) {
                  setScriptText(preFormat);
                  setPreFormat(null);
                  return;
                }
                const cleaned = normalizeScript(scriptText);
                if (cleaned === scriptText) return;
                setPreFormat(scriptText);
                setScriptText(cleaned);
              }}
              title={t(
                "Strip 'slide 1:' labels and markdown, then regroup into slideshows. Never changes your words.",
              )}
              className="shrink-0 rounded-md px-2.5 py-1 text-xs text-muted transition-colors hover:bg-white/[0.04] hover:text-foreground disabled:opacity-40"
            >
              {preFormat !== null ? t("Undo") : t("Match formatting")}
            </button>
          </div>
          <Textarea
            value={scriptText}
            onChange={(e) => {
              const next = e.target.value;
              setScriptText(next);
              setConfigs((prev) =>
                prev.map((config) => ({ ...config, aiSlides: null })),
              );
              if (!next.trim()) {
                setPreviewBatches([]);
                setPreviewSignature("");
              }
              setPreFormat(null);
            }}
            rows={reuseSlides ? 10 : 16}
            placeholder={
              reuseSlides
                ? t(
                    "One hook per line, a blank line between slideshows.\n\nNobody is coming to save you\n\nAnother hook",
                  )
                : t(
                    "One line per slide, a blank line starts a new slideshow. The first line is the hook.\n\nNobody is coming to save you\nWake up before your excuses do\n\nAnother slideshow hook\nAnother slide...",
                  )
            }
            className="resize-y py-2 font-mono"
          />
          {savedSlides.length > 0 && (
            <label className="mt-2 flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={reuseSlides}
                onChange={(e) => setReuseSlides(e.target.checked)}
              />
              {t("Write hooks only, fill bodies from {count} saved slides", {
                count: savedSlidesTotal,
              })}
            </label>
          )}
        </div>

        {/* AI assist, one row */}
        <div>
          <span className="micro mb-2 block">{t("Smart Fill with AI")}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={t("Topic or instructions for the writer")}
              className="min-w-48 flex-1"
            />
            {textTemplates.length > 0 && (
              <Select
                value={textTemplateId}
              onChange={(value) => {
                setTextTemplateId(value);
                const selected = textTemplates.find((x) => x.id === value);
                if (selected) {
                  setNPoints(selected.defaultSlides);
                  if (selected.appSelection === "catalog") {
                    const nextTemplateId = compatibleItemTemplateId(templates, sharedTemplateId, selected.visualTemplate);
                    setSharedTemplateId(nextTemplateId);
                    shareOut({ templateId: nextTemplateId });
                  }
                }
              }}
                options={[
                  { value: "", label: t("No series template") },
                  ...textTemplates.map((tpl) => ({
                    value: tpl.id,
                    label: tpl.name,
                  })),
                ]}
                className="px-2.5 py-1.5 text-sm"
                aria-label={t("Series template (editorial format)")}
              />
            )}
            <Input
              type="number"
              min={1}
              max={25}
              value={carouselCount}
              onChange={(e) => setCarouselCount(Math.min(25, Math.max(1, +e.target.value)))}
              title={t("Carousels")}
              className="w-16"
            />
            <Input
              type="number"
              min={2}
              max={35}
              value={nPoints}
              onChange={(e) => setNPoints(+e.target.value)}
              title={t("Total slides per carousel")}
              className="w-16"
            />
            <Button
              disabled={(!scriptText.trim() && !textTemplateId) || generating}
              onClick={handleAiFill}
            >
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              {generating ? t("Filling…") : t("Fill with AI")}
            </Button>
          </div>
          {aiConfirmation && <p className="mt-2 text-xs text-muted">{aiConfirmation}</p>}
          {generating && (
            <Busy label={t("Writing copy")} className="mt-3" />
          )}
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>

        {/* The item formats are driven by a list, not a script: the apps ARE the
            outline, so the picker sits above the settings rather than inside
            them. Shown only for a template that asked for one. */}
        {itemMode && !reuseSlides && (
          <div>
            <span className="micro mb-2 block">
              {t("The apps this slideshow is about - drag to rank them")}
            </span>
            <ItemPicker items={items} onChange={setItems} catalogApps={catalogApps} />
            {items.length === 0 && (
              <p className="text-muted mt-2 text-xs">
                {t("Add at least one app. You get one slide per app, in this order.")}
              </p>
            )}
          </div>
        )}

        {/* One settings row for the whole batch; per-slideshow overrides fold
            away behind Customize. */}
        <div>
          <span className="micro mb-2 block">
            {t("Applies to every slideshow")}
          </span>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("Template")}>
              <Select
                value={sharedTemplateId}
                onChange={(v) => {
                  const series = textTemplates.find((x) => x.id === textTemplateId);
                  const next = series?.appSelection === "catalog"
                    ? compatibleItemTemplateId(templates, v, series.visualTemplate)
                    : v;
                  setSharedTemplateId(next);
                  shareOut({ templateId: next });
                }}
                options={templates.map((tpl) => ({
                  value: tpl.id,
                  label: tpl.name,
                }))}
                className="w-full px-2.5 py-1.5 text-sm"
                aria-label={t("Template")}
              />
            </Field>
            <Field label={t("Backgrounds")}>
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {collections.map((collection) => (
                  <label key={collection.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={sharedCollectionIds.includes(collection.id)}
                      onChange={() => {
                        const next = sharedCollectionIds.includes(collection.id)
                          ? sharedCollectionIds.filter((id) => id !== collection.id)
                          : [...sharedCollectionIds, collection.id];
                        if (next.length === 0) return;
                        setSharedCollectionIds(next);
                        const assignments = distributedCollections(next, configs.length);
                        setConfigs((prev) =>
                          prev.map((config, index) => ({
                            ...config,
                            collectionId: assignments[index] ?? next[0],
                          })),
                        );
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                    <span className="text-xs text-muted">{collection.count}</span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label={t("CTA slide (optional)")}>
              <Input
                value={sharedCta}
                onChange={(e) => {
                  setSharedCta(e.target.value);
                  shareOut({ cta: e.target.value });
                }}
                placeholder={t("Follow for part 2")}
              />
            </Field>
            {/* Sizes are set here so the preview arrives right, and can still be
                nudged per slide (or pushed back out with Apply to all) after. */}
            <Field label={t("Title size")}>
              <Select
                value={titleScale}
                onChange={setTitleScale}
                options={[
                  { value: "0.8", label: t("Smaller") },
                  { value: "0.9", label: t("Small") },
                  { value: "1", label: t("Template default") },
                  { value: "1.15", label: t("Large") },
                  { value: "1.3", label: t("Larger") },
                ]}
                className="w-full px-2.5 py-1.5 text-sm"
                aria-label={t("Title size")}
              />
            </Field>
            <Field label={t("Body size")}>
              <Select
                value={bodyRatio}
                onChange={setBodyRatio}
                options={[
                  { value: "", label: t("Template default") },
                  ...SIZE_STEPS.map((s) => ({
                    value: s.value,
                    label: t(s.label),
                  })),
                ]}
                className="w-full px-2.5 py-1.5 text-sm"
                aria-label={t("Body size")}
              />
            </Field>
          </div>

          {configs.length > 0 && (
            <details className="group mt-4">
              <summary className="cursor-pointer list-none text-xs text-muted transition-colors hover:text-foreground">
                <span className="group-open:hidden">
                  {t("Customize each slideshow ({count})", {
                    count: configs.length,
                  })}
                </span>
                <span className="hidden group-open:inline">
                  {t("Hide per-slideshow settings")}
                </span>
              </summary>
              <div className="mt-3 space-y-3">
                {configs.map((config, index) => (
                  <div key={config.id} className="panel rounded-xl p-4">
                    <p className="micro mb-3">
                      {t("Slideshow {n}", { n: index + 1 })}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        value={config.title}
                        onChange={(e) =>
                          updateConfig(config.id, { title: e.target.value })
                        }
                        placeholder={t("Internal title (auto if empty)")}
                        className="sm:col-span-2"
                      />
                      <Select
                        value={config.templateId}
                        onChange={(v) =>
                          updateConfig(config.id, { templateId: v })
                        }
                        options={templates.map((tpl) => ({
                          value: tpl.id,
                          label: tpl.name,
                        }))}
                        className="w-full px-2.5 py-1.5 text-sm"
                        aria-label={t("Template")}
                      />
                      <Select
                        value={config.collectionId}
                        onChange={(v) =>
                          updateConfig(config.id, { collectionId: v })
                        }
                        options={collections.map((c) => ({
                          value: c.id,
                          label: c.name,
                          thumbs: c.covers,
                          hint: String(c.count),
                        }))}
                        className="w-full px-2.5 py-1.5 text-sm"
                        aria-label={t("Background collection")}
                      />
                      <Input
                        value={config.cta}
                        onChange={(e) =>
                          updateConfig(config.id, { cta: e.target.value })
                        }
                        placeholder={t("CTA slide (optional)")}
                      />
                      <Textarea
                        value={config.caption}
                        onChange={(e) =>
                          updateConfig(config.id, { caption: e.target.value })
                        }
                        rows={2}
                        placeholder={t("Posted caption with #hashtags")}
                        className="resize-y"
                        aria-label={t("Caption + hashtags")}
                      />
                    </div>
                    {config.aiSlides?.some((s) => s.length > 1) && (
                      <p className="mt-2 text-xs text-muted">
                        {t(
                          "Extra text boxes were filled by AI, edit on preview screen.",
                        )}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <Button
          variant="primary"
          disabled={!canPreview || loadingPreview}
          onClick={handleGeneratePreview}
          className="w-full py-3"
        >
          {loadingPreview
            ? t("Loading preview…")
            : t("Preview ({count} valid slideshows)", { count: validCount })}
        </Button>
      </div>
      )}
    </div>
  );
}
