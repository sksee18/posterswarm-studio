import assert from "node:assert/strict";
import { balancedRotation, campaignCount, validateCampaignConcepts } from "../src/lib/campaign";

assert.deepEqual(balancedRotation(["a", "b", "c"], 8), ["a", "b", "c", "a", "b", "c", "a", "b"]);
assert.deepEqual(balancedRotation(["a"], 3), ["a", "a", "a"]);
assert.equal(campaignCount(0), 1);
assert.equal(campaignCount(99), 20);
assert.equal(campaignCount("bad"), 20);
validateCampaignConcepts([{ title: "One", brief: "Specific evidence." }, { title: "Two", brief: "Different evidence." }], 2);
assert.throws(() => validateCampaignConcepts([{ title: "One", brief: "Same" }, { title: "One", brief: "Same" }], 2));
assert.throws(() => validateCampaignConcepts([{ title: "One", brief: "" }], 1));

console.log("campaign: ok");
