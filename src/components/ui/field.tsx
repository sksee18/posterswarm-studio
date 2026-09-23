import type { ReactNode } from "react";

/**
 * Label + control + optional one-line hint. The ONLY place helper text is
 * allowed: if an explanation does not fit in one short hint sentence, the
 * control needs redesigning, not more prose.
 */
export function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="micro mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
