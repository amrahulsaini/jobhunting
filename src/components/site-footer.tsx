"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";

const SECTIONS = [
  { id: "sources", label: "Sources" },
  { id: "how-it-works", label: "How it works" },
  { id: "features", label: "Features" },
];

export function SiteFooter() {
  const pathname = usePathname();
  const onLanding = pathname === "/";

  // Same rule as the header: a bare hash on the landing page, a full path
  // anywhere else. `/#id` while already on `/` never scrolls.
  const hrefFor = (id: string) => (onLanding ? `#${id}` : `/#${id}`);

  return (
    <footer className="mt-auto border-t border-[var(--line)]">
      <div className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-6 sm:py-12">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <Link href="/" className="transition-opacity hover:opacity-70" aria-label="JobHunting home">
            <Logo className="h-8 w-auto sm:h-9 md:h-11" />
          </Link>

          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--muted)] sm:gap-x-6">
            {SECTIONS.map(section => (
              <Link
                key={section.id}
                href={hrefFor(section.id)}
                className="link-underline hover:text-[var(--foreground)]"
              >
                {section.label}
              </Link>
            ))}
            <Link href="/login" className="link-underline hover:text-[var(--foreground)]">
              Log in
            </Link>
          </nav>
        </div>

        <p className="mt-8 text-xs text-[var(--muted)]">
          © {new Date().getFullYear()} JobHunting. Your resume is yours.
        </p>
      </div>
    </footer>
  );
}
