import { Wordmark } from "@/components/logo";
import { ToastProvider } from "@/components/toast";
import { Backdrop } from "@/components/backdrop";
import { Nav } from "./nav";
import { BottomNav } from "./bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>
    <div className="relative flex min-h-screen">
      <Backdrop dim />
      <aside className="fixed inset-y-0 z-40 hidden w-56 flex-col p-3 md:flex">
        <div className="glass-panel flex flex-1 flex-col rounded-2xl px-3 py-5">
          <div className="mb-7 px-3"><Wordmark /></div>
          <Nav />
        </div>
      </aside>
      <main className="relative z-10 mb-[calc(5rem+env(safe-area-inset-bottom))] min-w-0 flex-1 px-4 py-6 md:mb-0 md:ml-56 md:px-10 md:py-8">
        <div className="mb-6 md:hidden"><Wordmark /></div>
        {children}
      </main>
      <BottomNav />
    </div>
  </ToastProvider>;
}
