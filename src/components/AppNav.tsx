import Link from "next/link";

export function AppNav({ active }: { active: "inbox" | "pipeline" }) {
  const linkClass = (isActive: boolean) =>
    isActive
      ? "rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white"
      : "rounded-md px-3 py-1.5 text-sm text-muted hover:text-foreground";

  return (
    <nav className="flex flex-wrap items-center gap-2">
      <Link href="/pipeline" className={linkClass(active === "pipeline")}>
        Pipeline
      </Link>
      <Link href="/" className={linkClass(active === "inbox")}>
        Inbox
      </Link>
    </nav>
  );
}
