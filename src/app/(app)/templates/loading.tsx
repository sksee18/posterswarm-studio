import { HeaderSkeleton, CardGridSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <CardGridSkeleton count={12} masonry />
    </div>
  );
}
