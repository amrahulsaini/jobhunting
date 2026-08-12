"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo, LogoMark } from "@/components/logo";
import { Icon } from "@/components/icon";
import type { IconName } from "@/lib/assets";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  soon?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "pipeline" },
  { href: "/profile", label: "Profile", icon: "resume-scan" },
  { href: "/hunts", label: "Hunts", icon: "globe-crawl" },
  { href: "/outreach", label: "Outreach", icon: "send", soon: true },
];

/**
 * Shell for signed-in pages.
 *
 * The sidebar is permanent from lg up and a slide-over below it, so navigation
 * never eats the content area on a laptop but is still reachable on a phone.
 * Marketing links deliberately do not appear here — once you are signed in, the
 * landing page sections are noise.
 */
export function AppShell({
  username,
  usageDisplay,
  children,
}: {
  username: string;
  usageDisplay?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth", { method: "DELETE" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.map(item => {
        const active = pathname === item.href;

        if (item.soon) {
          return (
            <span
              key={item.href}
              className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--muted)] opacity-60"
            >
              <Icon name={item.icon} className="h-5 w-5 shrink-0" />
              {item.label}
              <span className="ml-auto text-[10px] uppercase tracking-wide">soon</span>
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
              active
                ? "bg-[var(--accent)] font-medium text-[var(--accent-ink)]"
                : "text-[var(--muted)] hover:bg-[var(--subtle)] hover:text-[var(--foreground)]"
            }`}
          >
            <Icon name={item.icon} className="h-5 w-5 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="space-y-3 border-t border-[var(--line)] pt-4">
      {usageDisplay && (
        <Link
          href="/profile"
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5 transition-colors hover:bg-[var(--subtle)]"
        >
          <Icon name="hunter" className="h-5 w-5 shrink-0" />
          <span className="min-w-0">
            <span className="block text-[11px] uppercase tracking-wide text-[var(--muted)]">
              Hunter usage
            </span>
            <span className="block truncate text-sm font-semibold">{usageDisplay}</span>
          </span>
        </Link>
      )}

      <div className="flex items-center gap-2 px-1">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--line)] text-[11px] font-semibold uppercase">
          {username.slice(0, 2)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">@{username}</span>
        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          className="shrink-0 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--subtle)] disabled:opacity-60"
        >
          {loggingOut ? "…" : "Log out"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-1">
      {/* ------------------------------------------------ desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-[var(--line)] bg-[var(--background)] p-4 lg:flex">
        <Link href="/" className="mb-6 px-1 transition-opacity hover:opacity-70">
          <Logo className="h-9 w-auto" />
        </Link>
        {nav}
        {footer}
      </aside>

      {/* -------------------------------------------------- mobile drawer */}
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-[var(--line)] bg-[var(--background)] p-4 shadow-lg lg:hidden">
            <div className="mb-6 flex items-center justify-between px-1">
              <Link href="/" onClick={() => setOpen(false)}>
                <Logo className="h-8 w-auto" />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] text-lg leading-none"
              >
                ×
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </>
      )}

      {/* ---------------------------------------------------------- main */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        {/* Mobile-only bar; on desktop the sidebar already carries all of this. */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[var(--line)] bg-[var(--background)]/90 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--line)]"
          >
            <span className="relative block h-3 w-4">
              <span className="absolute left-0 top-0 block h-0.5 w-4 bg-current" />
              <span className="absolute left-0 top-1.5 block h-0.5 w-4 bg-current" />
              <span className="absolute left-0 top-3 block h-0.5 w-4 bg-current" />
            </span>
          </button>

          <Link href="/dashboard" className="flex items-center gap-2">
            <LogoMark className="h-7 w-7" />
          </Link>

          {usageDisplay && (
            <span className="ml-auto text-sm font-medium">{usageDisplay}</span>
          )}
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
