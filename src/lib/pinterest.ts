import { timedFetch } from "./fetch";

export type PinResult = {
  id: string;
  url: string; // original image url
  thumb: string; // smaller preview
  width: number;
  height: number;
};

export type PinSearchPage = {
  results: PinResult[];
  /** opaque cursor for the next page; null when exhausted */
  bookmark: string | null;
};

type PinImage = { url: string; width: number; height: number };
type RawPin = {
  id?: string;
  images?: Record<string, PinImage>;
};

// ponytail: Pinterest's internal search endpoint - unofficial, may break or get
// IP-blocked (esp. from datacenter IPs). Fallback path: Pexels API, same shape.
export async function searchPinterest(
  query: string,
  bookmark?: string,
): Promise<PinSearchPage> {
  const data = JSON.stringify({
    options: {
      isPrefetch: false,
      query,
      scope: "pins",
      bookmarks: bookmark ? [bookmark] : [],
    },
    context: {},
  });
  const url =
    `https://www.pinterest.com/resource/BaseSearchResource/get/` +
    `?source_url=${encodeURIComponent(`/search/pins/?q=${query}`)}` +
    `&data=${encodeURIComponent(data)}&_=${Date.now()}`;

  const res = await timedFetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      Accept: "application/json",
      "X-Pinterest-PWS-Handler": "www/search/[scope].js",
    },
  });
  if (!res.ok) throw new Error(`Pinterest responded ${res.status}`);
  const json = await res.json();
  const raw: RawPin[] = json?.resource_response?.data?.results ?? [];
  const nextBookmark: string | undefined =
    json?.resource_response?.bookmark ??
    json?.resource?.options?.bookmarks?.[0];

  return {
    results: raw
      .filter((p) => p.images?.orig)
      .map((p) => ({
        id: String(p.id),
        url: p.images!.orig.url,
        thumb: (p.images!["236x"] ?? p.images!.orig).url,
        width: p.images!.orig.width,
        height: p.images!.orig.height,
      })),
    // Pinterest signals the end with the literal "-end-"
    bookmark: nextBookmark && nextBookmark !== "-end-" ? nextBookmark : null,
  };
}
