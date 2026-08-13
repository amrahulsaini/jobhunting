import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { Mailbox } from "@/components/mailbox";
import { DisconnectGmail } from "@/components/disconnect-gmail";
import { OutreachTabs } from "@/components/outreach-tabs";
import { OutreachDrafts, type OutreachDraftView } from "@/components/outreach-drafts";
import { EmailSettingsPanel } from "@/components/email-settings";
import { currentUser } from "@/lib/auth/session";
import { gmailConfigured } from "@/lib/gmail/oauth";
import { hunts } from "@/lib/db/collections";
import { DEFAULT_SETTINGS, type CompanyDraft } from "@/lib/outreach/draft-company";
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

  // Drafts live on the hunts that produced them; gather them into one list.
  const all = await hunts().then(c =>
    c.find({ userId: user._id, drafts: { $exists: true } }).sort({ createdAt: -1 }).toArray()
  );

  const drafts: OutreachDraftView[] = all.flatMap(hunt =>
    ((hunt.drafts ?? []) as CompanyDraft[]).map(d => ({
      huntId: String(hunt._id),
      key: d.key,
      company: d.company,
      roleTitle: d.roleTitle,
      to: d.to,
      applyUrl: d.applyUrl,
      subject: d.subject,
      body: d.body,
      rationale: d.rationale,
      warnings: d.warnings ?? [],
      sentAt: d.sentAt ? new Date(d.sentAt).toISOString() : undefined,
    }))
  );

  // Unsent first — those are the ones needing attention.
  drafts.sort((a, b) => Number(Boolean(a.sentAt)) - Number(Boolean(b.sentAt)));

  const settings = { ...DEFAULT_SETTINGS, ...(user.emailSettings ?? {}) };

  return (
    <AppShell username={user.username} usageDisplay={formatMoney(money.amount, money.currency)}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Outreach</h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            {drafts.length
              ? `${drafts.filter(d => !d.sentAt).length} waiting to send. Nothing goes out until you press send.`
              : "Your drafts, your writing settings, and your inbox — in one place."}
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

      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <OutreachTabs
          draftCount={drafts.filter(d => !d.sentAt).length}
          drafts={
            <OutreachDrafts
              drafts={drafts}
              canSend={Boolean(account)}
              resumeName={settings.attachResume ? user.resume?.filename : undefined}
            />
          }
          settings={<EmailSettingsPanel initial={settings} hasResume={Boolean(user.resume)} />}
          inbox={
            account ? (
              <Mailbox connectedAs={account.email} />
            ) : (
              <section className="card flex flex-col items-center gap-6 p-10 text-center lg:p-14">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--line)]">
                  <Icon name="mail-search" className="h-6 w-6" />
                </span>

                <div className="max-w-lg">
                  <h2 className="text-xl font-semibold tracking-tight">Connect your Gmail</h2>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                    Needed to send your drafts and to see replies next to the companies they came
                    from. Nothing is ever sent without your approval.
                  </p>
                </div>

                {configured ? (
                  <a
                    href="/api/gmail/connect"
                    className="btn-accent inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-medium"
                  >
                    <Icon name="send" className="h-4 w-4" />
                    Connect Gmail
                  </a>
                ) : (
                  <div className="max-w-lg rounded-xl border border-[var(--line-strong)] bg-[var(--subtle)] p-5 text-left">
                    <p className="text-sm font-medium">Gmail is not configured yet</p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                      Add <code className="font-mono text-xs">GOOGLE_OAUTH_CLIENT_ID</code> and{" "}
                      <code className="font-mono text-xs">GOOGLE_OAUTH_CLIENT_SECRET</code> to{" "}
                      <code className="font-mono text-xs">.env.local</code>.
                    </p>
                  </div>
                )}
              </section>
            )
          }
        />
      </div>
    </AppShell>
  );
}
