import { HeaderSkeleton, CardGridSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <CardGridSkeleton count={6} aspect="aspect-video" />
    </div>
  );
}
