"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveMessageTemplate } from "@/app/actions";

export function MessageTemplateEditor({ initialBody }: { initialBody: string }) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setStatus(null);
        startTransition(async () => {
          try {
            await saveMessageTemplate(body);
            setStatus("Saved");
            router.refresh();
          } catch (err) {
            setStatus(err instanceof Error ? err.message : "Failed to save");
          }
        });
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={12}
        className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm leading-relaxed"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save template"}
        </button>
        {status ? <span className="text-sm text-muted">{status}</span> : null}
      </div>
    </form>
  );
}
