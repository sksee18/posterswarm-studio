"use client";

import { useState, useTransition } from "react";
import { setSlideshowTags } from "../actions";
import { useT } from "@/lib/i18n-client";
import { useToast } from "@/components/toast";

/** Chip row plus an add box. Saves on every change rather than behind a Save
 *  button: a tag is one word and there is nothing to review. */
export function TagEditor({
  id,
  tags,
  known,
}: {
  id: string;
  tags: string[];
  known: string[];
}) {
  const [list, setList] = useState(tags);
  const [draft, setDraft] = useState("");
  const [, start] = useTransition();
  const t = useT();
  const toast = useToast();

  const commit = (next: string[]) => {
    const previous = list;
    setList(next);
    start(async () => {
      try {
        await setSlideshowTags(id, next);
      } catch (e) {
        // put the chip back. Optimistic with no rollback meant a rejected tag
        // sat there looking saved until a hard reload said otherwise.
        setList(previous);
        toast(e instanceof Error ? e.message : t("Could not save tags"));
      }
    });
  };

  const add = () => {
    const value = draft.trim().toLowerCase();
    setDraft("");
    if (!value || list.includes(value)) return;
    commit([...list, value]);
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {list.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted"
        >
          #{tag}
          <button
            type="button"
            aria-label={t("Remove tag {tag}", { tag })}
            onClick={() => commit(list.filter((x) => x !== tag))}
            className="text-muted hover:text-red-400"
          >
            ×
          </button>
        </span>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          list="known-tags"
          placeholder={t("+ tag")}
          aria-label={t("Add a tag")}
          className="w-24 rounded-full border border-dashed border-border bg-transparent px-2.5 py-0.5 text-xs outline-none placeholder:text-muted focus:border-neutral-500"
        />
        <datalist id="known-tags">
          {known.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </form>
    </div>
  );
}
