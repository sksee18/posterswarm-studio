import sharp from "sharp";
import { fetchRemoteMedia, safeRemoteUrl } from "./media";
import { saveFile } from "./storage";

/**
 * Turn "notion.com" (or "https://notion.com/product") into a square icon we can
 * draw on a slide.
 *
 * Every url here comes from the user, so every fetch goes through
 * safeRemoteUrl - the same guard readMedia uses. This is the SSRF boundary.
 *
 * No database import on purpose: @/db opens PGlite at import time, which would
 * make the parsing below untestable in a repo whose dev DB is single-process.
 * The caller (resolveAppIcon in slideshows/actions.ts) owns the `images` row
 * that caches the result.
 */

const SIZE = 512;
/** Enough for any real page head or icon; past this it isn't an icon. */
const MAX_BYTES = 3_000_000;
const TIMEOUT = 8_000;

/** Some CDNs and marketing sites 403 a bare fetch. Same trick as pinterest.ts. */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function get(url: URL): Promise<{ buf: Buffer; type: string } | null> {
  try {
    const res = await fetchRemoteMedia(url, {
      headers: { "user-agent": UA, accept: "*/*" },
      signal: AbortSignal.timeout(TIMEOUT),
      redirect: "follow",
    });
    if (!res.ok) return null;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return null;
    return { buf, type: res.headers.get("content-type") ?? "" };
  } catch {
    return null;
  }
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/**
 * sharp cannot decode .ico, and /favicon.ico is the fallback that saves every
 * site whose homepage 403s a bot (claude.ai does exactly this - measured).
 *
 * An .ico is a container: a 6-byte header, then one 16-byte directory entry per
 * image. Modern favicons store each entry as a whole PNG file, so the largest
 * entry can simply be sliced out and handed to sharp.
 *
 * ponytail: PNG-in-ICO only. The old BMP-in-ICO form needs a real decoder and a
 * site still shipping one has a 16px icon not worth putting on a slide anyway.
 */
function icoToPng(buf: Buffer): Buffer | null {
  if (buf.length < 22 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1)
    return null;
  const count = buf.readUInt16LE(4);
  let best: { off: number; len: number; size: number } | null = null;
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    if (e + 16 > buf.length) break;
    // 0 in the width byte means 256
    const size = buf[e] || 256;
    const len = buf.readUInt32LE(e + 8);
    const off = buf.readUInt32LE(e + 12);
    if (off + len > buf.length) continue;
    if (!buf.subarray(off, off + 4).equals(PNG_MAGIC)) continue;
    if (!best || size > best.size) best = { off, len, size };
  }
  return best ? buf.subarray(best.off, best.off + best.len) : null;
}

/** One attribute off one tag. Regex rather than a parser: we need four
 *  attributes out of a <head>, and adding an HTML parser to do it would be more
 *  dependency than feature. */
const attr = (tag: string, name: string) =>
  tag
    .match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))
    ?.slice(2)
    .find((v) => v !== undefined);

/** Largest declared dimension in a `sizes="180x180"`, or 0. */
const sizeOf = (tag: string) =>
  Math.max(
    0,
    ...(attr(tag, "sizes") ?? "")
      .split(/[\sx]+/)
      .map(Number)
      .filter(Number.isFinite),
  );

/**
 * Icon candidates in the order we want them: an apple-touch-icon is a real
 * square app tile and is what makes this look like an iOS icon at all, so it
 * wins even when a <link rel=icon> declares a bigger size. og:image is a last
 * resort because it is usually a wide banner.
 */
export function iconCandidates(html: string, origin: URL): string[] {
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  const byRel = (test: (rel: string) => boolean) =>
    links
      .filter((t) => test((attr(t, "rel") ?? "").toLowerCase()))
      .map((t) => ({ href: attr(t, "href"), size: sizeOf(t) }))
      .filter((c): c is { href: string; size: number } => !!c.href)
      .sort((a, b) => b.size - a.size)
      .map((c) => c.href);

  const og = html
    .match(/<meta\b[^>]*>/gi)
    ?.filter((t) =>
      ["og:image", "twitter:image"].includes(
        (attr(t, "property") ?? attr(t, "name") ?? "").toLowerCase(),
      ),
    )
    .map((t) => attr(t, "content"))
    .filter((v): v is string => !!v);

  return [
    ...byRel((r) => r.includes("apple-touch-icon")),
    ...byRel((r) => r.split(/\s+/).includes("icon")),
    ...(og ?? []),
    "/favicon.ico",
  ].flatMap((href) => {
    try {
      return [new URL(href, origin).toString()];
    } catch {
      return [];
    }
  });
}

/** "Lemon Squeezy" out of lemonsqueezy.com is not worth guessing at, so the
 *  page's own name wins and the domain label is only the fallback. */
