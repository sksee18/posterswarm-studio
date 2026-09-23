import assert from "node:assert";
import { detectScriptFamily, fallbackFamily } from "../src/lib/fonts";

// The render used to draw non-Latin scripts as tofu because it only loaded the
// template's Latin font. The fallback picks a Noto family per script; this is
// the pure part, so it is the bit under test (the fetch is network, not here).

// satori's language code wins for Han (Chinese vs Japanese share characters)
assert.equal(fallbackFamily("zh", "你好世界"), "Noto Sans SC");
assert.equal(fallbackFamily("ja", "日本"), "Noto Sans JP");
assert.equal(fallbackFamily("ko", "한국어"), "Noto Sans KR");

// satori actually hands an AMBIGUOUS pipe-list for Han (it can't tell zh from
// ja), ja first - splitting the head off that wrongly picked Noto Sans JP, whose
// missing Simplified glyphs rendered as tofu boxes. The characters disambiguate.
const HAN = "ja-JP|zh-CN|zh-TW|zh-HK";
assert.equal(fallbackFamily(HAN, "你好世界这是一个测试"), "Noto Sans SC"); // Chinese, not JP
assert.equal(fallbackFamily(HAN, "こんにちは世界"), "Noto Sans JP"); // kana → Japanese
assert.equal(fallbackFamily(HAN, "안녕하세요"), "Noto Sans KR"); // Hangul → Korean

// when the code is 'unknown', detect from the characters themselves
assert.equal(fallbackFamily("unknown", "你好"), "Noto Sans SC"); // Han → Chinese
assert.equal(detectScriptFamily("こんにちは"), "Noto Sans JP"); // kana
assert.equal(detectScriptFamily("안녕하세요"), "Noto Sans KR"); // Hangul
assert.equal(detectScriptFamily("مرحبا"), "Cairo"); // Noto's Arabic crashes satori
assert.equal(fallbackFamily("ar", "مرحبا"), "Cairo");
assert.equal(detectScriptFamily("สวัสดี"), "Noto Sans Thai");
assert.equal(detectScriptFamily("नमस्ते"), "Noto Sans Devanagari");

// Latin/Cyrillic/Greek all ride the general Noto Sans
assert.equal(detectScriptFamily("Привет"), "Noto Sans");
assert.equal(detectScriptFamily("hello"), "Noto Sans");

console.log("fonts.test.ts ok");
