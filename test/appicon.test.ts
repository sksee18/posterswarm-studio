import assert from "node:assert";
import { iconCandidates, listingKey, siteName, toOrigin } from "../src/lib/appicon";
import { APPS, searchApps } from "../src/lib/apps";

/**
 * Pasting a url is the fast path into an item format, so the head parsing has to
 * be right on the shapes real sites actually ship: relative hrefs, single
 * quotes, multi-valued rel, sizes to rank by, and a `<link rel=icon>` that
 * declares a bigger size than the apple-touch-icon but is still the worse pick.
 *
 * appicon.ts deliberately has no @/db import, which is what lets this run at all
 * - importing it would open the single-process PGlite dev DB.
 */

const origin = new URL("https://notion.com");

const html = `
<html><head>
  <meta property="og:site_name" content="Notion">
  <meta property="og:image" content="https://cdn.notion.com/banner.png">
  <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png">
  <link rel='apple-touch-icon' sizes='180x180' href='/apple-180.png'>
  <link rel="apple-touch-icon" sizes="120x120" href="/apple-120.png">
  <link rel="shortcut icon" href="//cdn.notion.com/fav.ico">
</head></html>`;

assert.deepStrictEqual(
  iconCandidates(html, origin),
  [
    "https://notion.com/apple-180.png",
    "https://notion.com/apple-120.png",
    "https://notion.com/icon-512.png",
    "https://cdn.notion.com/fav.ico",
    "https://cdn.notion.com/banner.png",
    "https://notion.com/favicon.ico",
  ],
  "apple-touch-icons first and largest-first, then icons, then og:image, then the well-known path",
);

assert.strictEqual(siteName(html, "notion.com"), "Notion", "the page names itself");
assert.strictEqual(
  siteName("<html><head></head></html>", "lemonsqueezy.com"),
  "Lemonsqueezy",
  "with nothing to go on the domain label is capitalised",
);
assert.strictEqual(siteName("", "www.figma.com"), "Figma", "www. is not the name");
assert.strictEqual(
  listingKey(new URL("https://apps.apple.com/us/app/notion/id123456789")),
  "apple:123456789",
  "an App Store link has its own stable cache key",
);

// The picker is a catalog, not a short hand-picked handful of brands.
assert(APPS.length >= 250, "the searchable catalog stays broad");
assert.strictEqual(searchApps("com").length, 16, "search shows more than a single row of matches");
assert.deepStrictEqual(
  searchApps("custom", 16, [{ name: "Custom app", domain: "custom.example" }]),
  [{ name: "Custom app", domain: "custom.example" }],
  "a saved app can be searched through the same catalog function",
);

// ---- input normalising -----------------------------------------------------

assert.strictEqual(toOrigin("notion.com").toString(), "https://notion.com/");
assert.strictEqual(
  toOrigin("  https://notion.com/product/ai?x=1 ").toString(),
  "https://notion.com/",
  "a deep link collapses to the origin - that is where the head lives",
);
assert.throws(() => toOrigin("Notion"), /not a website/, "a bare name is not a domain");
assert.throws(() => toOrigin(""), /Enter a website/);

// ---- the SSRF boundary holds ----------------------------------------------

for (const bad of [
  "http://notion.com",
  "localhost:3000",
  "127.0.0.1",
  "169.254.169.254",
  "192.168.1.1",
  "10.0.0.1",
]) {
  assert.throws(
    () => toOrigin(bad),
    /non-https|private address|not a website/,
    `${bad} must never be fetched server-side`,
  );
}

console.log("appicon: ok");
