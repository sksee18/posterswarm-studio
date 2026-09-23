import { eq } from "drizzle-orm";
import JSZip from "jszip";
import { db, slideshows } from "@/db";
import { readMedia } from "@/lib/media";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [s] = await db
    .select()
    .from(slideshows)
    .where(eq(slideshows.id, id));
  if (!s) return new Response("Not found", { status: 404 });

  const zip = new JSZip();
  const frames = s.frames as string[];
  // fetched in parallel, then added in order: a 10-frame slideshow was 10 serial
  // round trips to storage before a byte reached the user. readMedia rather than
  // A raw read still needs validation because a frame URL can be
  // client-supplied, and this one would zip up whatever it pointed at.
  const datas = await Promise.all(frames.map((url) => readMedia(url)));
  datas.forEach((data, i) =>
    zip.file(`${String(i + 1).padStart(2, "0")}.png`, data),
  );
  if (s.caption) zip.file("caption.txt", s.caption);

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${s.title.replace(/[^\w-]/g, "_")}.zip"`,
    },
  });
}
