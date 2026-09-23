"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Dices, Image as ImageIcon, Type, Undo2 } from "lucide-react";
import type {
  IconBlock,
  TemplateDoc,
  TextBlock,
  SlideRole,
  SlideStyle,
} from "@/lib/template-types";
import {
  resolveFrame,
  ANCHOR_IDS,
  ASPECT_PRESETS,
  FONT_SUGGESTIONS,
  newTextBlock,
  styleFor,
  type AnchorId,
} from "@/lib/template-types";
import { DraggablePreview } from "@/components/draggable-preview";
import { useFontLoaded } from "../preview";
import { Select } from "@/components/select";
import {
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  renderSample,
} from "../actions";
import { useT } from "@/lib/i18n-client";
import { Button } from "@/components/ui/button";
import type { T } from "@/lib/locales";

/** Preview copy: the reference slideshow's own line when the template was
 *  imported, else a generic stand-in. Seeing the real copy is the fastest way
 *  to tell whether an imported template actually matches its source. */
function sampleFor(
  doc: TemplateDoc,
  role: SlideRole,
  bodyIndex: number,
  t: T,
): string {
  const own = styleFor(doc, role, bodyIndex).blocks[0]?.text?.trim();
  return own || roleSample(role, t);
}

const roleSample = (role: SlideRole, t: T) =>
  ({
    hook: t("Nobody is coming to save you. Train anyway."),
    body: t("Wake up before your excuses do."),
    cta: t("Follow for part 2 →"),
  })[role];

// FONT_SUGGESTIONS are suggestions only - any family from fonts.google.com works

const DEFAULT_SHADOW = "0 2px 8px rgba(0,0,0,0.55)";

/** A centred square-ish slot - the shape a white explainer page wants. */
const DEFAULT_IMAGE_BOX = { x: 20, y: 34, w: 60, h: 42 };

function FontBadge({ family }: { family: string }) {
  const status = useFontLoaded(family);
  const t = useT();
  if (status === "loading")
    return <span className="text-xs text-muted">…</span>;
  if (status === "ok")
    return <span className="text-xs text-green-400">✓</span>;
  return <span className="text-xs text-red-400">✗ {t("not found")}</span>;
}

const inputCls =
  "w-full rounded-md border border-border bg-white/[0.03] px-2 py-1 text-sm outline-none transition-colors focus:border-border-strong";

/** Tiny labelled control for the dense grids: label above, control below. */
function Mini({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      {children}
    </label>
  );
}

/** slide selection: the hook, one of the body variants, or the CTA */
type Sel = { role: SlideRole; bodyIndex: number };

function roleLabel(sel: Sel, bodyCount: number, t: T): string {
  if (sel.role === "hook") return t("Hook");
  if (sel.role === "cta") return t("CTA");
  return bodyCount > 1 ? t("Body {n}", { n: sel.bodyIndex + 1 }) : t("Body");
}

