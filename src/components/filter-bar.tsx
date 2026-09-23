"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n-client";

/**
 * Text box plus optional tag and status chips, with the whole filter state in
 * the URL (?q=&tag=&status=).
 *
 * In the URL rather than useState for one specific reason: every action in the
 * app calls revalidatePath, which re-renders the server component and would
 * throw away component state. It also makes a filtered view linkable.
 *
 * Callers read these values on the server, apply them to paginated queries,
 * and remount their grids when the URL changes.
 */
export function FilterBar({
  placeholder,
  tags = [],
  statuses = [],
  count,
  total,
}: {
  placeholder: string;
  tags?: string[];
  statuses?: string[];
  count: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useT();

  const q = params.get("q") ?? "";
  const tag = params.get("tag") ?? "";
  const status = params.get("status") ?? "";

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // The text box is local state pushed to the URL on a delay. Typing used to fire
  // one router.replace per keystroke, and each of those is a full RSC request -
  // on /templates every one of them also re-ran seedStarterTemplates(), which
  // takes a pg advisory lock. An 8-character query meant 8 of both.
  const [draft, setDraft] = useState(q);
  const typing = useRef(false);

  // keep in step when the URL changes from elsewhere (Clear, a link, back)
  useEffect(() => {
    if (!typing.current) setDraft(q);
  }, [q]);

  useEffect(() => {
    if (draft === q) return;
    const id = setTimeout(() => {
      typing.current = false;
      setParam("q", draft);
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setParam is rebuilt every render; q and draft are the real inputs
  }, [draft, q]);

  const filtering = !!(q || tag || status);

  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
      active
        ? "border-accent bg-accent text-accent-ink"
        : "border-border text-muted hover:text-foreground"
    }`;

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={draft}
          onChange={(e) => {
            typing.current = true;
            setDraft(e.target.value);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-56 rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none placeholder:text-muted focus:border-neutral-500"
        />
        {statuses.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setParam("status", status === s ? "" : s)}
            className={chip(status === s)}
          >
            {t(s)}
          </button>
        ))}
        {filtering && (
          <>
            <span className="text-xs tabular-nums text-muted">
              {t("{count} of {total}", { count, total })}
            </span>
            <button
              type="button"
              onClick={() => {
                // drop any in-flight debounce, or it would put ?q= straight back
                typing.current = false;
                setDraft("");
                router.replace(pathname, { scroll: false });
              }}
              className="text-xs text-muted underline hover:text-foreground"
            >
              {t("Clear")}
            </button>
          </>
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {/* tags are user data, never translated */}
          {tags.map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => setParam("tag", tag === x ? "" : x)}
              className={chip(tag === x)}
            >
              {x}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
