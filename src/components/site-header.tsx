"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { Icon } from "@/components/icon";

const NAV = [
  { id: "sources", label: "Sources" },
  { id: "how-it-works", label: "How it works" },
  { id: "features", label: "Features" },
  { id: "pipeline", label: "Pipeline" },
];

export function SiteHeader({ username }: { username?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const onLanding = pathname === "/";

  /**
   * Hides the bar on the way down and brings it back on the way up, so the
   * header is out of the way while reading but never more than a flick away.
   *
   * The scroll position is read from a ref inside the listener rather than from
   * state — storing it in state would re-render on every scroll frame.
   */
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;

      // Ignore sub-pixel jitter and the elastic bounce at the very top.
      if (Math.abs(delta) < 6) return;
      // Never hide it while the mobile menu is open — that would strip the
      // close button off the screen mid-interaction.
      if (!open) setHidden(delta > 0 && y > 90);

      lastY.current = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  /**
   * On the landing page these must be bare `#id` hashes. `/#id` is treated by
   * the App Router as a navigation to the route you are already on, which
   * re-renders without ever scrolling — so the links appear to do nothing.
   * From any other page the full `/#id` is required to get back to / first.
   */
  const hrefFor = (id: string) => (onLanding ? `#${id}` : `/#${id}`);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth", { method: "DELETE" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
      setOpen(false);
    }
  }

  return (
    <>
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b border-[var(--line)] bg-[var(--background)]/85 backdrop-blur transition-transform duration-300 ${
        hidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      {/* Three columns with equal-width outer tracks, so the nav sits in the
          true centre of the header rather than wherever the logo happens to
          leave room. */}
      <div className="mx-auto grid h-16 w-full max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-5 sm:px-6 md:h-20 md:gap-6 lg:grid-cols-[1fr_auto_1fr]">
        <Link
          href="/"
          className="shrink-0 justify-self-start transition-opacity hover:opacity-70"
          aria-label="JobHunting home"
        >
          <Logo className="h-7 w-auto sm:h-8 md:h-12 lg:h-14" />
        </Link>

        <nav className="hidden items-center gap-1 justify-self-center lg:flex">
          {(username ? [] : NAV).map(item => (
            <Link
              key={item.id}
              href={hrefFor(item.id)}
              className="rounded-lg px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--foreground)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="col-start-3 flex items-center gap-2 justify-self-end">
          {username ? (
            <>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--subtle)]"
              >
                Dashboard
              </Link>
              <button
                type="button"
                onClick={logout}
                disabled={loggingOut}
                className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--subtle)] disabled:opacity-60 sm:px-4"
              >
                {loggingOut ? "…" : "Log out"}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--subtle)] sm:inline-flex"
              >
                Log in
              </Link>
              <Link
                href="/start"
                className="inline-flex items-center gap-2 rounded-xl btn-accent px-3.5 py-2.5 text-sm font-medium transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] sm:px-4"
              >
                <span className="whitespace-nowrap">Start hunting</span>
                <Icon name="send" className="hidden h-4 w-4 sm:block" />
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            aria-label="Toggle menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] lg:hidden"
          >
            <span className="relative block h-3 w-4">
              <span className={`absolute left-0 block h-0.5 w-4 bg-current transition-transform ${open ? "top-1.5 rotate-45" : "top-0"}`} />
              <span className={`absolute left-0 top-1.5 block h-0.5 w-4 bg-current transition-opacity ${open ? "opacity-0" : ""}`} />
              <span className={`absolute left-0 block h-0.5 w-4 bg-current transition-transform ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
            </span>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-[var(--line)] px-5 py-3 sm:px-6 lg:hidden">
          {(username ? [] : NAV).map(item => (
            <Link
              key={item.id}
              href={hrefFor(item.id)}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-[var(--subtle)]"
            >
              {item.label}
            </Link>
          ))}

          <div className="mt-2 border-t border-[var(--line)] pt-2">
            {username ? (
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="block rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-[var(--subtle)]"
              >
                Dashboard (@{username})
              </Link>
            ) : (
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="block rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-[var(--subtle)]"
              >
                Log in
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>

    {/* Occupies the space the fixed header vacated, matching its height. */}
    <div className="h-16 md:h-20" aria-hidden="true" />
    </>
  );
}
