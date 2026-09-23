import assert from "node:assert";
import { distributedCollections, ensureBatchConfigs, parseComposerAiCommand } from "../src/lib/composer-ai";

assert.deepStrictEqual(parseComposerAiCommand("write 5 carousels with 10 slides", 1, 7), {
  carousels: 5,
  slides: 10,
  captionOnly: false,
  addOneSlide: false,
});
assert.deepStrictEqual(parseComposerAiCommand("write the same caption slightly varied", 3, 8), {
  carousels: 3,
  slides: 8,
  captionOnly: true,
  addOneSlide: false,
});
assert.equal(parseComposerAiCommand("add 1 more slide for each carousel", 2, 7).addOneSlide, true);
assert.deepStrictEqual(parseComposerAiCommand("generate 99 carousels with 99 slides", 1, 2), {
  carousels: 25,
  slides: 35,
  captionOnly: false,
  addOneSlide: false,
});

let next = 0;
const configs = ensureBatchConfigs(2, [], { templateId: "t", collectionId: "c", cta: "" }, () => `id-${++next}`);
assert.equal(configs.length, 2);
assert.equal(configs[0].title, "");
assert.equal(configs[1].id, "id-2");
assert.notEqual(configs[0], configs[1]);
assert.strictEqual(ensureBatchConfigs(2, configs, { templateId: "x", collectionId: "y", cta: "z" })[0], configs[0]);

const assigned = distributedCollections(["a", "b", "c"], 10, () => 0.4);
assert.equal(assigned.length, 10);
assert.deepStrictEqual(
  ["a", "b", "c"].map((id) => assigned.filter((value) => value === id).length).sort(),
  [3, 3, 4],
);
assert.deepStrictEqual(distributedCollections([], 10), []);

console.log("composer-ai: ok");
