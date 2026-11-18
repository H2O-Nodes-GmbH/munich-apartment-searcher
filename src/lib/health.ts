export type HealthStatus = "ok" | "warn" | "error" | "skip";

export type HealthCheck = {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
  latencyMs: number | null;
};

export type HealthReport = {
  checkedAt: string;
  overall: HealthStatus;
  checks: HealthCheck[];
  queue: {
    queued: number;
    sending: number;
    failed: number;
    sent: number;
  } | null;
};

function worst(a: HealthStatus, b: HealthStatus): HealthStatus {
  const rank: Record<HealthStatus, number> = {
    ok: 0,
    skip: 1,
    warn: 2,
    error: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

async function timed<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; latencyMs: number }> {
  const start = Date.now();
  const value = await fn();
  return { value, latencyMs: Date.now() - start };
}

export async function runHealthChecks(): Promise<HealthReport> {
  const checks: HealthCheck[] = [];
  let queue: HealthReport["queue"] = null;

  // Supabase
  try {
    const { getServiceSupabase } = await import("@/lib/supabase/server");
    const supabase = getServiceSupabase();
    const { value, latencyMs } = await timed(async () => {
      const { error } = await supabase
        .from("search_configs")
        .select("id")
        .limit(1);
      if (error) throw new Error(error.message);
    });
    void value;
    checks.push({
      id: "supabase",
      label: "Supabase",
      status: "ok",
      detail: "Connected",
      latencyMs,
    });

    // CRM columns
    {
      const { value: crm, latencyMs: crmMs } = await timed(async () => {
        const { error } = await supabase
          .from("listings")
          .select("id, stage_changed_at, notes")
          .limit(1);
        return error;
      });
      checks.push(
        crm
          ? {
              id: "crm_schema",
              label: "CRM schema",
              status: "error",
              detail: `${crm.message} — run supabase/crm.sql`,
              latencyMs: crmMs,
            }
          : {
              id: "crm_schema",
              label: "CRM schema",
              status: "ok",
              detail: "Pipeline columns present",
              latencyMs: crmMs,
            },
      );
    }

    // Sender columns + queue depths
    {
      const { value: sender, latencyMs: senderMs } = await timed(async () => {
        const probe = await supabase
          .from("listings")
          .select("id", { count: "exact", head: true })
          .not("send_status", "is", null);
        if (probe.error) return { error: probe.error, queue: null as HealthReport["queue"] };

        async function countStatus(status: string) {
          const { count, error } = await supabase
            .from("listings")
            .select("id", { count: "exact", head: true })
            .eq("send_status", status);
          if (error) throw error;
          return count ?? 0;
        }

        try {
          const [queued, sending, failed, sent] = await Promise.all([
            countStatus("queued"),
            countStatus("sending"),
            countStatus("failed"),
            countStatus("sent"),
          ]);
          return {
            error: null,
            queue: { queued, sending, failed, sent },
          };
        } catch (error) {
          return {
            error: error as { message: string },
            queue: null as HealthReport["queue"],
          };
        }
      });
      if (sender.error) {
        checks.push({
          id: "sender_schema",
          label: "Sender schema",
          status: "error",
          detail: `${sender.error.message} — run supabase/sender.sql`,
          latencyMs: senderMs,
        });
      } else {
        queue = sender.queue;
        checks.push({
          id: "sender_schema",
          label: "Sender schema",
          status: queue && queue.failed > 0 ? "warn" : "ok",
          detail:
            queue && queue.failed > 0
              ? `${queue.failed} failed send(s) in queue`
              : "Send columns present",
          latencyMs: senderMs,
        });
      }
    }
  } catch (error) {
    checks.push({
      id: "supabase",
      label: "Supabase",
      status: "error",
      detail: error instanceof Error ? error.message : "Connection failed",
      latencyMs: null,
    });
  }

  // Telegram
  {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
    if (!token || !chatId) {
      checks.push({
        id: "telegram",
        label: "Telegram",
        status: "warn",
        detail: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing",
        latencyMs: null,
      });
    } else {
      try {
        const { value, latencyMs } = await timed(async () => {
          const res = await fetch(
            `https://api.telegram.org/bot${token}/getMe`,
            { cache: "no-store" },
          );
          const json = (await res.json()) as {
            ok?: boolean;
            description?: string;
            result?: { username?: string };
          };
          if (!res.ok || !json.ok) {
            throw new Error(json.description || `HTTP ${res.status}`);
          }
          return json.result?.username ?? "bot";
        });
        checks.push({
          id: "telegram",
          label: "Telegram",
          status: "ok",
          detail: `@${value} · chat configured`,
          latencyMs,
        });
      } catch (error) {
        checks.push({
          id: "telegram",
          label: "Telegram",
          status: "error",
          detail: error instanceof Error ? error.message : "getMe failed",
          latencyMs: null,
        });
      }
    }
  }

  // Browserbase
  {
    const key = process.env.BROWSERBASE_API_KEY?.trim();
    const contextId = process.env.BROWSERBASE_CONTEXT_ID?.trim();
    if (!key) {
      checks.push({
        id: "browserbase",
        label: "Browserbase",
        status: "warn",
        detail: "BROWSERBASE_API_KEY missing — auto-send disabled",
        latencyMs: null,
      });
    } else {
      try {
        const { value, latencyMs } = await timed(async () => {
          const res = await fetch("https://api.browserbase.com/v1/projects", {
            headers: { "X-BB-API-Key": key },
            cache: "no-store",
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const projects = (await res.json()) as Array<{ id: string; name?: string }>;
          return projects[0]?.name ?? `${projects.length} project(s)`;
        });
        checks.push({
          id: "browserbase",
          label: "Browserbase",
          status: contextId ? "ok" : "warn",
          detail: contextId
            ? `${value} · context set`
            : `${value} · BROWSERBASE_CONTEXT_ID missing`,
          latencyMs,
        });
      } catch (error) {
        checks.push({
          id: "browserbase",
          label: "Browserbase",
          status: "error",
          detail: error instanceof Error ? error.message : "API failed",
          latencyMs: null,
        });
      }
    }
  }

  // Inbound email token
  checks.push(
    process.env.INBOUND_EMAIL_TOKEN?.trim()
      ? {
          id: "inbound",
          label: "Postmark inbound",
          status: "ok",
          detail: "INBOUND_EMAIL_TOKEN configured",
          latencyMs: null,
        }
      : {
          id: "inbound",
          label: "Postmark inbound",
          status: "warn",
          detail: "INBOUND_EMAIL_TOKEN missing — reply detection disabled",
          latencyMs: null,
        },
  );

  // Cron secret
  checks.push(
    process.env.CRON_SECRET?.trim()
      ? {
          id: "cron",
          label: "Cron auth",
          status: "ok",
          detail: "CRON_SECRET set",
          latencyMs: null,
        }
      : {
          id: "cron",
          label: "Cron auth",
          status: "warn",
          detail: "CRON_SECRET missing",
          latencyMs: null,
        },
  );

  const overall = checks.reduce<HealthStatus>(
    (acc, c) => worst(acc, c.status),
    "ok",
  );

  return {
    checkedAt: new Date().toISOString(),
    overall,
    checks,
    queue,
  };
}
