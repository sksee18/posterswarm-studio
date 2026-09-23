import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="max-w-2xl">
      <Skeleton className="mb-6 h-6 w-48" />
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  );
}
