import assert from "node:assert";

/**
 * The AES-256-GCM wrapper that protects the locally stored AI key.
 *
 * Untested until now, despite two behaviours the app depends on by name:
 *  - a round trip must be exact, or a connected channel silently stops posting
 *  - malformed or modified ciphertext must throw rather than return garbage.
 */
import { encrypt, decrypt } from "../src/lib/crypto";

// --- round trip
for (const plain of [
  "act.abc123",
  "",
  "unicode: żółw 🐢 日本語",
  "x".repeat(5000),
]) {
  assert.strictEqual(decrypt(encrypt(plain)), plain, `round trip: ${plain.slice(0, 20)}`);
}
console.log("round trip ok");

// --- the ciphertext is not the plaintext, and is salted per call
const a = encrypt("act.abc123");
const b = encrypt("act.abc123");
assert.ok(!a.includes("act.abc123"), "ciphertext must not contain the plaintext");
assert.notStrictEqual(a, b, "random IV per call, so two encryptions differ");
assert.strictEqual(decrypt(a), decrypt(b), "...but both decrypt to the same thing");
console.log("iv + opacity ok");

// --- tampering is detected (this is what the GCM auth tag is for)
const [iv, tag, data] = a.split(".");
assert.throws(() => decrypt(`${iv}.${tag}.${data.slice(0, -2)}AA`), "flipped ciphertext");
assert.throws(() => decrypt(`${iv}.${"A".repeat(tag.length)}.${data}`), "forged auth tag");
assert.throws(() => decrypt("not-even-close"), "malformed token");
console.log("tamper detection ok");

console.log("crypto self-check passed");
