// Per-browser preference for the Pinterest search resolution filter. It's a view
// filter, not shared data, so it lives in localStorage.
// ponytail: localStorage, not an account column - per-device is fine for a filter
// pref, and it dodges a schema migration. Move to the DB only if it needs to sync
// across devices.
export const HI_RES_KEY = "posterswarm:hiResMin";
export const HI_RES_DEFAULT = 1080;

export function readHiResMin(): number {
  if (typeof window === "undefined") return HI_RES_DEFAULT;
  const n = Number(localStorage.getItem(HI_RES_KEY));
  return Number.isFinite(n) && n > 0 ? n : HI_RES_DEFAULT;
}

export function writeHiResMin(px: number) {
  localStorage.setItem(HI_RES_KEY, String(Math.max(0, Math.round(px))));
}
