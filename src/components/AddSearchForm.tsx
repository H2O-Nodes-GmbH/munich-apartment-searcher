"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createSearchConfig } from "@/app/actions";

export function AddSearchForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [searchUrl, setSearchUrl] = useState("");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          try {
            await createSearchConfig({ name, searchUrl });
            setName("");
            setSearchUrl("");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save");
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Name</span>
          <input
            className="rounded-md border border-black/10 bg-white px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Munich 2Zi under 1600"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-muted">Kleinanzeigen search URL</span>
          <input
            className="rounded-md border border-black/10 bg-white px-3 py-2 font-mono text-xs"
            value={searchUrl}
            onChange={(e) => setSearchUrl(e.target.value)}
            placeholder="https://www.kleinanzeigen.de/s-wohnung-mieten/..."
            required
          />
        </label>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Add search"}
      </button>
    </form>
  );
}
