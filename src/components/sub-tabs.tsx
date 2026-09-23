"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n-client";

/**
 * Segmented control for routes that live under one nav entry.
 * Templates keeps two separate tables/editors (design vs writing) - this
 * collapses them into a single tab without merging the data models.
 */
export function SubTabs({
  tabs,
  className = "mb-6",
}: {
  tabs: { href: string; label: string }[];
  className?: string;
}) {
  const pathname = usePathname();
  const t = useT();
  return (
    <div className={`glass inline-flex rounded-full p-1 ${className}`}>
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm transition-all ${
              active
                ? "bg-foreground font-medium text-background"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t(tab.label)}
          </Link>
        );
      })}
    </div>
  );
}

export const TEMPLATE_TABS = [
  { href: "/templates", label: "Design" },
  { href: "/text-templates", label: "Series" },
];

// Two separate routes rather than /slideshows/saved: the active check is a
// startsWith, so a nested path would light both tabs at once.
export const SLIDESHOW_TABS = [
  { href: "/slideshows", label: "Slideshows" },
  { href: "/saved-slides", label: "Saved slides" },
];
