import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-6 h-6 w-48" />
      <div className="flex flex-col gap-6 lg:flex-row">
        <Skeleton className="aspect-[3/4] w-full max-w-sm rounded-lg" />
        <div className="flex-1 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
