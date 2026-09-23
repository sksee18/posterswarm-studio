import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/** Callers pass fixed names ("frame-1.jpg", "poster.jpg", "video.mp4"), so a
 *  A timestamp alone is not a unique key - two saves in the same
 *  millisecond collided, and x-upsert:true meant the second silently replaced
 *  the first. */
const objectKey = (name: string) =>
  `${Date.now()}-${crypto.randomUUID()}-${name.replace(/[^\w.-]/g, "_")}`;

/** Save a file under the local public uploads directory. */
export async function saveFile(
  name: string,
  data: Buffer | ArrayBuffer,
  _contentType?: string,
): Promise<string> {
  void _contentType;
  const rel = `uploads/${objectKey(name)}`;
  const abs = path.join(process.cwd(), "public", rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, Buffer.from(data as ArrayBuffer));
  return `/${rel}`;
}
