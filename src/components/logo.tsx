import { brand } from "@/lib/brand";

/**
 * The Posterswarm mark: five connected honeycomb cells.
 *
 * Traced from the source render rather than shipping it. The arrangement is
 * exactly regular - cells are flat-top / pointed left-right, column pitch is
 * 1.5s and row pitch is s√3 - so the whole mark is five polygons at known
 * offsets. That buys crispness at every size, `currentColor` theming, and no
 * network request, and it avoids the `mix-blend-mode: screen` dance a
 * black-background PNG would need to sit on a glass panel.
 *
 * Coordinates use s=20, origin shifted so the mark fills 0..100 x 0..103.92.
 * The viewBox is padded by half the stroke so nothing clips at the edge.
 *
 * Source stroke is 1.5 units (16px on a 218px cell). That is correct only
 * above ~200px; at nav size it disappears, so the default is heavier. Pass
 * `strokeWidth` down for large-format use.
 */
export function Logo({
  className = "h-6",
  strokeWidth = 7,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="-5 -5 110 113.92"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* left column */}
      <polygon points="10,34.64 30,34.64 40,51.96 30,69.28 10,69.28 0,51.96" />
      <polygon points="10,69.28 30,69.28 40,86.6 30,103.92 10,103.92 0,86.6" />
      {/* middle cell, half a row down */}
      <polygon points="40,51.96 60,51.96 70,69.28 60,86.6 40,86.6 30,69.28" />
      {/* right column */}
      <polygon points="70,0 90,0 100,17.32 90,34.64 70,34.64 60,17.32" />
      <polygon points="70,34.64 90,34.64 100,51.96 90,69.28 70,69.28 60,51.96" />
    </svg>
  );
}

/** Mark plus wordmark. The stem stays foreground, the suffix carries the hive. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-sm font-semibold tracking-tight ${className}`}
    >
      <Logo className="text-accent h-[1.15em] w-auto" />
      <span>
        {brand.nameStem}
        <span className="text-accent">{brand.nameSuffix}</span>
      </span>
    </span>
  );
}
