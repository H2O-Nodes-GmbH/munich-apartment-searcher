import { connection } from "next/server";
import { AppNav } from "@/components/AppNav";
import { SystemFlowchart } from "@/components/SystemFlowchart";
import { SystemHealthPanel } from "@/components/SystemHealthPanel";
import { runHealthChecks } from "@/lib/health";

export default async function SystemPage() {
  await connection();
  const initial = await runHealthChecks();

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:gap-10 sm:px-6 sm:py-10">
      <AppNav active="system" />

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          System
        </h1>
        <p className="max-w-2xl text-muted">
          How the apartment searcher fits together, plus live checks for the
          services that keep polling, messaging, and reply detection running.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Architecture</h2>
        <p className="text-sm text-muted">
          New listings are scraped on a schedule, queued for Browserbase to
          message from Max&apos;s Kleinanzeigen session, then reply emails come
          back through Gmail → Postmark → this app → Telegram.
        </p>
        <SystemFlowchart />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Liveness</h2>
        <p className="text-sm text-muted">
          Refreshes every 30 seconds. No secrets are shown — only reachability
          and configuration presence.
        </p>
        <SystemHealthPanel initial={initial} />
      </section>
    </main>
  );
}
