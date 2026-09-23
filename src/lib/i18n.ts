import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  locales,
  makeT,
  type Dict,
  type Locale,
  type T,
} from "./locales";

// Static import map so the bundler can code-split these - a computed
// import(`../dictionaries/${l}.json`) would pull all 16 into every chunk.
const dictionaries: Record<Locale, () => Promise<{ default: Dict }>> = {
  en: () => import("@/dictionaries/en.json"),
  es: () => import("@/dictionaries/es.json"),
  fr: () => import("@/dictionaries/fr.json"),
  de: () => import("@/dictionaries/de.json"),
  it: () => import("@/dictionaries/it.json"),
  pt: () => import("@/dictionaries/pt.json"),
  pl: () => import("@/dictionaries/pl.json"),
  ru: () => import("@/dictionaries/ru.json"),
  uk: () => import("@/dictionaries/uk.json"),
  tr: () => import("@/dictionaries/tr.json"),
  ja: () => import("@/dictionaries/ja.json"),
  ko: () => import("@/dictionaries/ko.json"),
  th: () => import("@/dictionaries/th.json"),
  vi: () => import("@/dictionaries/vi.json"),
  "zh-Hans": () => import("@/dictionaries/zh-Hans.json"),
  "zh-Hant": () => import("@/dictionaries/zh-Hant.json"),
};

/** Cookie wins (an explicit choice in Settings), else the browser's
 *  Accept-Language, else English. */
export async function getLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return matchAcceptLanguage((await headers()).get("accept-language"));
}

/** ponytail: hand-rolled q-value sort instead of Negotiator +
 *  @formatjs/intl-localematcher, which is what the Next guide reaches for. Two
 *  deps to rank a header we only need to prefix-match. Swap them in if region
 *  subtags ever need real CLDR fallback (es-419 -> es, say). */
export function matchAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;

  const wanted = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag.trim(), q: q ? Number(q.split("=")[1]) || 0 : 1 };
    })
    .filter((x) => x.tag)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of wanted) {
    const lower = tag.toLowerCase();

    // Chinese is script-split, not region-split: zh-TW/zh-HK/zh-MO are
    // Traditional, everything else Simplified.
    if (lower === "zh" || lower.startsWith("zh-")) {
      return /hant|tw|hk|mo/.test(lower) ? "zh-Hant" : "zh-Hans";
    }

    const exact = locales.find((l) => l.toLowerCase() === lower);
    if (exact) return exact;

    const base = lower.split("-")[0];
    const prefix = locales.find((l) => l.toLowerCase() === base);
    if (prefix) return prefix;
  }

  return DEFAULT_LOCALE;
}

export async function getDict(locale: Locale): Promise<Dict> {
  return (await dictionaries[locale]()).default;
}

/** Server components: `const t = await getT()`. */
export async function getT(): Promise<T> {
  const locale = await getLocale();
  return makeT(await getDict(locale), locale);
}
