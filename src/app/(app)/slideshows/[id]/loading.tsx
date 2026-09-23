import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-9 w-64" />
      </div>
      <div className="mb-6 flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-52 w-40 shrink-0 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-40 w-full max-w-xl rounded-lg" />
    </div>
  );
}
