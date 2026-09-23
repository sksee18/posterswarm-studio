import type { ComponentProps } from "react";

const base =
  "w-full rounded-md border border-border bg-white/[0.03] px-3 py-1.5 text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-border-strong focus:bg-white/[0.05]";

// ComponentProps rather than InputHTMLAttributes so `ref` types through - React
// 19 passes it as an ordinary prop, and the item picker focuses its search box.
export function Input({ className = "", ...rest }: ComponentProps<"input">) {
  return <input className={`${base} ${className}`} {...rest} />;
}

export function Textarea({
  className = "",
  ...rest
}: ComponentProps<"textarea">) {
  return <textarea className={`${base} ${className}`} {...rest} />;
}
