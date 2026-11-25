import Link from "next/link";

export function AppNav({
  active,
}: {
  active: "inbox" | "pipeline" | "system";
}) {
  const linkClass = (isActive: boolean) =>
    isActive
      ? "rounded-md border border-stone-900 bg-stone-900 px-3 py-1.5 text-sm font-medium text-white"
      : "rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-foreground hover:bg-stone-50";

  return (
    <nav className="flex flex-wrap items-center gap-2">
      <Link href="/pipeline" className={linkClass(active === "pipeline")}>
        Pipeline
      </Link>
      <Link href="/" className={linkClass(active === "inbox")}>
        Inbox
      </Link>
      <Link href="/system" className={linkClass(active === "system")}>
        System
      </Link>
    </nav>
  );
}
