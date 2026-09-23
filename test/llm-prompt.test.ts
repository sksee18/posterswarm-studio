import assert from "node:assert";
import { readFileSync } from "node:fs";

// Keep this source-level because importing llm.ts opens the app database through
// AI metering. The visual template name must never regain a path into the prompt.
const llm = readFileSync("src/lib/llm.ts", "utf8");
const actions = readFileSync("src/app/(app)/slideshows/actions.ts", "utf8");
const composer = readFileSync("src/app/(app)/slideshows/new/composer.tsx", "utf8");
assert.ok(!llm.includes("Template look:"));
assert.ok(!llm.includes("templateName?:"));
assert.ok(!actions.includes("templateName: tpl.name"));
assert.ok(llm.includes("compileTextTemplate(template)"), "Series instructions still build the writing brief");
assert.ok(llm.includes("every hook must use distinct wording and structure"));
assert.ok(actions.includes("avoid: input.avoid"), "Batch hook exclusions reach the model prompt");
assert.ok(composer.includes("avoid: generated.map"), "A campaign excludes hooks written earlier in its batch");

console.log("llm prompt: ok");
