"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useLocale } from "@/lib/i18n-client";
import { LOCALE_COOKIE, localeNames, locales } from "@/lib/locales";
import { Select } from "@/components/select";

/** ponytail: writes the cookie from the client and calls router.refresh() -
 *  no server action, no route handler. The cookie is a display preference, not
 *  an authorisation decision, so it does not need to be httpOnly. */
export function LanguagePicker({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Select
      value={locale}
      disabled={pending}
      aria-label="Language"
      onChange={(v) => {
        document.cookie = `${LOCALE_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
        start(() => router.refresh());
      }}
      options={locales.map((l) => ({ value: l, label: localeNames[l] }))}
      className={`py-1.5 text-sm ${className}`}
    />
  );
}
