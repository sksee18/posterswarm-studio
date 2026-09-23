"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { setPostCopy } from "../actions";

export function PostCopy({ id, title: initialTitle, caption: initialCaption }: { id: string; title: string; caption: string }) {
  const [title, setTitle] = useState(initialTitle);
  const [caption, setCaption] = useState(initialCaption);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return <div className="panel space-y-3 rounded-xl p-4"><p className="text-sm font-medium">Post copy</p><Input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Slideshow title" /><Textarea rows={5} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Caption" /><Button variant="primary" disabled={pending || !title.trim()} onClick={() => start(async () => { await setPostCopy(id, title, caption); setSaved(true); setTimeout(() => setSaved(false), 1500); })}>{saved ? "Saved" : "Save"}</Button></div>;
}
