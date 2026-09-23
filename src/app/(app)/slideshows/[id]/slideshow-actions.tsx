"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteSlideshow, duplicateSlideshow } from "../actions";
import { saveSlidesFromSlideshow } from "../../saved-slides/actions";

export function SlideshowActions({ id, editable }: { id: string; editable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <div className="flex flex-wrap gap-2">
    <a href={`/api/slideshows/${id}/zip`} download><Button>Download ZIP</Button></a>
    {editable && <Link href={`/slideshows/${id}/edit`}><Button>Edit slides</Button></Link>}
    {editable && <Button disabled={pending} onClick={() => start(async () => { await saveSlidesFromSlideshow(id); })}>Save body slides</Button>}
    <Button disabled={pending} onClick={() => start(async () => router.push(`/slideshows/${await duplicateSlideshow(id)}`))}>Duplicate</Button>
    <Button variant="danger" disabled={pending} onClick={() => start(async () => { await deleteSlideshow(id); router.push("/slideshows"); })}>Delete</Button>
  </div>;
}
