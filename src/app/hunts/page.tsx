import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { currentUser } from "@/lib/auth/session";
import { hunts } from "@/lib/db/collections";
import { usageSummary } from "@/lib/billing/usage";
import { formatMoney, toLocal } from "@/lib/billing/currency";

export const metadata: Metadata = { title: "Hunts" };
export const dynamic = "force-dynamic";

export default async function HuntsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const usage = await usageSummary(user._id!);
  const money = await toLocal(usage.totalUsd, user.profile?.countryCode);

  const all = await hunts().then(c =>
    c.find({ userId: user._id }).sort({ createdAt: -1 }).toArray()
  );

  return (
    <AppShell username={user.username} usageDisplay={formatMoney(money.amount, money.currency)}>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hunts</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Every search Hunter has run for you, with the contacts it verified.
        </p>
      </header>

      {all.length ? (
        <ul className="mt-6 space-y-3">
          {all.map(hunt => {
            const companies = hunt.companies as { emails?: string[] }[];
            const contacts = companies.filter(c => c.emails?.length).length;

            return (
              <li key={String(hunt._id)}>
                <Link
                  href={`/hunts/${hunt._id}`}
                  className="card flex flex-wrap items-center justify-between gap-4 p-6"
                >
                  <div className="min-w-0">
                    <p className="font-semibold tracking-tight">{hunt.role}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {new Date(hunt.createdAt).toLocaleString()} · searched{" "}
                      {hunt.searchQueries?.length ?? 0} queries
                    </p>
                  </div>
                  <p className="shrink-0 text-sm text-[var(--muted)]">
                    {companies.length} companies · {contacts} with a contact
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="card mt-6 flex flex-col items-center gap-4 p-12 text-center">
          <Icon name="globe-crawl" className="h-8 w-8" />
          <p className="max-w-sm text-sm text-[var(--muted)]">
            No hunts yet. Start one from the dashboard and it will appear here.
          </p>
          <Link
            href="/dashboard"
            className="rounded-xl bg-[var(--foreground)] px-5 py-3 text-sm font-medium text-[var(--background)]"
          >
            Go to dashboard
          </Link>
        </section>
      )}
    </AppShell>
  );
}
