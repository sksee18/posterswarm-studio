import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { readMedia } from "../src/lib/media";

/**
 * The guard on the one sink that turns a stored string into bytes.
 *
 * This is not hypothetical: `images.url` is written verbatim from the client by
 * savePins, and `slideshows.frames` can carry a client-supplied frameUrl, so a
 * row really can hold "/../.env.local". The ZIP route reads frame paths from
 * those rows, so malformed local paths must remain outside the repository.
 * Before this guard, path.join(cwd, "public", u) normalized straight out of
 * public/ and served a private configuration file as an image.
 */
const rejects = async (url: string, why: string) => {
  await assert.rejects(() => readMedia(url), why);
  console.log(`  rejected ${url}`);
};

(async () => {
  // --- traversal out of public/uploads
  await rejects("/../.env.local", "parent traversal");
  await rejects("/../../etc/passwd", "deep traversal");
  await rejects("/uploads/../../.env.local", "traversal that still starts with /uploads");
  await rejects("/etc/passwd", "absolute path outside uploads");
  await rejects("/public/uploads/x.png", "not actually under uploads");

  // --- SSRF
  await rejects("http://169.254.169.254/latest/meta-data/", "plain http metadata endpoint");
  await rejects("https://169.254.169.254/latest/meta-data/", "link-local over https");
  await rejects("https://127.0.0.1/admin", "loopback");
  await rejects("https://localhost/admin", "localhost");
  await rejects("https://10.0.0.5/internal", "private 10/8");
  await rejects("https://192.168.1.1/router", "private 192.168/16");
  await rejects("https://172.16.0.1/internal", "private 172.16/12");
  await rejects("http://example.com/a.jpg", "http is not allowed at all");

  // --- the legitimate local path still works
  const root = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(root, { recursive: true });
  const name = `selftest-${Date.now()}.bin`;
  await fs.writeFile(path.join(root, name), Buffer.from("hello"));
  try {
    const got = await readMedia(`/uploads/${name}`);
    assert.strictEqual(got.toString(), "hello", "a real upload still reads");
    console.log(`  allowed /uploads/${name}`);
  } finally {
    await fs.rm(path.join(root, name), { force: true });
  }

  console.log("media self-check passed");
})();
