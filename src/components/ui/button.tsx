"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { useT } from "@/lib/i18n-client";

/**
 * The one button. Four variants, one size, no config beyond that.
 *
 * - primary   orange fill, near-black label. ORANGE IS A SURFACE - never white
 *             text on it (2.6:1, fails). One primary per screen.
 * - secondary hairline glass, the workhorse.
 * - ghost     text-only, for tertiary actions and icon buttons.
 * - danger    two-click confirm built in ("Sure?" for 3s), because the
 *             embedded browser has no confirm(). Red text, never red fill.
 */
export function Button({
  variant = "secondary",
  className = "",
  onClick,
  children,
  confirmLabel,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  confirmLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  const t = useT();

  // one timer, cleared on unmount and on re-arm. An uncleared setTimeout kept
  // firing setArmed after the button had gone, and a second arm left the first
  // timer running so the disarm landed early.
  const disarm = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(disarm.current), []);

  const styles = {
    primary:
      "bg-accent font-medium text-accent-ink hover:brightness-110 active:brightness-95",
    secondary:
      "border border-border bg-white/[0.03] hover:border-border-strong hover:bg-white/[0.06]",
    ghost: "text-muted hover:bg-white/[0.04] hover:text-foreground",
    danger: "text-red-400 hover:bg-red-500/10",
  }[variant];

  return (
    <button
      type={type}
      onClick={
        variant === "danger" && onClick
          ? (e) => {
              clearTimeout(disarm.current);
              if (armed) {
                setArmed(false);
                onClick(e);
              } else {
                setArmed(true);
                disarm.current = setTimeout(() => setArmed(false), 3000);
              }
            }
          : onClick
      }
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-all disabled:pointer-events-none disabled:opacity-50 ${styles} ${className}`}
      {...rest}
    >
      <span aria-live="polite">{armed ? confirmLabel || t("Sure?") : children}</span>
    </button>
  );
}
