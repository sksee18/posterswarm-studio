"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTextTemplate } from "./actions";
import { useT } from "@/lib/i18n-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewTextTemplateButton() {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  if (!naming)
    return (
      <Button variant="primary" onClick={() => setNaming(true)}>
        {t("New series template")}
      </Button>
    );

  return (
    <div className="flex gap-2">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("e.g. feature stories, weekly diary")}
        className="w-52"
        onKeyDown={(e) => {
          if (e.key === "Escape") setNaming(false);
        }}
      />
      <Button
        variant="primary"
        disabled={!name.trim() || pending}
        onClick={() =>
          start(async () => {
            const id = await createTextTemplate(name.trim());
            router.push(`/text-templates/${id}`);
          })
        }
      >
        {t("Create")}
      </Button>
    </div>
  );
}
