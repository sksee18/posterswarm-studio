import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

/**
 * Runs every test/*.test.ts in turn.
 *
 * A file rather than a shell one-liner in package.json: npm runs scripts through
 * cmd.exe on Windows and sh elsewhere, so neither a `for` loop nor a glob works
 * in both. The previous version was a hand-maintained `&&` chain of 14 paths,
 * which had already drifted (a missing space made `&&tsx`) and silently omitted
 * any new file nobody remembered to add.
 */
const files = readdirSync(new URL(".", import.meta.url))
  .filter((f) => f.endsWith(".test.ts"))
  .sort();

for (const f of files) {
  process.stdout.write(`\n== ${f}\n`);
  const { status } = spawnSync("tsx", [`test/${f}`], {
    stdio: "inherit",
    shell: true, // npm puts node_modules/.bin on PATH; shell finds tsx there
  });
  if (status !== 0) {
    process.stdout.write(`\nFAILED: ${f}\n`);
    process.exit(status ?? 1);
  }
}
process.stdout.write(`\nall ${files.length} suites passed\n`);
