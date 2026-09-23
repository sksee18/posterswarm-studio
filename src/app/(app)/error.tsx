"use client";

import { useEffect } from "react";
import { useT } from "@/lib/i18n-client";

/**
 * The app's error boundary. Without one, any throw during a Server Component
 * render - seedStarterTemplates failing on /templates, one dead channel taking
 * down a page - showed Next's bare "An error occurred in the Server
 * Components render" page with no way back except the browser's back button.
 *
 * The technical reference stays available without exposing internal messages.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <div className="mx-auto mb-4 h-10 w-10 rounded-xl bg-accent-dim" aria-hidden />
      <h1 className="text-lg font-semibold tracking-tight">
        {t("That page did not load")}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {t("Something broke on the server. Try again, or return to this page in a moment.")}
      </p>
      {error.digest && (
        <details className="mt-3 text-left text-xs text-muted">
          <summary className="cursor-pointer text-center hover:text-foreground">{t("Technical details")}</summary>
          <p className="mt-2 select-all rounded-md bg-white/[0.04] p-2 font-mono">{t("Reference")} {error.digest}</p>
        </details>
      )}
      <button
        onClick={reset}
        className="mt-6 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90"
      >
        {t("Try again")}
      </button>
    </div>
  );
}
