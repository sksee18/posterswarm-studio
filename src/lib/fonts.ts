import fs from "node:fs/promises";
import path from "node:path";
import { timedFetch } from "./fetch";

export type FontWeight = 400 | 700 | 800;
export type FontEntry = {
  name: string;
  weight: FontWeight;
  data: Buffer;
  style: "normal";
};

// bundled offline defaults (starter templates keep working with no network)
const LOCAL: Record<string, Record<number, string>> = {
  Inter: {
    400: "@fontsource/inter/files/inter-latin-400-normal.woff",
    700: "@fontsource/inter/files/inter-latin-700-normal.woff",
    800: "@fontsource/inter/files/inter-latin-800-normal.woff",
  },
  "Playfair Display": {
    400: "@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff",
    700: "@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff",
    800: "@fontsource/playfair-display/files/playfair-display-latin-800-normal.woff",
  },
};

// ponytail: in-memory cache per process; fonts are ~50-300KB and re-fetching
// once per process is acceptable for this local app
const cache = new Map<string, Buffer | null>();

// Old-browser User-Agent so Google Fonts serves ttf/woff - satori can't read woff2
const LEGACY_UA =
  "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8) AppleWebKit/534.30 (KHTML, like Gecko) Version/5.0.5 Safari/534.30";

async function fetchGoogleFont(
  family: string,
  weight: number,
): Promise<Buffer | null> {
  const key = `${family}:${weight}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let buf: Buffer | null = null;
  try {
    const cssRes = await timedFetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`,
      { headers: { "User-Agent": LEGACY_UA } },
    );
    if (cssRes.ok) {
      const css = await cssRes.text();
      const m = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
      if (m) {
        const fontRes = await timedFetch(m[1]);
        if (fontRes.ok) buf = Buffer.from(await fontRes.arrayBuffer());
      }
    }
  } catch {
    // network failure → treated as not found
  }
  cache.set(key, buf);
  return buf;
}

// ── script fallback ───────────────────────────────────────────────────────
// The template fonts (Inter, Playfair, any Latin Google font) have no glyphs
// for CJK, Arabic, Thai, Devanagari, etc., so satori draws those as tofu boxes
// while the CSS preview falls back to the OS fonts and looks fine. satori's
// loadAdditionalAsset hands us each unrenderable run plus a language code; we
// answer with the matching Noto family, subsetted to just that run so a full
// ~10MB CJK face never ships.

// satori's own language code (zh/ja/ko/...) is the only reliable way to tell
// Chinese from Japanese, since they share Han characters - prefer it.
const NOTO_BY_CODE: Record<string, string> = {
  zh: "Noto Sans SC",
  "zh-CN": "Noto Sans SC",
  "zh-TW": "Noto Sans TC",
  "zh-HK": "Noto Sans HK",
  ja: "Noto Sans JP",
  ko: "Noto Sans KR",
  th: "Noto Sans Thai",
  // Noto Sans Arabic uses OpenType shaping satori's engine crashes on
  // (lookupType 5 / substFormat 3); Cairo shapes cleanly for Arabic-script.
  ar: "Cairo",
  fa: "Cairo",
  ur: "Cairo",
  he: "Noto Sans Hebrew",
  hi: "Noto Sans Devanagari",
  bn: "Noto Sans Bengali",
  ta: "Noto Sans Tamil",
  te: "Noto Sans Telugu",
  kn: "Noto Sans Kannada",
  ml: "Noto Sans Malayalam",
  devanagari: "Noto Sans Devanagari",
};

/** Pick a Noto family from the actual characters, for when satori's code is
 *  'unknown'. Han defaults to Simplified Chinese - the common case here. */
export function detectScriptFamily(segment: string): string {
  for (const ch of segment) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) continue; // plain ASCII tells us nothing
    if (c >= 0x3040 && c <= 0x30ff) return "Noto Sans JP"; // kana
    if (c >= 0xac00 && c <= 0xd7a3) return "Noto Sans KR"; // Hangul
    if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf))
      return "Noto Sans SC"; // Han
    if (c >= 0x0e00 && c <= 0x0e7f) return "Noto Sans Thai";
    if (c >= 0x0600 && c <= 0x06ff) return "Cairo"; // Arabic script (see note above)
    if (c >= 0x0590 && c <= 0x05ff) return "Noto Sans Hebrew";
    if (c >= 0x0900 && c <= 0x097f) return "Noto Sans Devanagari";
    // Cyrillic, Greek, Vietnamese and the rest are covered by plain Noto Sans
    return "Noto Sans";
  }
  return "Noto Sans";
}

