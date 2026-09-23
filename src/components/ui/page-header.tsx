import type { ReactNode } from "react";

/** Page title row: one h1, actions on the right, optional tab strip below. */
export function PageHeader({
  title,
  actions,
  tabs,
  className = "",
}: {
  title: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`mb-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {tabs && <div className="mt-5">{tabs}</div>}
    </header>
  );
}
