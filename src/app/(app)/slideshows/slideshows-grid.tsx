"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteSlideshows, loadSlideshowCards, type SlideshowCard } from "./actions";
import type { PageCursor } from "@/lib/pagination";

/* eslint-disable @next/next/no-img-element */

export function SlideshowsGrid({ initial, tags, nextCursor: initialCursor, total }: { initial: SlideshowCard[]; tags: string[]; nextCursor: PageCursor | null; total: number }) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const filtered = items.filter((item) => (!query || `${item.title} ${item.caption}`.toLowerCase().includes(query.toLowerCase())) && (!tag || item.tags.includes(tag)));
  return <div>
    <div className="mb-5 flex flex-wrap gap-2"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search slideshows" className="max-w-xs" />{tags.length > 0 && <select className="input max-w-48" value={tag} onChange={(event) => setTag(event.target.value)}><option value="">All tags</option>{tags.map((value) => <option key={value}>{value}</option>)}</select>}{selected.length > 0 && <Button variant="danger" disabled={pending} onClick={() => start(async () => { await deleteSlideshows(selected); setItems((current) => current.filter((item) => !selected.includes(item.id))); setSelected([]); })}>Delete {selected.length}</Button>}<span className="ml-auto self-center text-xs text-muted">{total} total</span></div>
    {filtered.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filtered.map((item) => { const cover = item.frames[0]; const checked = selected.includes(item.id); return <article key={item.id} className={`panel relative rounded-xl p-2 ${checked ? "ring-2 ring-accent" : ""}`}><label className="absolute left-4 top-4 z-10 rounded bg-black/60 p-1"><input type="checkbox" checked={checked} onChange={() => setSelected((current) => checked ? current.filter((id) => id !== item.id) : [...current, item.id])} aria-label={`Select ${item.title}`} /></label><Link href={`/slideshows/${item.id}`}>{cover ? <img src={cover} alt="" className="aspect-[3/4] w-full rounded-lg object-cover" /> : <div className="aspect-[3/4] rounded-lg bg-surface-2" />}<p className="mt-2 truncate px-1 text-sm font-medium">{item.title}</p><p className="truncate px-1 pb-1 text-xs text-muted">{item.tags.join(" · ") || item.caption}</p></Link></article>; })}</div> : <p className="mt-16 text-center text-sm text-muted">No slideshows found.</p>}
    {cursor && <div className="mt-6 text-center"><Button disabled={pending} onClick={() => start(async () => { const page = await loadSlideshowCards({ cursor }); setItems((current) => [...current, ...page.items]); setCursor(page.nextCursor); })}>{pending ? "Loading..." : "Load more"}</Button></div>}
  </div>;
}