/** The Noto family for a (satori languageCode, text) pair: code first so Han is
 *  read as the right language, else detected from the characters.
 *
 *  satori can't tell Chinese from Japanese (shared Han) so it hands an *ambiguous*
 *  pipe-delimited list, "ja-JP|zh-CN|zh-TW|zh-HK", with ja first - taking the head
 *  of that would pick a Japanese face for Chinese, and Noto Sans JP lacks the
 *  Simplified-only glyphs, so they rendered as tofu boxes. On any such multi-
 *  candidate code the characters themselves disambiguate (kana->JP, hangul->KR,
 *  else Han->SC), so trust detectScriptFamily over the locale string. */
export function fallbackFamily(code: string, segment: string): string {
  if (!code || code.includes("|")) return detectScriptFamily(segment);
  return (
    NOTO_BY_CODE[code] ??
    NOTO_BY_CODE[code.split("-")[0]] ??
    detectScriptFamily(segment)
  );
}

/** Fetch a Google font subsetted to exactly `text` (the `&text=` param). For
 *  CJK this turns a multi-MB face into a few KB. Returns ttf via the legacy UA. */
async function fetchGoogleFontSubset(
  family: string,
  weight: number,
  text: string,
): Promise<Buffer | null> {
  const key = `${family}:${weight}:${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let buf: Buffer | null = null;
  try {
    const cssRes = await timedFetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`,
      { headers: { "User-Agent": LEGACY_UA } },
    );
    if (cssRes.ok) {
      const css = await cssRes.text();
      const m = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
      if (m) {
        const fontRes = await timedFetch(m[1]);
        if (fontRes.ok) buf = Buffer.from(await fontRes.arrayBuffer());
      }
    }
  } catch {
    // network failure → no fallback; the run stays tofu (only offline)
  }
  cache.set(key, buf);
  return buf;
}

/** satori loadAdditionalAsset hook: given an unrenderable run, return a matching
 *  Noto font (regular + bold, subsetted) so any script renders. Emoji are
 *  stripped upstream, so an emoji/symbol code yields nothing. */
export async function loadFallbackFont(
  code: string,
  segment: string,
): Promise<FontEntry[]> {
  if (code === "emoji" || code === "math" || code === "symbol") return [];
  const family = fallbackFamily(code, segment);
  const [regular, bold] = await Promise.all([
    fetchGoogleFontSubset(family, 400, segment),
    fetchGoogleFontSubset(family, 700, segment),
  ]);
  const out: FontEntry[] = [];
  if (regular) out.push({ name: family, weight: 400, data: regular, style: "normal" });
  if (bold) out.push({ name: family, weight: 700, data: bold, style: "normal" });
  return out;
}

/** Resolve a font for satori: bundled files first, then Google Fonts,
 *  falling back to the family's regular weight if the exact one is missing. */
export async function getFontEntries(
  family: string,
  weight: FontWeight,
): Promise<FontEntry[]> {
  const localRel = LOCAL[family]?.[weight] ?? LOCAL[family]?.[400];
  if (localRel) {
    try {
      const data = await fs.readFile(
        path.join(process.cwd(), "node_modules", localRel),
      );
      return [{ name: family, weight, data, style: "normal" }];
    } catch {
      // The file is missing from the deployment bundle (see
      // outputFileTracingIncludes in next.config.ts). Falling through to Google
      // Fonts costs one fetch per cold start; throwing here killed the render,
      // and a whole slideshow failing over a bundling detail is the wrong trade.
    }
  }

  let data = await fetchGoogleFont(family, weight);
  if (!data && weight !== 400) data = await fetchGoogleFont(family, 400);
  if (!data)
    throw new Error(
      `Could not load font "${family}" - check the exact name on fonts.google.com`,
    );
  return [{ name: family, weight, data, style: "normal" }];
}
