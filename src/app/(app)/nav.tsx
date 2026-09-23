"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GalleryHorizontalEnd, Images, LayoutTemplate, Plus, Settings } from "lucide-react";
import { useT } from "@/lib/i18n-client";
import { HoverHighlight } from "@/components/hover-highlight";

export const studioNav = [
  { href: "/create", label: "Create", icon: Plus, match: ["/create"] },
  { href: "/images", label: "Images", icon: Images, match: ["/images"] },
  { href: "/templates", label: "Templates", icon: LayoutTemplate, match: ["/templates", "/text-templates"] },
  { href: "/slideshows", label: "Slideshows", icon: GalleryHorizontalEnd, match: ["/slideshows", "/saved-slides"] },
  { href: "/settings", label: "Settings", icon: Settings, match: ["/settings"] },
] as const;

export function Nav() {
  const pathname = usePathname();
  const t = useT();
  return <nav className="flex flex-1 flex-col text-sm">
    <HoverHighlight className="flex flex-1 flex-col gap-1" highlightClassName="rounded-lg bg-white/[0.045]">
      {studioNav.map((item) => {
        const active = item.match.some((path) => pathname.startsWith(path));
        const Icon = item.icon;
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors ${active ? "glass text-foreground" : "text-muted hover:text-foreground"}`}>
          <Icon className={`h-4 w-4 ${active ? "text-accent" : ""}`} />{t(item.label)}
        </Link>;
      })}
    </HoverHighlight>
  </nav>;
}