export function siteName(html: string, host: string): string {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const key of ["og:site_name", "apple-mobile-web-app-title"]) {
    const hit = metas.find(
      (t) => (attr(t, "property") ?? attr(t, "name") ?? "").toLowerCase() === key,
    );
    const v = hit && attr(hit, "content")?.trim();
    if (v) return v;
  }
  const label = host.replace(/^www\./, "").split(".")[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** The user's input as a guarded https URL, path and all, or null if it isn't
 *  one. Never throws - callers that need the failure use toOrigin. */
export function fullUrl(input: string): URL | null {
  try {
    const raw = input.trim();
    const u = safeRemoteUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.includes(".") ? u : null;
  } catch {
    return null;
  }
}

/** "notion.com", "https://notion.com/x", "Notion " -> https://notion.com */
export function toOrigin(input: string): URL {
  const raw = input.trim();
  if (!raw) throw new Error("Enter a website or app name");
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const u = safeRemoteUrl(withScheme);
  if (!u.hostname.includes("."))
    throw new Error(`"${raw}" is not a website - try notion.com`);
  return new URL(u.origin);
}

export type AppIcon = {
  name: string;
  iconUrl: string;
  domain: string;
  /** the icon lives on someone else's CDN and we only kept the link */
  linked?: boolean;
  screenshotUrls?: string[];
};

/**
 * An App Store or Play Store listing, as a stable cache key.
 *
 * The hostname is NOT that key: every App Store link is apps.apple.com, so
 * caching by host would hand the first app's icon to every app after it.
 */
export function listingKey(u: URL): string | null {
  if (/(^|\.)apple\.com$/.test(u.hostname)) {
    const id = u.pathname.match(/\bid(\d{4,})/)?.[1] ?? u.searchParams.get("id");
    return id ? `apple:${id}` : null;
  }
  if (/(^|\.)play\.google\.com$/.test(u.hostname)) {
    const pkg = u.searchParams.get("id");
    return pkg ? `play:${pkg}` : null;
  }
  return null;
}

/** The cache key an input resolves to, so a caller can check its cache before
 *  paying for the fetch. */
export const domainOf = (input: string) => {
  const u = toOrigin(input);
  const full = fullUrl(input);
  return (
    (full && listingKey(full)) ?? u.hostname.replace(/^www\./, "")
  );
};

/**
 * Store artwork is already a square, high-resolution app icon sitting on a CDN
 * that is built to serve it. So we keep the URL and store nothing: no download,
 * no sharp pass, no bytes in our bucket. The `images` row still gets written by
 * the caller, which is what caches it and what allow-lists it for /api/img.
 */
async function storeListing(key: string, withScreenshots: boolean): Promise<AppIcon | null> {
  const [kind, id] = key.split(":");

  if (kind === "apple") {
    // the public lookup endpoint - no key, returns the artwork straight up
    const res = await get(
      safeRemoteUrl(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}`),
    );
    if (!res) return null;
    let data: {
      results?: { trackName?: string; artworkUrl512?: string; artworkUrl100?: string; screenshotUrls?: string[]; ipadScreenshotUrls?: string[] }[];
    };
    try {
      data = JSON.parse(res.buf.toString("utf8"));
    } catch {
      return null;
    }
    const hit = data.results?.[0];
    const art = hit?.artworkUrl512 ?? hit?.artworkUrl100;
    if (!hit?.trackName || !art) return null;
    const shots = withScreenshots
      ? (hit.screenshotUrls?.length ? hit.screenshotUrls : hit.ipadScreenshotUrls ?? []).slice(0, 3)
      : [];
    const screenshotUrls = (
      await Promise.all(shots.map(async (url, i) => {
        const image = await get(safeRemoteUrl(url));
        if (!image) return null;
        try {
          const jpg = await sharp(image.buf)
            .resize(900, 1200, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 88 })
            .toBuffer();
          return await saveFile(`${key.replace(/[^a-z0-9]/gi, "-")}-screenshot-${i + 1}.jpg`, jpg, "image/jpeg");
        } catch {
          return null;
        }
      }))
    ).filter((url): url is string => Boolean(url));
    return {
      // listings are titled "Notion - notes, docs, tasks"; the slide wants the
      // brand, which is the part before the first dash or colon
      name: hit.trackName.split(/:\s|\s[-\u2013\u2014|]\s/)[0].trim(),
      // mzstatic sizes in the path, so ask for 512 whichever field we landed on
      iconUrl: art.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/512x512bb.$1"),
      domain: key,
      linked: true,
      screenshotUrls,
    };
  }

  if (kind === "play") {
    const page = await get(
      safeRemoteUrl(
        `https://play.google.com/store/apps/details?id=${encodeURIComponent(id)}`,
      ),
    );
    if (!page) return null;
    // Not sliced, unlike the ordinary site path: Play emits ~930KB of inline
    // script BEFORE its <head> metas, so any sane-looking cap lands in front of
    // the only two tags we came for. The fetch is already capped at MAX_BYTES.
    const html = page.buf.toString("utf8");
    const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
    const og = metas.find(
      (m) => (attr(m, "property") ?? "").toLowerCase() === "og:image",
    );
    const art = og && attr(og, "content");
    if (!art) return null;
    const title = metas.find(
      (m) => (attr(m, "property") ?? "").toLowerCase() === "og:title",
    );
    return {
      name:
        (title && attr(title, "content")?.split(/:\s|\s[-\u2013\u2014|]\s/)[0].trim()) || id,
      // googleusercontent sizes with a =w..-h.. suffix - replaced when present,
      // appended when not, since og:image often ships without one
      iconUrl: /=[\w-]+$/.test(art)
        ? art.replace(/=[\w-]+$/, "=w512-h512")
        : `${art}=w512-h512`,
      domain: key,
      linked: true,
    };
  }

  return null;
}