export function TemplateEditor({
  id,
  initialName,
  initialDoc,
  sampleImages,
  collections,
  memberships,
}: {
  id: string;
  initialName: string;
  initialDoc: TemplateDoc;
  sampleImages: { id: string; url: string }[];
  collections: { id: string; name: string }[];
  memberships: { collectionId: string; imageId: string }[];
}) {
  const t = useT();
  const [name, setName] = useState(initialName);
  const [doc, setDoc] = useState<TemplateDoc>(initialDoc);
  const [sel, setSel] = useState<Sel>({ role: "hook", bodyIndex: 0 });
  const [blockIdx, setBlockIdx] = useState(0);
  /** Which layer the inspector is showing. Text boxes, icon tiles and the photo
   *  slot are all layers now, so selection has to say which kind. */
  const [layer, setLayer] = useState<"text" | "icon" | "image">("text");
  const [iconIdx, setIconIdx] = useState(0);
  /** Bounded undo stack of whole docs. ponytail: whole-doc snapshots, not a
   *  command log - a TemplateDoc is a few KB of JSON and 30 of them cost less
   *  than the machinery to describe every edit as an invertible operation. */
  const [history, setHistory] = useState<TemplateDoc[]>([]);
  const [colFilter, setColFilter] = useState<string>("all");
  const [bg, setBg] = useState<string | undefined>(sampleImages[0]?.url);
  const [text, setText] = useState<string>(() =>
    sampleFor(initialDoc, "hook", 0, t),
  );
  const [textTouched, setTextTouched] = useState(false);
  // jitter roll shown in the preview; re-rolled on demand
  const [roll, setRoll] = useState<number>(0.5);
  const [serverPng, setServerPng] = useState<string | null>(null);
  const [view, setView] = useState<"live" | "final">("live");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const shownImages =
    colFilter === "all"
      ? sampleImages
      : sampleImages.filter((img) =>
          memberships.some(
            (m) => m.imageId === img.id && m.collectionId === colFilter,
          ),
        );

  const style = styleFor(doc, sel.role, sel.bodyIndex);
  const safeBlockIdx = Math.min(blockIdx, style.blocks.length - 1);
  const b = style.blocks[safeBlockIdx];

  const dropRender = () => {
    setServerPng(null);
    setView("live");
  };

  // Ctrl+Z anywhere that isn't a text field - inside one the browser's own undo
  // is what you meant.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function switchSel(s: Sel) {
    setSel(s);
    setBlockIdx(0);
    setLayer("text");
    setIconIdx(0);
    if (!textTouched) setText(sampleFor(doc, s.role, s.bodyIndex, t));
    dropRender();
  }

  const HISTORY_MAX = 30;
  /** Snapshot before a change, so Ctrl+Z has somewhere to go. */
  function remember() {
    setDoc((d) => {
      setHistory((h) => [...h.slice(-(HISTORY_MAX - 1)), d]);
      return d;
    });
  }

  function undo() {
    setHistory((h) => {
      if (!h.length) return h;
      setDoc(h[h.length - 1]);
      return h.slice(0, -1);
    });
    dropRender();
  }

  /** write the current slide style back into the doc */
  function putStyle(next: SlideStyle) {
    remember();
    setDoc((d) =>
      sel.role === "body"
        ? {
            ...d,
            bodies: d.bodies.map((s, i) => (i === sel.bodyIndex ? next : s)),
          }
        : { ...d, [sel.role]: next },
    );
    dropRender();
  }

  /** Copy this slide's whole look onto the hook, every body and the CTA.
   *  The one thing that made a consistent template tedious: the three roles are
   *  independent SlideStyle objects with no inheritance, so every value had to
   *  be typed three times or more. */
  function applyToAllRoles() {
    remember();
    const copy = () => JSON.parse(JSON.stringify(style)) as SlideStyle;
    setDoc((d) => ({
      ...d,
      hook: copy(),
      bodies: d.bodies.map(copy),
      cta: copy(),
    }));
    dropRender();
  }

  function patchIcon(p: Partial<IconBlock>, idx = iconIdx) {
    putStyle({
      ...style,
      icons: (style.icons ?? []).map((ic, i) =>
        i === idx ? { ...ic, ...p } : ic,
      ),
    });
  }

  function patchBlock(p: Partial<TextBlock>, idx = safeBlockIdx) {
    putStyle({
      ...style,
      blocks: style.blocks.map((blk, i) =>
        i === idx ? { ...blk, ...p } : blk,
      ),
    });
  }

  function patchStyle(p: Partial<SlideStyle>) {
    putStyle({ ...style, ...p });
  }

  /** `at` comes from double-clicking the canvas; the "+" button passes nothing
   *  and the box lands under the main block. The click point is in preview
   *  space, which carries the jitter offset - subtract it so the box saves
   *  where it was dropped, same correction the drag handler makes. */
  function addBlock(at?: { x: number; y: number }) {
    putStyle({
      ...style,
      blocks: [
        ...style.blocks,
        newTextBlock(
          style.blocks[0],
          at && { x: at.x - jitterDx, y: at.y - jitterDy },
        ),
      ],
    });
    setBlockIdx(style.blocks.length);
  }

  function removeBlock(idx = safeBlockIdx) {
    // deleting the main line promotes the next box; a style always keeps one,
    // since jitter, anchors and the script all read blocks[0]
    if (style.blocks.length < 2) return;
    const blocks = style.blocks.filter((_, i) => i !== idx);
    // the promoted box is the script line now, so its AI label no longer applies
    if (idx === 0) blocks[0] = { ...blocks[0], label: undefined };
    putStyle({ ...style, blocks });
    setBlockIdx(Math.max(0, idx - 1));
  }

  function addBody() {
    const src = sel.role === "body" ? style : doc.bodies[doc.bodies.length - 1];
    const copy: SlideStyle = JSON.parse(JSON.stringify(src));
    setDoc((d) => ({ ...d, bodies: [...d.bodies, copy] }));
    switchSel({ role: "body", bodyIndex: doc.bodies.length });
  }

  function removeBody() {
    if (doc.bodies.length <= 1) return;
    setDoc((d) => ({
      ...d,
      bodies: d.bodies.filter((_, i) => i !== sel.bodyIndex),
    }));
    switchSel({ role: "body", bodyIndex: Math.max(0, sel.bodyIndex - 1) });
  }

  const base = resolveFrame(doc, sel.role, () => roll, sel.bodyIndex);
  // blocks carry their own text: block 0 gets the sample line, and a labelled
  // (AI-written) box shows its label so it stays visible while positioning
  const previewFrame = {
    ...base,
    blocks: base.blocks.map((blk, i) => ({
      ...blk,
      text: i === 0 ? text : blk.text || (blk.label ? `[${blk.label}]` : ""),
    })),
  };
  // preview shows the jittered position; drag must write back the base x/y
  const jitterDx = previewFrame.blocks[0].x - style.blocks[0].x;
  const jitterDy = previewFrame.blocks[0].y - style.blocks[0].y;
  const unjitterX = (x: number) => Math.round((x - jitterDx) * 10) / 10;
  const unjitterY = (y: number) => Math.round((y - jitterDy) * 10) / 10;

  // A 2-up or 2x2 slide needs one image PER CELL. The picker only tracks the
  // first, so take the next sample images after it and wrap - handing the same
  // url to every cell renders the same crop twice and reads as "the split is
  // broken" when it is really just one photo shown four times.
  const previewBgs = (() => {
    const n = previewFrame.bgCount ?? 1;
    const pool = sampleImages.map((i) => i.url);
    if (!bg) return [];
    if (n === 1 || pool.length < 2) return [bg];
    const start = Math.max(0, pool.indexOf(bg));
    return Array.from({ length: n }, (_, k) => pool[(start + k) % pool.length]);
  })();

  const label = roleLabel(sel, doc.bodies.length, t);

  const pill = (active: boolean) =>
    `rounded-full px-2.5 py-1 text-xs transition-colors ${
      active
        ? "bg-foreground font-medium text-background"
        : "text-muted hover:text-foreground"
    }`;

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      {/* controls */}
      <div className="w-full shrink-0 space-y-6 lg:w-80">
        <div className="flex items-center gap-2">
          <input
            value={name}
            aria-label={t("Template name")}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-white/[0.03] px-3 py-1.5 text-sm font-medium outline-none transition-colors focus:border-border-strong"
          />
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await updateTemplate(id, name, doc);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              })
            }
          >
            {saved ? t("Saved") : t("Save")}
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <Select
            className={inputCls + " flex-1"}
            value={`${doc.width}x${doc.height}`}
            onChange={(v) => {
              const [w, h] = v.split("x").map(Number);
              setDoc((d) => ({ ...d, width: w, height: h }));
              dropRender();
            }}
            options={ASPECT_PRESETS.map((p) => ({
              value: `${p.width}x${p.height}`,
              label: p.label,
            }))}
            aria-label={t("Aspect ratio")}
          />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={!!doc.single}
              title={t(
                "A poster, not a carousel: only the hook style renders, and one line of script makes one slide.",
              )}
              onChange={(e) => {
                setDoc((d) => ({
                  ...d,
                  single: e.target.checked || undefined,
                }));
                if (e.target.checked) switchSel({ role: "hook", bodyIndex: 0 });
                dropRender();
              }}
            />
            {t("Single slide")}
          </label>
        </div>

        <label className="grid gap-1 text-xs text-muted">
          {t("Background behavior")}
          <Select
            className={inputCls}
            value={doc.backgroundMode ?? "per-slide"}
            onChange={(v) => {
              setDoc((d) => ({ ...d, backgroundMode: v as "per-slide" | "continuous" }));
              dropRender();
            }}
            options={[
              { value: "per-slide", label: t("Different image per slide") },
              { value: "continuous", label: t("Continuous scene across slides") },
            ]}
            aria-label={t("Background behavior")}
          />
        </label>

        {/* slide tabs: hook, each body variant, cta - a single-slide template
            only ever renders the hook, so the rest would be dead controls */}
        <div
          className={`glass flex-wrap items-center gap-1 rounded-full p-1 ${
            doc.single ? "hidden" : "flex"
          }`}
        >
          <button
            onClick={() => switchSel({ role: "hook", bodyIndex: 0 })}
            className={pill(sel.role === "hook")}
          >
            {t("Hook")}
          </button>
          {doc.bodies.map((_, i) => (
            <button
              key={i}
              onClick={() => switchSel({ role: "body", bodyIndex: i })}
              className={pill(sel.role === "body" && sel.bodyIndex === i)}
            >
              {doc.bodies.length > 1 ? t("Body {n}", { n: i + 1 }) : t("Body")}
            </button>
          ))}
          <button
            onClick={addBody}
            title={t(
              "Add a body variant, slide N always uses variant N (repeating)",
            )}
            className="rounded-full px-2 py-1 text-xs text-muted hover:text-foreground"
          >
            +
          </button>
          <button
            onClick={() => switchSel({ role: "cta", bodyIndex: 0 })}
            className={pill(sel.role === "cta")}
          >
            {t("CTA")}
          </button>
        </div>
        {sel.role === "body" && doc.bodies.length > 1 && (
          <p className="-mt-4 flex items-center justify-between text-xs text-muted">
            <span>{t("Variants cycle in order.")}</span>
            <button onClick={removeBody} className="text-red-400 hover:underline">
              {t("remove")}
            </button>
          </p>
        )}

        {/* Layers. Was a row of pills reading "Main 2 3 4", which told you
            nothing about what any of them held - you had to click each one to
            find out. Now every layer shows its own content. */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="micro">{t("Layers")}</p>
            <div className="flex items-center gap-1">
              <button
                onClick={applyToAllRoles}
                title={t(
                  "Copy this slide's whole look onto the hook, every body variant and the CTA",
                )}
                className="rounded-full border border-border px-2 py-0.5 text-xs text-muted hover:text-foreground"
              >
                {t("Apply to all slides")}
              </button>
              <button
                onClick={undo}
                disabled={!history.length}
                title={t("Undo (Ctrl+Z)")}
                className="rounded-full px-1.5 py-1 text-muted hover:text-foreground disabled:opacity-30"
              >
                <Undo2 size={13} />
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            {style.blocks.map((blk, i) => {
              const active = layer === "text" && safeBlockIdx === i;
              const what =
                (blk.text ?? "").trim() ||
                (blk.label ? `[${blk.label}]` : t("empty"));
              return (
                <button
                  key={i}
                  onClick={() => {
                    setLayer("text");
                    setBlockIdx(i);
                  }}
                  className={`flex w-full items-center gap-2 border-b border-border px-2 py-1.5 text-left last:border-b-0 ${
                    active ? "bg-accent-dim" : "hover:bg-white/[0.04]"
                  }`}
                >
                  <Type size={12} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-xs">{what}</span>
                  {i === 0 && <span className="micro shrink-0">{t("main")}</span>}
                  {i > 0 && blk.label && (
                    <span className="micro text-accent shrink-0">{t("ai")}</span>
                  )}
                </button>
              );
            })}
            {(style.icons ?? []).map((ic, i) => (
              <button
                key={`icon-${i}`}
                onClick={() => {
                  setLayer("icon");
                  setIconIdx(i);
                }}
                className={`flex w-full items-center gap-2 border-b border-border px-2 py-1.5 text-left last:border-b-0 ${
                  layer === "icon" && iconIdx === i
                    ? "bg-accent-dim"
                    : "hover:bg-white/[0.04]"
                }`}
              >
                <ImageIcon size={12} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-xs">
                  {ic.bind === "all"
                    ? t("every app's logo, in a row")
                    : ic.bind === "item"
                      ? t("this slide's app icon")
                      : t("app {n}'s icon", { n: Number(ic.bind) + 1 })}
                </span>
              </button>
            ))}
            {style.imageBox && (
              <button
                onClick={() => setLayer("image")}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-left ${
                  layer === "image" ? "bg-accent-dim" : "hover:bg-white/[0.04]"
                }`}
              >
                <ImageIcon size={12} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-xs">
                  {t("photo slot")}
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setLayer("text");
                addBlock();
              }}
              title={t(
                "Add a text box, label it for AI to write, or leave it fixed (handle, swipe hint, page number). You can also double-click the preview",
              )}
              className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted hover:text-foreground"
            >
              {t("+ text")}
            </button>
            {layer === "text" && style.blocks.length > 1 && (
              <button
                onClick={() => removeBlock()}
                title={t("Remove this text box")}
                className="rounded-full px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-500/10"
              >
                {t("remove layer")}
              </button>
            )}
          </div>

          {/* Everything below inspects the SELECTED layer. Position and width
              are not here on purpose: you drag them on the canvas, which is the
              only way to judge where a line wraps. */}
          {layer === "icon" && style.icons?.[iconIdx] && (
            <div className="grid grid-cols-2 gap-2">
              <Mini label={t("Shows")}>
                <Select
                  value={String(style.icons[iconIdx].bind)}
                  onChange={(v) =>
                    patchIcon({ bind: v === "item" || v === "all" ? v : Number(v) })
                  }
                  options={[
                    { value: "item", label: t("This slide's app") },
                    { value: "all", label: t("Every app, in a row") },
                    ...[0, 1, 2, 3, 4].map((k) => ({
                      value: String(k),
                      label: t("App {n} only", { n: k + 1 }),
                    })),
                  ]}
                  className="w-full px-2 py-1 text-sm"
                />
              </Mini>
              <Mini label={t("Corner rounding %")}>
                <input
                  type="number"
                  className={inputCls}
                  value={style.icons[iconIdx].radius ?? 24}
                  onChange={(e) => patchIcon({ radius: +e.target.value })}
                  title={t("24 is the iOS app-icon curve. 50 makes it a circle.")}
                />
              </Mini>
            </div>
          )}

          {layer === "text" && (
            <div className="grid grid-cols-2 gap-2">
              <Mini label={t("AI label")}>
                <input
                  className={inputCls}
                  value={b.label ?? ""}
                  onChange={(e) =>
                    patchBlock({ label: e.target.value || undefined })
                  }
                  placeholder={
                    safeBlockIdx === 0
                      ? t("the slide's main line")
                      : t("one-line subheadline")
                  }
                  title={t(
                    "Name what goes in this box and AI writes it on every slide. Leave empty to keep the fixed text below.",
                  )}
                />
              </Mini>
              <Mini label={b.label ? t("Fallback text") : t("Fixed text")}>
                <input
                  className={inputCls}
                  value={b.text ?? ""}
                  onChange={(e) => patchBlock({ text: e.target.value })}
                  placeholder={t("@handle · {n}/{total}")}
                  title={t(
                    "Shown when the box is unlabelled or left alone. {n} = slide number, {total} = slide count, {item} = the app's name, {pos}/{rank} = its place in the list, {tier} = its tier letter.",
                  )}
                />
              </Mini>
            </div>
          )}

          {/* type controls belong to a text layer; an icon has no font */}
          {layer === "text" && (
          <>
          <Mini label={t("Font")}>
            <span className="flex items-center gap-2">
              <input
                list="google-fonts"
                className={inputCls}
                value={b.fontFamily}
                onChange={(e) => patchBlock({ fontFamily: e.target.value })}
                placeholder={t("Any Google Font")}
              />
              <FontBadge family={b.fontFamily} />
            </span>
          </Mini>
          <datalist id="google-fonts">
            {FONT_SUGGESTIONS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>

          <div className="grid grid-cols-3 gap-2">
            <Mini label={t("Size (px)")}>
              <input
                type="number"
                className={inputCls}
                value={b.fontSize}
                onChange={(e) => patchBlock({ fontSize: +e.target.value })}
              />
            </Mini>
            <Mini label={t("Weight")}>
              <Select
                className={inputCls}
                value={String(b.fontWeight)}
                onChange={(v) =>
                  patchBlock({ fontWeight: +v as TextBlock["fontWeight"] })
                }
                options={[400, 700, 800].map((w) => ({
                  value: String(w),
                  label: String(w),
                }))}
              />
            </Mini>
            <Mini label={t("Line height")}>
              <input
                type="number"
                step={0.05}
                className={inputCls}
                value={b.lineHeight}
                onChange={(e) => patchBlock({ lineHeight: +e.target.value })}
              />
            </Mini>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Mini label={t("Color")}>
              <input
                type="color"
                value={b.color}
                onChange={(e) => patchBlock({ color: e.target.value })}
                className="h-8 w-full cursor-pointer rounded-md border border-border bg-transparent"
              />
            </Mini>
            <Mini label={t("Align")}>
              <Select
                className={inputCls}
                value={b.align}
                onChange={(v) => patchBlock({ align: v as TextBlock["align"] })}
                options={[
                  { value: "left", label: t("left") },
                  { value: "center", label: t("center") },
                  { value: "right", label: t("right") },
                ]}
              />
            </Mini>
            <Mini label={t("Uppercase")}>
              <input
                type="checkbox"
                checked={!!b.uppercase}
                onChange={(e) => patchBlock({ uppercase: e.target.checked })}
                className="mt-2"
              />
            </Mini>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={b.shadow != null}
                onChange={(e) =>
                  patchBlock({
                    shadow: e.target.checked ? DEFAULT_SHADOW : undefined,
                  })
                }
              />
              {t("Shadow")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={b.background != null}
                onChange={(e) =>
                  patchBlock({
                    background: e.target.checked ? "#000000" : undefined,
                  })
                }
              />
              {t("Card color")}
            </label>
            {b.background != null && (
              <input
                type="color"
                value={b.background}
                onChange={(e) => patchBlock({ background: e.target.value })}
                className="h-6 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
              />
            )}
          </div>

          {(b.shadow != null || b.background != null) && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
                {t("Advanced")}
              </summary>
              <div className="mt-2 space-y-2">
                {b.shadow != null && (
                  <Mini label={t("Shadow CSS")}>
                    <input
                      value={b.shadow}
                      onChange={(e) => patchBlock({ shadow: e.target.value })}
                      className={inputCls + " text-xs"}
                    />
                  </Mini>
                )}
                {b.background != null && (
                  <div className="grid grid-cols-2 gap-2">
                    <Mini label={t("Padding")}>
                      <input
                        type="number"
                        className={inputCls}
                        value={b.padding ?? 0}
                        onChange={(e) =>
                          patchBlock({ padding: +e.target.value })
                        }
                      />
                    </Mini>
                    <Mini label={t("Radius")}>
                      <input
                        type="number"
                        className={inputCls}
                        value={b.radius ?? 0}
                        onChange={(e) => patchBlock({ radius: +e.target.value })}
                      />
                    </Mini>
                  </div>
                )}
              </div>
            </details>
          )}
          </>
          )}
        </section>

        {/* canvas & variation - the tinkering half, folded away by default */}
        <details className="group">
          <summary className="micro cursor-pointer list-none transition-colors hover:text-foreground">
            {t("Canvas & variation")}{" "}
            <span className="text-muted group-open:hidden">＋</span>
            <span className="hidden text-muted group-open:inline">−</span>
          </summary>
          <div className="mt-3 space-y-3">
            <Mini label={t("Dim overlay")}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={style.dim}
                onChange={(e) => patchStyle({ dim: +e.target.value })}
                className="w-full"
              />
            </Mini>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={style.bg != null}
                  title={t(
                    "Paint the canvas a flat colour. Only shows where the image is not, pair it with an image slot.",
                  )}
                  onChange={(e) =>
                    patchStyle({ bg: e.target.checked ? "#ffffff" : undefined })
                  }
                />
                {t("Canvas color")}
              </label>
              {style.bg != null && (
                <input
                  type="color"
                  value={style.bg}
                  onChange={(e) => patchStyle({ bg: e.target.value })}
                  className="h-6 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                />
              )}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={style.imageBox != null}
                  title={t(
                    "Put the image in a box instead of behind everything, e.g. a square in the middle of a white page.",
                  )}
                  onChange={(e) =>
                    patchStyle({
                      imageBox: e.target.checked ? DEFAULT_IMAGE_BOX : undefined,
                    })
                  }
                />
                {t("Image slot")}
              </label>
            </div>
            {style.imageBox && (
              <p className="text-xs text-muted">
                {t(
                  "Drag the dashed photo box on the preview to place it, and its corner to size it.",
                )}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Mini label={t("Background")}>
                <Select
                  className={inputCls}
                  value={String(style.bgCount ?? 1)}
                  onChange={(v) =>
                    patchStyle({ bgCount: +v === 1 ? undefined : (+v as 2 | 3 | 4) })
                  }
                  options={[
                    { value: "1", label: t("1 image") },
                    { value: "2", label: t("2 stacked") },
                    { value: "3", label: t("3 image collage") },
                    { value: "4", label: t("2×2 grid") },
                  ]}
                />
              </Mini>
              <Mini label={t("X jitter ±%")}>
                <input
                  type="number"
                  min={0}
                  max={30}
                  className={inputCls}
                  value={style.jitterX ?? 0}
                  onChange={(e) =>
                    patchStyle({ jitterX: +e.target.value || undefined })
                  }
                />
              </Mini>
              <Mini label={t("Y jitter ±%")}>
                <input
                  type="number"
                  min={0}
                  max={40}
                  className={inputCls}
                  value={style.jitterY ?? 0}
                  onChange={(e) =>
                    patchStyle({ jitterY: +e.target.value || undefined })
                  }
                />
              </Mini>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span
                className="text-muted"
                title={t(
                  "Generated slides place their main text in a random selected zone (alignment follows the zone). None selected = use the block position above.",
                )}
              >
                {t("Anchor zones")}
              </span>
              <div className="grid grid-cols-3 gap-1">
                {ANCHOR_IDS.map((a: AnchorId) => {
                  const on = doc.anchors?.includes(a) ?? false;
                  return (
                    <button
                      key={a}
                      title={a}
                      onClick={() =>
                        setDoc((d) => ({
                          ...d,
                          anchors: d.anchors?.includes(a)
                            ? d.anchors.filter((z) => z !== a)
                            : [...(d.anchors ?? []), a],
                        }))
                      }
                      className={`h-5 w-5 rounded-md transition-colors ${
                        on
                          ? "bg-accent"
                          : "bg-white/[0.08] hover:bg-white/[0.15]"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
            <button
              onClick={() => {
                setRoll(Math.random());
                dropRender();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground"
            >
              <Dices className="h-4 w-4" />
              {t("Re-roll position")}
            </button>
          </div>
        </details>

        {/* preview inputs */}
        <section className="space-y-3">
          <Mini label={t("Sample text")}>
            <input
              className={inputCls}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setTextTouched(true);
              }}
            />
          </Mini>
          {collections.length > 0 && (
            <Mini label={t("Backgrounds from")}>
              <Select
                className={inputCls}
                value={colFilter}
                onChange={(v) => {
                  setColFilter(v);
                  const first =
                    v === "all"
                      ? sampleImages[0]
                      : sampleImages.find((img) =>
                          memberships.some(
                            (m) =>
                              m.imageId === img.id && m.collectionId === v,
                          ),
                        );
                  if (first) setBg(first.url);
                }}
                options={[
                  { value: "all", label: t("All images") },
                  ...collections.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </Mini>
          )}
          {shownImages.length > 0 && (
            <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
              {shownImages.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setBg(img.url)}
                  // its only child is an alt="" image, so without this the
                  // button announced as just "button"
                  aria-label={t("Use this background")}
                  aria-pressed={bg === img.url}
                  className={`h-12 w-9 overflow-hidden rounded-md transition-all ${
                    bg === img.url
                      ? "ring-2 ring-accent"
                      : "opacity-70 hover:opacity-100"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="flex gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const newId = await duplicateTemplate(id);
                router.push(`/templates/${newId}`);
              })
            }
          >
            <Copy className="h-3.5 w-3.5" />
            {t("Duplicate")}
          </Button>
          <Button
            variant="danger"
            className="ml-auto"
            onClick={() =>
              start(async () => {
                await deleteTemplate(id);
                router.push("/templates");
              })
            }
          >
            {t("Delete")}
          </Button>
        </div>
      </div>

      {/* preview: one canvas, live CSS mirror or the satori parity render */}
      <div className="w-full max-w-105 flex-1">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="micro">
            {label}
            {style.jitterX || style.jitterY ? ` · ${t("jitter")}` : ""}
          </p>
          <div className="flex items-center gap-1">
            <div className="glass flex items-center gap-1 rounded-full p-0.5">
              <button
                onClick={() => setView("live")}
                className={pill(view === "live")}
              >
                {t("Live")}
              </button>
              <button
                onClick={() => {
                  if (serverPng) setView("final");
                  else
                    start(async () => {
                      setServerPng(await renderSample(previewFrame, previewBgs));
                      setView("final");
                    });
                }}
                disabled={pending}
                className={pill(view === "final")}
              >
                {pending ? t("Rendering…") : t("Final")}
              </button>
            </div>
          </div>
        </div>
        {view === "final" && serverPng ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={serverPng} alt="" className="w-full rounded-xl" />
        ) : (
          <div style={{ aspectRatio: `${doc.width} / ${doc.height}` }}>
            <DraggablePreview
              frame={previewFrame}
              backgroundUrls={previewBgs}
              activeBlock={layer === "text" ? safeBlockIdx : undefined}
              onSelectBlock={(i) => {
                setLayer("text");
                setBlockIdx(i);
              }}
              className="h-full w-full rounded-xl"
              // The preview shows the jittered layout, the doc stores the base
              // one, so every write-back subtracts the offset. That applies to
              // EXTRAS AND ICONS TOO, not just block 0: resolveFrame shifts them
              // all by the same delta (shiftExtras), so correcting only block 0
              // made an extra box jump by the jitter amount the moment you
              // dragged it on a template that jitters. Zero when it doesn't.
              onChange={(i, x, y) =>
                patchBlock({ x: unjitterX(x), y: unjitterY(y) }, i)
              }
              onAddBlock={(x, y) => addBlock({ x, y })}
              onDeleteBlock={removeBlock}
              onResize={(i, w) => patchBlock({ w: Math.round(w * 10) / 10 }, i)}
              // icons ride the same jitter correction as the extras: the preview
              // shows them shifted, the doc stores them un-shifted
              activeIcon={layer === "icon" ? iconIdx : undefined}
              onSelectIcon={(i) => {
                setLayer("icon");
                setIconIdx(i);
              }}
              onIconChange={(i, x, y) =>
                patchIcon({ x: unjitterX(x), y: unjitterY(y) }, i)
              }
              onIconResize={(i, size) =>
                patchIcon({ size: Math.round(size * 10) / 10 }, i)
              }
              imageBoxActive={layer === "image"}
              onSelectImageBox={() => setLayer("image")}
              onImageBoxChange={
                style.imageBox
                  ? (box) =>
                      patchStyle({
                        imageBox: {
                          x: Math.round(box.x * 10) / 10,
                          y: Math.round(box.y * 10) / 10,
                          w: Math.round(box.w * 10) / 10,
                          h: Math.round(box.h * 10) / 10,
                        },
                      })
                  : undefined
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
