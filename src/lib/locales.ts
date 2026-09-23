/** Locale list + the pure translate() both the server and client halves use.
 *  No next/headers import here on purpose so client components can pull it in. */

export const locales = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "pl",
  "ru",
  "uk",
  "tr",
  "ja",
  "ko",
  "th",
  "vi",
  "zh-Hans",
  "zh-Hant",
] as const;

export type Locale = (typeof locales)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";

/** Native names - a language picker that lists "German" to a German speaker is
 *  useless to the person who most needs it. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  pl: "Polski",
  ru: "Русский",
  uk: "Українська",
  tr: "Türkçe",
  ja: "日本語",
  ko: "한국어",
  th: "ไทย",
  vi: "Tiếng Việt",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
};

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (locales as readonly string[]).includes(v);
}

/** A dictionary value is either the finished string, or plural forms keyed by
 *  Intl.PluralRules categories (ru/pl/uk need one/few/many, not just one/other). */
export type Phrase = string | Partial<Record<Intl.LDMLPluralRule, string>>;
export type Dict = Record<string, Phrase>;

export type T = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Keys ARE the English source text, gettext style. A missing translation falls
 * back to the key, so an untranslated string renders as readable English rather
 * than "settings.brands.emptyLabel".
 */
export function translate(
  dict: Dict,
  locale: string,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const entry = dict[key];
  let s: string;

  if (entry === undefined) {
    s = key;
  } else if (typeof entry === "string") {
    s = entry;
  } else {
    const n = vars
      ? (Object.values(vars).find((v) => typeof v === "number") as
          | number
          | undefined)
      : undefined;
    const cat =
      n === undefined ? "other" : new Intl.PluralRules(locale).select(n);
    s = entry[cat] ?? entry.other ?? key;
  }

  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) =>
    k in vars ? String(vars[k]) : m,
  );
}

export function makeT(dict: Dict, locale: string): T {
  return (key, vars) => translate(dict, locale, key, vars);
}