export async function fetchAppIcon(
  input: string,
  fallbackName?: string,
  withScreenshots = false,
): Promise<AppIcon> {
  const origin = toOrigin(input);
  const domain = origin.hostname.replace(/^www\./, "");

  // An App Store / Play Store link is the best case: a real app icon, already
  // square and high-res, that we link instead of storing.
  const listing = fullUrl(input) && listingKey(fullUrl(input)!);
  if (listing) {
    const hit = await storeListing(listing, withScreenshots);
    if (hit) return fallbackName ? { ...hit, name: fallbackName } : hit;
    throw new Error("That store listing did not resolve - paste the app's website instead");
  }

  // ponytail: alpha is preserved rather than flattened onto a guessed tile
  // colour. A transparent logo floating on the slide photo is the reference
  // look, and IconBlock.radius rounds the ones that do have a background. The
  // 8% inset keeps a wide wordmark off the tile edge.
  const store = async (src: Buffer, fit: "contain" | "cover" = "contain") => {
    const pad = Math.round(SIZE * 0.08);
    const clear = { r: 0, g: 0, b: 0, alpha: 0 };
    const png = await sharp(src)
      .resize(SIZE - pad * 2, SIZE - pad * 2, { fit, background: clear })
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: clear })
      .png()
      .toBuffer();
    return saveFile(`${domain}-icon.png`, png, "image/png");
  };
  const tryStore = async (src: Buffer, fit: "contain" | "cover" = "contain") => {
    try {
      return await store(src, fit);
    } catch {
      return null;
    }
  };

  // Pasting a direct image url is the escape hatch for the sites that 403 every
  // bot (claude.ai, perplexity.ai - measured). Only tried when the input names
  // a file, so the common "notion.com" case still costs exactly one fetch.
  const deep = fullUrl(input);
  if (deep && deep.pathname.length > 1) {
    const direct = await get(deep);
    if (direct?.type.startsWith("image/")) {
      const src = icoToPng(direct.buf) ?? direct.buf;
      try {
        await sharp(src).metadata();
        return { name: fallbackName ?? domain, iconUrl: await store(src), domain };
      } catch {
        /* served as an image but isn't one; fall through to the head parse */
      }
    }
  }

  const page = await get(origin);
  const html = page?.buf.toString("utf8").slice(0, 200_000) ?? "";
  const name = fallbackName ?? siteName(html, domain);

  /** Right shape but too small, and right size but wrong shape. Either beats
   *  telling the user to go and find a logo themselves. */
  let smallFallback: Buffer | undefined;
  let wideFallback: Buffer | undefined;

  for (const href of iconCandidates(html, origin)) {
    let url: URL;
    try {
      url = safeRemoteUrl(href);
    } catch {
      continue; // an http:// or private-address icon href is not worth chasing
    }
    const hit = await get(url);
    if (!hit) continue;

    const src = icoToPng(hit.buf) ?? hit.buf;
    let w = 0;
    let h = 0;
    try {
      const meta = await sharp(src).metadata();
      w = meta.width ?? 0;
      h = meta.height ?? 0;
    } catch {
      continue; // a BMP-form .ico, or an HTML error page served as an image
    }
    if (!w || !h) continue;

    // Measured across the curated list: a site with no real icon serves its
    // og:image, which is a 1200x630 banner. Stretched into a square tile that
    // looks broken, so shape is a hard filter and the loop keeps looking.
    // Size is a soft one - a 32px favicon upscales badly but still reads, so it
    // is held as a fallback rather than rejected.
    if (Math.abs(w / h - 1) > 0.25) {
      wideFallback ??= src;
      continue;
    }
    if (Math.min(w, h) < 96) {
      smallFallback ??= src;
      continue;
    }
    const iconUrl = await tryStore(src);
    if (iconUrl) return { name, iconUrl, domain };
  }

  const rescue = smallFallback ?? wideFallback;
  if (rescue) {
    const iconUrl = await tryStore(rescue, smallFallback ? "contain" : "cover");
    if (iconUrl)
      return {
        name,
        // a banner has no square crop that is reliably the logo, but its centre is
        // the best guess and beats failing outright
        iconUrl,
        domain,
      };
  }

  throw new Error(`No icon found on ${domain} - upload one instead`);
}
