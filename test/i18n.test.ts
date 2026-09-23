import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { translate, locales, isLocale } from "../src/lib/locales";
import { matchAcceptLanguage } from "../src/lib/i18n";

// ---- translate() ----

// missing key falls back to the key itself, so untranslated UI reads as English
assert.equal(translate({}, "fr", "Save"), "Save");
assert.equal(translate({ Save: "Enregistrer" }, "fr", "Save"), "Enregistrer");

// interpolation
assert.equal(
  translate({}, "en", "Slide {n}", { n: 3 }),
  "Slide 3",
  "vars substitute",
);
assert.equal(
  translate({}, "en", "{a} and {b}", { a: "x", b: "y" }),
  "x and y",
);
// an unknown placeholder is left alone rather than blanked
assert.equal(translate({}, "en", "{a} {missing}", { a: "x" }), "x {missing}");
// no vars passed: braces survive untouched (the @handle · {n}/{total} case)
assert.equal(translate({}, "en", "@handle · {n}/{total}"), "@handle · {n}/{total}");

// ---- plurals ----

const enSlides = {
  "{count} slides": { one: "{count} slide", other: "{count} slides" },
};
assert.equal(translate(enSlides, "en", "{count} slides", { count: 1 }), "1 slide");
assert.equal(translate(enSlides, "en", "{count} slides", { count: 5 }), "5 slides");

// Russian needs three forms, not two - this is why Intl.PluralRules is used
// instead of a n===1 ternary.
const ruSlides = {
  "{count} slides": {
    one: "{count} слайд",
    few: "{count} слайда",
    many: "{count} слайдов",
  },
};
assert.equal(translate(ruSlides, "ru", "{count} slides", { count: 1 }), "1 слайд");
assert.equal(translate(ruSlides, "ru", "{count} slides", { count: 3 }), "3 слайда");
assert.equal(translate(ruSlides, "ru", "{count} slides", { count: 7 }), "7 слайдов");
assert.equal(
  translate(ruSlides, "ru", "{count} slides", { count: 21 }),
  "21 слайд",
  "ru: 21 takes the 'one' form",
);

// a plural entry missing the selected category degrades to `other`, never crashes
assert.equal(
  translate({ k: { other: "fallback" } }, "ru", "k", { count: 3 }),
  "fallback",
);
// plural entry with no numeric var at all -> `other`
assert.equal(translate({ k: { one: "a", other: "b" } }, "en", "k"), "b");

// ---- Accept-Language matching ----

assert.equal(matchAcceptLanguage(null), "en");
assert.equal(matchAcceptLanguage(""), "en");
assert.equal(matchAcceptLanguage("fr-FR,fr;q=0.9"), "fr");
assert.equal(matchAcceptLanguage("de"), "de");
assert.equal(matchAcceptLanguage("pt-BR"), "pt", "region subtag falls back to base");
// q-values are ranked, not taken in written order
assert.equal(
  matchAcceptLanguage("xx;q=0.9,ja;q=1.0"),
  "ja",
  "highest q wins over document order",
);
// Chinese is script-split, not region-split
assert.equal(matchAcceptLanguage("zh-CN"), "zh-Hans");
assert.equal(matchAcceptLanguage("zh"), "zh-Hans");
assert.equal(matchAcceptLanguage("zh-TW"), "zh-Hant");
assert.equal(matchAcceptLanguage("zh-HK"), "zh-Hant");
assert.equal(matchAcceptLanguage("zh-Hant"), "zh-Hant");
// unknown languages fall through to English rather than throwing
assert.equal(matchAcceptLanguage("xx-YY,zz"), "en");

// ---- dictionaries on disk ----

const dir = join(import.meta.dirname, "..", "src", "dictionaries");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

assert.equal(
  files.length,
  locales.length,
  `one dictionary per locale (have ${files.length}, want ${locales.length})`,
);

for (const f of files) {
  const code = f.replace(/\.json$/, "");
  assert.ok(isLocale(code), `${f} is not a supported locale`);

  const dict = JSON.parse(readFileSync(join(dir, f), "utf8"));

  for (const [key, value] of Object.entries(dict)) {
    // every value is a string or a plural object of strings
    if (typeof value === "string") continue;
    assert.equal(
      typeof value,
      "object",
      `${f}: "${key}" must be a string or plural object`,
    );
    const forms = Object.values(value as Record<string, unknown>);
    assert.ok(forms.length > 0, `${f}: "${key}" has no plural forms`);
    for (const form of forms)
      assert.equal(
        typeof form,
        "string",
        `${f}: "${key}" has a non-string plural form`,
      );
    assert.ok(
      "other" in (value as object),
      `${f}: "${key}" needs an "other" form as the fallback`,
    );
  }
}

console.log(`i18n: ok - ${files.length} dictionaries, plurals + matching verified`);
