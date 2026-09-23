"use client";

import type { ReactNode } from "react";
import { Busy } from "@/components/busy";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { useT } from "@/lib/i18n-client";

export function PreviewEditor({ count, creating, numbered, error, onToggleNumbers, onBack, onCreate, children }: {
  count: number;
  creating: boolean;
  numbered: boolean;
  error: string;
  onToggleNumbers: () => void;
  onBack: () => void;
  onCreate: () => void;
  children: ReactNode;
}) {
  const t = useT();
  return <div>
    <PageHeader title={t("Preview & Adjust ({count} slideshows)", { count })} actions={<>
      {creating && <Busy label={count > 1 ? t("Rendering slideshows") : t("Rendering")} />}
      <Button onClick={onToggleNumbers} disabled={creating} aria-pressed={numbered} title={t("Prefix every body slide with its position, 1. 2. 3. Each slideshow counts from 1.")} className={numbered ? "!border-accent !text-accent" : undefined}>{numbered ? t("Numbered") : t("Number slides")}</Button>
      <Button onClick={onBack} disabled={creating}>{t("Back")}</Button>
      <Button variant="primary" disabled={creating} onClick={onCreate}>{creating ? t("Rendering…") : t("Render & Create All")}</Button>
    </>} />
    {error && <p className="mb-4 text-sm text-red-400" role="alert">{error}</p>}
    {creating && <p className="mb-4 text-sm text-muted" aria-live="polite">{t("Leaving this page cancels whatever has not been saved yet.")}</p>}
    {children}
  </div>;
}
