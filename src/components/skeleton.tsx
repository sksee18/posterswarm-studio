/**
 * Loading skeletons. Server components (no "use client") so a route's
 * loading.tsx can render them instantly during navigation, before any JS.
 *
 * `Skeleton` is the atom: a shimmering block. The rest compose it into the
 * shapes each route actually shows, so a tab reveals its structure the moment
 * it is opened instead of hanging blank.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

/** A honeycomb cluster of shimmering cells - the branded "loading" motif for
 *  empty centers (whole-page spinners, dialog bodies). */
export function HexSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`flex justify-center gap-1.5 ${className}`} aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="skeleton h-8 w-8 rounded-lg"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

/** The canvas shapes templates actually come in, so the masonry skeleton has
 *  the ragged columns the real grid has instead of a tidy fake one. */
const MASONRY_ASPECTS = [
  "aspect-[3/4]",
  "aspect-[9/16]",
  "aspect-[4/5]",
  "aspect-square",
];

/** A grid of card placeholders: image plate + a title line. Matches the
 *  templates / slideshows card grids. `masonry` mirrors the templates page,
 *  where cards keep their own aspect ratio and flow in CSS columns. */
export function CardGridSkeleton({
  count = 8,
  aspect = "aspect-[3/4]",
  masonry = false,
}: {
  count?: number;
  aspect?: string;
  masonry?: boolean;
}) {
  return (
    <div
      className={
        masonry
          ? "columns-2 gap-3 md:columns-3 lg:columns-4"
          : "grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
      }
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`rounded-lg border border-border p-2 ${
            masonry ? "mb-3 break-inside-avoid" : ""
          }`}
        >
          <Skeleton
            className={`mb-2 w-full ${
              masonry ? MASONRY_ASPECTS[i % MASONRY_ASPECTS.length] : aspect
            }`}
          />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** Stacked rows: the shape of a list/table view. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-9 w-9 shrink-0" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** A page title placeholder, so the header does not pop in after the body. */
export function HeaderSkeleton() {
  return <Skeleton className="mb-6 h-6 w-40" />;
}
