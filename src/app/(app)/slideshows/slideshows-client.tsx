"use client";

import { useState, useTransition } from "react";
import { uploadSlideshow } from "./actions";
import { useT } from "@/lib/i18n-client";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";

/** Upload a ready-made slideshow: pick images, name it, and save it like any
 *  other. The shared Dialog handles the embedded-browser close quirks. */
export function UploadSlideshowButton() {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const t = useT();

  function close() {
    setNames([]);
    setError("");
    setOpen(false);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("Upload slideshow")}</Button>

      {open && (
        <Dialog onClose={close} title={t("Upload a slideshow")}>
          <form
            action={(fd) => {
              setError("");
              start(async () => {
                try {
                  await uploadSlideshow(fd);
                } catch (e) {
                  // redirect() throws by design - let it through
                  if (e && typeof e === "object" && "digest" in e) throw e;
                  setError(e instanceof Error ? e.message : t("Upload failed"));
                }
              });
            }}
            className="space-y-3"
          >
            <Input name="title" placeholder={t("Title")} />
            <Textarea
              name="caption"
              placeholder={t("Caption (optional)")}
              rows={3}
            />
            <input
              type="file"
              name="files"
              accept="image/*"
              multiple
              required
              onChange={(e) =>
                setNames(Array.from(e.target.files ?? []).map((f) => f.name))
              }
              className="w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-white/[0.03] file:px-3 file:py-1.5 file:text-sm file:text-foreground"
            />
            {names.length > 0 && (
              <p className="text-xs text-muted">
                {t("{count} images, order: {names}", {
                  count: names.length,
                  names:
                    names.slice(0, 3).join(", ") +
                    (names.length > 3 ? "…" : ""),
                })}
              </p>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={close}>
                {t("Cancel")}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={pending || names.length < 2}
              >
                {pending ? t("Uploading…") : t("Upload")}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
