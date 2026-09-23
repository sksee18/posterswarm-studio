"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

/**
 * App-wide toasts, the rollback half of optimistic UI: an action applies
 * instantly, and if the server rejects it the state reverts and a toast says
 * what happened. Mounted once in the app layout; any client calls `useToast()`.
 */

type Toast = { id: number; text: string; kind: "error" | "success" };

const ToastCtx = createContext<(text: string, kind?: Toast["kind"]) => void>(
  () => {},
);

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((text: string, kind: Toast["kind"] = "error") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      kind === "error" ? 5000 : 3000,
    );
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`toast-enter pointer-events-auto max-w-md rounded-lg border px-4 py-2.5 text-sm shadow-lg backdrop-blur ${
                t.kind === "error"
                  ? "border-red-400/40 bg-red-950/80 text-red-100"
                  : "border-accent/40 bg-surface/90 text-foreground"
              }`}
              role={t.kind === "error" ? "alert" : "status"}
            >
              {t.text}
            </div>
          ))}
      </div>
    </ToastCtx.Provider>
  );
}
