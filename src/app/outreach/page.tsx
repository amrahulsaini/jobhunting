import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { Mailbox } from "@/components/mailbox";
import { DisconnectGmail } from "@/components/disconnect-gmail";
import { currentUser } from "@/lib/auth/session";
import { gmailConfigured } from "@/lib/gmail/oauth";
import { usageSummary } from "@/lib/billing/usage";
import { formatMoney, toLocal } from "@/lib/billing/currency";

export const metadata: Metadata = { title: "Outreach" };
export const dynamic = "force-dynamic";

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { connected, error } = await searchParams;
  const usage = await usageSummary(user._id!);
  const money = await toLocal(usage.totalUsd, user.profile?.countryCode);

  const account = user.gmail;
  const configured = gmailConfigured();

  return (
    <AppShell username={user.username} usageDisplay={formatMoney(money.amount, money.currency)}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Outreach</h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            {account
              ? "Your mail, in the same place as your hunts — so replies and applications live together."
              : "Connect Gmail to read and send your outreach without leaving JobHunting."}
          </p>
        </div>

        {account && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--muted)]">{account.email}</span>
            <DisconnectGmail />
          </div>
        )}
      </header>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-[var(--foreground)] px-4 py-3 text-sm">
          {error}
        </p>
      )}
      {connected && (
        <p className="mt-6 rounded-xl border border-[var(--accent)] px-4 py-3 text-sm">
          Gmail connected{connected !== "1" ? ` as ${connected}` : ""}.
        </p>
      )}

      <div className="mt-6">
        {account ? (
          <Mailbox connectedAs={account.email} />
        ) : (
          <section className="card flex flex-col items-center gap-6 p-10 text-center lg:p-16">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--line)]">
              <Icon name="mail-search" className="h-6 w-6" />
            </span>

            <div className="max-w-lg">
              <h2 className="text-xl font-semibold tracking-tight">Connect your Gmail</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                JobHunting reads your mail so replies to your applications show up next to the
                companies they came from. Nothing is ever sent without your approval.
              </p>
            </div>

            <ul className="space-y-2 text-left text-sm text-[var(--muted)]">
              {[
                "Read access, so replies appear here",
                "Send access, used only for drafts you approve",
                "Disconnect any time — access is revoked at Google, not just forgotten",
              ].map(line => (
                <li key={line} className="flex items-start gap-3">
                  <Icon name="shield-lock" className="mt-0.5 h-4 w-4 shrink-0" />
                  {line}
                </li>
              ))}
            </ul>

            {configured ? (
              <a
                href="/api/gmail/connect"
                className="inline-flex items-center gap-2 rounded-xl btn-accent px-6 py-3.5 text-sm font-medium shadow-[var(--shadow-md)] transition-all duration-300 hover:-translate-y-0.5"
              >
                <Icon name="send" className="h-4 w-4" />
                Connect Gmail
              </a>
            ) : (
              <div className="max-w-lg rounded-xl border border-[var(--line-strong)] bg-[var(--subtle)] p-5 text-left">
                <p className="text-sm font-medium">Gmail is not configured yet</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                  Create an OAuth client in Google Cloud Console, then add its id and secret to{" "}
                  <code className="font-mono text-xs">.env.local</code> as{" "}
                  <code className="font-mono text-xs">GOOGLE_OAUTH_CLIENT_ID</code> and{" "}
                  <code className="font-mono text-xs">GOOGLE_OAUTH_CLIENT_SECRET</code>.
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
