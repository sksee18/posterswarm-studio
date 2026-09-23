import assert from "node:assert";
import { mergeImageLibrary } from "../src/lib/image-library";

const merged = mergeImageLibrary({
  collections: [{ id: "a", name: "A" }],
  images: [{ id: "1", url: "https://example.com/1.jpg", width: 100, height: 100, collectionIds: ["a"] }],
}, {
  collections: [{ id: "b", name: "B" }],
  images: [{ id: "1", url: "https://example.com/1.jpg", width: 100, height: 100, collectionIds: ["b"] }],
});

assert.deepEqual(merged.images[0].collectionIds.sort(), ["a", "b"]);
assert.deepEqual(merged.collections.map((row) => row.id).sort(), ["a", "b"]);
console.log("image library: ok");
