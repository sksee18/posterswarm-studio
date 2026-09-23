"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTemplate } from "./actions";
import { useT } from "@/lib/i18n-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewTemplateButton() {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();
  if (!naming) return <Button variant="primary" onClick={() => setNaming(true)}>{t("New template")}</Button>;
  return <div className="flex gap-2"><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t("Template name")} className="w-44" onKeyDown={(event) => { if (event.key === "Escape") setNaming(false); }} /><Button variant="primary" disabled={!name.trim() || pending} onClick={() => start(async () => router.push(`/templates/${await createTemplate(name.trim())}`))}>{t("Create")}</Button></div>;
}
