"use client";

import { createContext, useContext, useMemo } from "react";
import {
  DEFAULT_LOCALE,
  makeT,
  type Dict,
  type Locale,
  type T,
} from "./locales";

const Ctx = createContext<{ dict: Dict; locale: Locale }>({
  dict: {},
  locale: DEFAULT_LOCALE,
});

/** Mounted once in the root layout - the dictionary is already in the RSC
 *  payload, so client components read it from context instead of fetching. */
export function I18nProvider({
  dict,
  locale,
  children,
}: {
  dict: Dict;
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ dict, locale }), [dict, locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Client components: `const t = useT()`. */
export function useT(): T {
  const { dict, locale } = useContext(Ctx);
  return useMemo(() => makeT(dict, locale), [dict, locale]);
}

export function useLocale(): Locale {
  return useContext(Ctx).locale;
}
