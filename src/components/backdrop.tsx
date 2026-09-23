/**
 * The page backdrop: near-black, and one warm source low on the page.
 *
 * This used to be four stacked layers - a tiled honeycomb field, a blurred
 * honeycomb raster, a radial glow, and two drifting white orbs. Four textures
 * competing meant none of them read as anything, the honeycomb tile put a
 * visible pattern behind every dense table in the app, and the raster plate
 * cost 107KB to be blurred into a smudge. All of it is gone.
 *
 * What is left is the part that carried the idea: two radials, a wide diffuse
 * halo and a tighter core, which together read as one light source under the
 * floor rather than a gradient someone applied. The texture of the page is the
 * swarm now, not the wallpaper.
 *
 * `dim` is the app: same room, turned down, because dense UI has to stay
 * readable on top of it.
 *
 * ponytail: two divs and no asset. If a section ever needs its own light,
 * give it its own radial rather than adding a layer here.
 */
export function Backdrop({ dim = false }: { dim?: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden"
    >
      {/* the halo: wide, soft, --accent-hot. mix-blend-screen so it only ever
          adds light and never darkens the graphite underneath. */}
      <div
        className={`absolute inset-x-0 bottom-0 mix-blend-screen ${
          dim ? "h-[55vh] opacity-[0.12]" : "h-[75vh] opacity-30"
        }`}
        style={{
          background:
            "radial-gradient(ellipse 70% 100% at 50% 122%, var(--accent-hot), transparent 62%)",
        }}
      />
      {/* the core: narrower and fully saturated, so the centre of the glow is
          brand orange and only its edge goes pale */}
      <div
        className={`absolute inset-x-0 bottom-0 mix-blend-screen ${
          dim ? "h-[38vh] opacity-[0.10]" : "h-[50vh] opacity-25"
        }`}
        style={{
          background:
            "radial-gradient(ellipse 42% 100% at 50% 130%, var(--accent), transparent 58%)",
        }}
      />
    </div>
  );
}
