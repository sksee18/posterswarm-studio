"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n-client";
import { studioNav } from "./nav";

export function BottomNav() {
  const pathname = usePathname();
  const t = useT();
  return <nav aria-label={t("Primary navigation")} className="glass fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-white/10 px-1 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-2 md:hidden">
    {studioNav.map((item) => {
      const active = item.match.some((path) => pathname.startsWith(path));
      const Icon = item.icon;
      return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium ${active ? "text-foreground" : "text-muted"}`}>
        <Icon className={`h-4 w-4 ${active ? "text-accent" : ""}`} />{t(item.label)}
      </Link>;
    })}
  </nav>;
}
