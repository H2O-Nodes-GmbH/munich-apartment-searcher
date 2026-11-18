type NodeDef = {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  w?: number;
  tone?: "default" | "accent" | "muted";
};

const NODES: NodeDef[] = [
  { id: "ka-search", label: "Kleinanzeigen", sub: "search URLs", x: 40, y: 40 },
  { id: "poll", label: "Vercel cron", sub: "poll · every 20m", x: 280, y: 40, tone: "accent" },
  { id: "scraper", label: "Cheerio scraper", sub: "+ seller-age filter", x: 520, y: 40 },
  { id: "db", label: "Supabase", sub: "listings · events", x: 760, y: 40, tone: "accent" },

  { id: "queue", label: "Send queue", sub: "queued → sending", x: 520, y: 180 },
  { id: "send-cron", label: "Vercel cron", sub: "send · every 5m", x: 280, y: 180, tone: "accent" },
  { id: "bb", label: "Browserbase", sub: "Max’s session", x: 40, y: 180 },
  { id: "ka-msg", label: "Kleinanzeigen", sub: "Nachricht senden", x: 40, y: 320 },

  { id: "gmail", label: "Gmail filter", sub: "Antwort zur Anzeige", x: 280, y: 320 },
  { id: "postmark", label: "Postmark", sub: "inbound webhook", x: 520, y: 320, tone: "accent" },
  { id: "inbound", label: "App webhook", sub: "/api/inbound-email", x: 760, y: 320 },
  { id: "tg", label: "Telegram", sub: "reply alerts only", x: 760, y: 180, tone: "accent" },
];

const EDGES: Array<[string, string, string?]> = [
  ["ka-search", "poll"],
  ["poll", "scraper"],
  ["scraper", "db", "new listings"],
  ["db", "queue", "auto-queue"],
  ["queue", "send-cron"],
  ["send-cron", "bb"],
  ["bb", "ka-msg", "send message"],
  ["ka-msg", "gmail", "landlord replies"],
  ["gmail", "postmark"],
  ["postmark", "inbound"],
  ["inbound", "db", "→ replied"],
  ["inbound", "tg", "notify"],
];

function nodeBox(id: string): { x: number; y: number; w: number; h: number } {
  const n = NODES.find((node) => node.id === id)!;
  return { x: n.x, y: n.y, w: n.w ?? 200, h: 64 };
}

function center(box: { x: number; y: number; w: number; h: number }) {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

export function SystemFlowchart() {
  const width = 1000;
  const height = 420;

  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-stone-200 bg-card p-3 sm:p-4 [-webkit-overflow-scrolling:touch]">
      <p className="mb-2 text-xs text-muted sm:hidden">Swipe sideways to see the full flow →</p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-[920px] max-w-none sm:w-full sm:min-w-[720px]"
        role="img"
        aria-label="System architecture flowchart"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#a8a29e" />
          </marker>
        </defs>

        {EDGES.map(([from, to, label]) => {
          const a = center(nodeBox(from));
          const b = center(nodeBox(to));
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          return (
            <g key={`${from}-${to}`}>
              <path
                d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
                stroke="#a8a29e"
                strokeWidth="1.5"
                fill="none"
                markerEnd="url(#arrow)"
              />
              {label ? (
                <text
                  x={midX}
                  y={midY - 6}
                  textAnchor="middle"
                  className="fill-stone-500"
                  fontSize="10"
                >
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}

        {NODES.map((node) => {
          const w = node.w ?? 200;
          const fill =
            node.tone === "accent"
              ? "#0f766e"
              : node.tone === "muted"
                ? "#e7e5e4"
                : "#fffcf7";
          const stroke = node.tone === "accent" ? "#0f766e" : "#d6d3d1";
          const titleFill = node.tone === "accent" ? "#fffcf7" : "#1c1917";
          const subFill = node.tone === "accent" ? "#ccfbf1" : "#78716c";
          return (
            <g key={node.id}>
              <rect
                x={node.x}
                y={node.y}
                width={w}
                height={64}
                rx={12}
                fill={fill}
                stroke={stroke}
                strokeWidth={1.5}
              />
              <text
                x={node.x + w / 2}
                y={node.y + 28}
                textAnchor="middle"
                fill={titleFill}
                fontSize="13"
                fontWeight={600}
              >
                {node.label}
              </text>
              {node.sub ? (
                <text
                  x={node.x + w / 2}
                  y={node.y + 46}
                  textAnchor="middle"
                  fill={subFill}
                  fontSize="11"
                >
                  {node.sub}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
