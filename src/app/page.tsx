export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="space-y-2">
        <p className="text-sm font-medium tracking-wide text-accent uppercase">
          Personal tool
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Munich Apartment Searcher
        </h1>
        <p className="text-muted leading-relaxed">
          Monitors Kleinanzeigen rental searches, filters out swap / Untermiete
          listings, and notifies you on Telegram. Dashboard comes next — scrape
          first.
        </p>
      </header>

      <section className="space-y-3 rounded-xl bg-card p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="text-lg font-medium">Phase 1 checklist</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground/90">
          <li>
            Run <code className="font-mono text-xs">supabase/schema.sql</code>{" "}
            in the Supabase SQL editor.
          </li>
          <li>
            Copy <code className="font-mono text-xs">.env.example</code> →{" "}
            <code className="font-mono text-xs">.env.local</code> and fill in
            Supabase + <code className="font-mono text-xs">CRON_SECRET</code>.
          </li>
          <li>
            Hit the scrape test route (see README) and confirm listing cards
            parse correctly.
          </li>
          <li>Add Telegram bot token + chat id when you are ready for alerts.</li>
        </ol>
      </section>

      <p className="text-sm text-muted">
        Exclude seed: tausch / swap / tauschwohnung / wohnungstausch /
        tauschobjekt / mietertausch / untermiete / zwischenmiete. Möbliert is
        allowed.
      </p>
    </main>
  );
}
