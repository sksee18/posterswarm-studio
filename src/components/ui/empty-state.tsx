import type { ReactNode } from "react";

/** Icon + one sentence + one action. Nothing else fits by design. */
export function EmptyState({
  icon,
  message,
  action,
  className = "",
}: {
  icon?: ReactNode;
  message: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-20 text-center ${className}`}
    >
      {icon && <div className="text-muted/50 [&>svg]:h-8 [&>svg]:w-8">{icon}</div>}
      <p className="max-w-sm text-sm text-muted">{message}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
