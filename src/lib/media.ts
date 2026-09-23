import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import fs from "node:fs/promises";
import path from "node:path";

/** Everything saveFile() writes locally lands under public/uploads, so anything
 *  resolving outside it is a traversal attempt rather than a frame. */
const UPLOADS = path.resolve(process.cwd(), "public", "uploads");

/** Literal addresses that must never be fetched server-side. */
const BLOCKED_HOST =
  /^(localhost|127\.|0\.0\.0\.0|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;

const privateAddress = (address: string) => {
  if (isIP(address) === 4)
    return /^(0\.|10\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.0\.0\.|192\.0\.2\.|192\.168\.|198\.(1[89])\.|198\.51\.100\.|203\.0\.113\.|22[4-9]\.|23\d\.|24\d\.|25[0-5]\.)/.test(address);
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:") || normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:169.254.") || normalized.startsWith("::ffff:192.168.") || /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(normalized);
};

/**
 * The remote half of readMedia's guard, on its own because anything else that
 * fetches a url the user chose (lib/appicon.ts) needs exactly this check and
 * must not grow a second, drifting copy of it.
 *
 * Blocks literal private hosts and DNS answers for private networks. Node's
 * built-in fetch cannot pin the resolved address, so this remains a local-only
 * application boundary rather than a hardened multi-tenant SSRF control.
 */
export function safeRemoteUrl(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== "https:")
    throw new Error("Refusing to fetch a non-https media url");
  if (BLOCKED_HOST.test(u.hostname))
    throw new Error("Refusing to fetch a private address");
  return u;
}

async function safeFetch(url: URL, init: RequestInit, redirects = 0): Promise<Response> {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address)))
    throw new Error("Refusing to fetch a private address");

  const res = await fetch(url, { ...init, redirect: "manual" });
  if (![301, 302, 303, 307, 308].includes(res.status)) return res;
  const location = res.headers.get("location");
  if (!location || redirects >= 5) return res;
  return safeFetch(safeRemoteUrl(new URL(location, url).toString()), init, redirects + 1);
}

export async function fetchRemoteMedia(url: URL, init: RequestInit = {}): Promise<Response> {
  return safeFetch(url, init);
}

/**
 * Read a stored media url - a local /uploads path, or a remote storage/CDN url.
 *
 * Both branches are guarded, because the stored string is NOT always one we
 * produced. `images.url` is written straight from the client by savePins, and
 * `slideshows.frames` can carry a client-supplied `frameUrl`, so a row can hold
 * "/../.env.local" or "http://169.254.169.254/...". `path.join(cwd, "public", u)`
 * normalizes the first cleanly out of public/ and hands back private files,
 * and ZIP export reads stored frame paths - so the guard belongs here at
 * the sink, not only at each writer.
 */
export async function readMedia(url: string): Promise<Buffer> {
  if (url.startsWith("/")) {
    const abs = path.resolve(process.cwd(), "public", `.${url}`);
    if (abs !== UPLOADS && !abs.startsWith(UPLOADS + path.sep))
      throw new Error("Refusing to read outside public/uploads");
    return fs.readFile(abs);
  }

  const u = safeRemoteUrl(url);

  const res = await fetchRemoteMedia(u, { signal: AbortSignal.timeout(15_000) });
  // Without this a storage 404 body is served as image/jpeg with a 200 and
  // cached for a day - TikTok pulls it and posts the error page as a slide.
  if (!res.ok) throw new Error(`Media fetch failed: ${res.status} ${u.host}`);
  return Buffer.from(await res.arrayBuffer());
}
