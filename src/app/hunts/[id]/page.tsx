import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { currentUser } from "@/lib/auth/session";
import { hunts } from "@/lib/db/collections";
import { usageSummary } from "@/lib/billing/usage";
import { formatMoney, toLocal } from "@/lib/billing/currency";
import type { EnrichResult } from "@/lib/hunting/enrich";
import type { HuntConfig } from "@/lib/hunting/types";

export const metadata: Metadata = { title: "Hunt report" };
export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  "careers-page": "Careers page",
  "contact-page": "Contact page",
  homepage: "Homepage",
  ats: "Applicant tracking system",
  none: "Not found",
};

export default async function HuntReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();

  const col = await hunts();
  // Scoped to the owner: an id alone must never expose someone else's hunt.
  const hunt = await col.findOne({ _id: new ObjectId(id), userId: user._id });
  if (!hunt) notFound();

  const usage = await usageSummary(user._id!);
  const money = await toLocal(usage.totalUsd, user.profile?.countryCode);

  const companies = hunt.companies as EnrichResult[];
  const config = hunt.config as HuntConfig;
  const withEmail = companies.filter(c => c.emails.length);

  return (
    <AppShell username={user.username} usageDisplay={formatMoney(money.amount, money.currency)}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="link-underline text-sm text-[var(--muted)]">
            ← Back to dashboard
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            {hunt.role}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {new Date(hunt.createdAt).toLocaleString()} ·{" "}
            {config?.scope === "own"
              ? user.profile?.country ?? "Your country"
              : config?.scope === "global"
                ? "Worldwide"
                : config?.countries?.join(", ")}{" "}
            · {config?.roleTypes?.join(", ")}
          </p>
        </div>
      </header>

      {/* ------------------------------------------------------ summary */}
      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        {[
          ["Companies researched", String(companies.length)],
          ["Contacts verified", String(withEmail.length)],
          ["Found by search", String(hunt.totalDiscovered)],
        ].map(([label, value]) => (
          <section key={label} className="card p-6">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
          </section>
        ))}
      </div>

      {/* ------------------------------------------------- what we searched */}
      {!!hunt.searchQueries?.length && (
        <section className="card mt-5 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            Google searches the agent ran
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {hunt.searchQueries.map(q => (
              <li
                key={q}
                className="rounded-full border border-[var(--line)] px-3 py-1.5 font-mono text-xs"
              >
                {q}
              </li>
            ))}
          </ul>

          {!!hunt.sources?.length && (
            <>
              <h3 className="mt-6 text-xs uppercase tracking-wide text-[var(--muted)]">
                Pages the search cited ({hunt.sources.length})
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {hunt.sources.map(s => (
                  <li key={s.uri} className="truncate">
                    <a
                      href={s.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-underline text-[var(--muted)]"
                    >
                      {s.title || s.uri}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* Shows the country filter doing its job, rather than silently dropping. */}
      {!!hunt.rejected?.length && (
        <section className="card mt-5 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            Filtered out — outside your countries ({hunt.rejected.length})
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            The search returned these, but they are not in the countries you chose, so they
            were dropped before any research was done.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {hunt.rejected.map(r => (
              <li key={r.name} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium line-through decoration-[var(--line-strong)]">
                  {r.name}
                </span>
                <span className="text-xs text-[var(--muted)]">{r.why}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------- the companies */}
      <div className="mt-5 space-y-5">
        {companies.map(company => (
          <article key={company.name} className="card overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] p-6">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight">{company.name}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {[company.roleTitle, company.roleType, company.location]
                    .filter(Boolean)
                    .join(" · ")}
                  {company.matchedRole && (
                    <span className="ml-2 rounded-full border border-[var(--line)] px-2 py-0.5 text-xs">
                      via {company.matchedRole}
                    </span>
                  )}
                </p>
                {company.reason && (
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed">{company.reason}</p>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                {company.website && (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--subtle)]"
                  >
                    Website
                  </a>
                )}
                {company.careersUrl && (
                  <a
                    href={company.careersUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg btn-accent px-3 py-2 text-xs font-medium transition-opacity hover:opacity-85"
                  >
                    Careers page
                  </a>
                )}
              </div>
            </div>

            <div className="grid gap-6 p-6 lg:grid-cols-2">
              {/* Contacts, each with the evidence behind it. */}
              <div>
                <h3 className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Contact · {SOURCE_LABEL[company.contactSource] ?? company.contactSource}
                </h3>

                {company.evidence?.length ? (
                  <ul className="mt-3 space-y-3">
                    {company.evidence.map(e => (
                      <li key={e.email} className="rounded-xl border border-[var(--line)] p-4">
                        <a
                          href={`mailto:${e.email}`}
                          className="font-medium link-underline break-all"
                        >
                          {e.email}
                        </a>
                        <p className="mt-2 text-xs text-[var(--muted)]">
                          Read from{" "}
                          <a
                            href={e.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link-underline break-all"
                          >
                            {e.sourceUrl}
                          </a>{" "}
                          · HTTP {e.httpStatus}
                          {e.fromMailto && " · mailto: link"}
                        </p>
                        {e.snippet && (
                          <p className="mt-2 border-l-2 border-[var(--line-strong)] pl-3 text-xs italic leading-relaxed text-[var(--muted)]">
                            …{e.snippet}…
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    No published address found. We never guess an address — an invented one
                    bounces and damages your sending reputation.
                  </p>
                )}

                {company.ats && (
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    Applications run through <strong>{company.ats}</strong>.
                  </p>
                )}
              </div>

              {/* Exactly which pages were opened, and what came back. */}
              <div>
                <h3 className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Pages opened ({company.visited?.length ?? 0})
                </h3>
                <ul className="mt-3 space-y-2 text-xs">
                  {company.visited?.map(v => (
                    <li key={v.url} className="flex items-start gap-2">
                      <span
                        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                          v.ok ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[var(--muted)]">{v.url}</span>
                        <span className="text-[var(--muted)]">
                          {v.ok ? `HTTP ${v.status}` : v.error ?? `HTTP ${v.status}`}
                        </span>
                        {v.snapshot && (
                          <span className="mt-1 block line-clamp-2 italic text-[var(--muted)]">
                            {v.snapshot}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>

                {!!company.notes?.length && (
                  <ul className="mt-4 space-y-1.5 text-xs text-[var(--muted)]">
                    {company.notes.map(note => (
                      <li key={note} className="flex gap-2">
                        <span aria-hidden="true">·</span>
                        {note}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {!companies.length && (
        <section className="card mt-5 flex flex-col items-center gap-4 p-12 text-center">
          <Icon name="globe-crawl" className="h-8 w-8" />
          <p className="text-sm text-[var(--muted)]">
            This hunt found no companies. Try widening the country scope or the role.
          </p>
        </section>
      )}
    </AppShell>
  );
}
