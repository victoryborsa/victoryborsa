"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/validate.ts";

const MAX_SIDE = 2400;
const MAX_BYTES = 20 * 1024 * 1024;

/** Shrinks a photo in the browser so big phone pictures upload fast. Returns the original if the browser can't read it (e.g. HEIC). */
async function shrink(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 3 * 1024 * 1024) { bmp.close(); return file; }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", 0.88));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

/** Uploads photos one at a time, so any number of photos can be chosen at once. */
export function PhotoUploader({ id, action }: { id: string; action: (prev: ActionState, fd: FormData) => Promise<ActionState> }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{ ok?: string; error?: string } | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const files = Array.from(input.current?.files || []);
    if (!files.length) { setResult({ error: "Choose one or more photos to upload." }); return; }
    setBusy(true); setResult(null);
    let added = 0;
    const errors: string[] = [];
    for (const [i, f] of files.entries()) {
      setProgress(`Uploading photo ${i + 1} of ${files.length}…`);
      const small = await shrink(f);
      if (small.size > MAX_BYTES) { errors.push(`${f.name} is larger than 20 MB.`); continue; }
      const fd = new FormData();
      fd.set("id", id);
      fd.append("photos", small);
      try {
        const r = await action(null, fd);
        if (r?.error) errors.push(r.error.replace(/^0 photos added\. /, ""));
        else added++;
      } catch {
        errors.push(`${f.name} couldn't be uploaded. Check your connection and try again.`);
      }
    }
    setBusy(false); setProgress("");
    if (input.current) input.current.value = "";
    const done = `${added} photo${added === 1 ? "" : "s"} added.`;
    setResult(errors.length ? { error: `${done} ${errors.join(" ")}` } : { ok: done });
    router.refresh();
  }

  return (
    <form className="box stack" onSubmit={upload} noValidate>
      <h3>Upload photos</h3>
      <input ref={input} className="input" type="file" name="photos" accept="image/*" multiple disabled={busy} />
      <p className="hint">Choose as many photos as you like. They're made smaller on your device and uploaded one by one, so big phone photos are fine. Location data is removed. The first photo is the cover.</p>
      <div><button className="btn btn-primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? progress || "Uploading…" : "Upload"}</button></div>
      {result?.error && <div className="notice error" role="alert">{result.error}</div>}
      {result?.ok && <div className="notice ok" role="status">{result.ok}</div>}
    </form>
  );
}
