import { BOT_UA, isAllowed } from "@/lib/jobs/http";
import type { JobPosting } from "@/lib/jobs";

/**
 * Resolves the address a job application should actually reach.
 *
 * Strategy, cheapest and most reliable first:
 *   1. If the posting is on a known ATS, the apply URL *is* the correct channel —
 *      an email would route around the company's own pipeline. Stop there.
 *   2. Otherwise check the company's standard careers paths for a published
 *      mailto: address.
 *
 * Deliberately excluded: guessing addresses from name patterns
 * (`first.last@company.com`). Those are unverified, bounce often, and land you
 * in spam traps. We only report an address a company chose to publish.
 */

export type ContactKind = "ats-apply" | "published-email" | "careers-page" | "none";

export interface CompanyContact {
  company: string;
  kind: ContactKind;
  /** Published address, when one was found. */
  email?: string;
  /** Careers page or apply URL, whichever applies. */
  url?: string;
  /** How this was resolved, for display in the UI. */
  evidence: string;
  checkedAt: string;
}

const CAREERS_PATHS = ["/careers", "/jobs", "/careers/", "/company/careers", "/about/careers", "/contact"];

// Deliberately conservative: role addresses only. Personal inboxes scraped from a
// site are not fair game for cold outreach.
const ROLE_PREFIXES = /^(careers?|jobs?|hiring|recruiting|recruitment|talent|people|hr|work|apply|team|hello|contact|info)@/i;

const EMAIL_RX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

function domainFrom(job: JobPosting): string | undefined {
  for (const candidate of [job.applyUrl, job.url]) {
    if (!candidate) continue;
    try {
      const host = new URL(candidate).hostname;
      // Aggregator and ATS hosts are not the company's own domain.
      if (/workatastartup|wellfound|indeed|greenhouse|lever|ashby|smartrecruiters|ycombinator/i.test(host)) {
        continue;
      }
      return host;
    } catch {
      /* ignore malformed URLs */
    }
  }
  return undefined;
}

async function scanPage(url: string): Promise<string[]> {
  if (!(await isAllowed(url))) return [];
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BOT_UA },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Prefer explicit mailto: links — those are unambiguously published contacts.
    const mailtos = [...html.matchAll(/mailto:([^"'?>\s]+)/gi)].map(m => m[1].toLowerCase());
    const inline = (html.match(EMAIL_RX) ?? []).map(e => e.toLowerCase());

    return [...new Set([...mailtos, ...inline])].filter(
      e => ROLE_PREFIXES.test(e) && !/\.(png|jpe?g|svg|webp|gif)$/i.test(e)
    );
  } catch {
    return [];
  }
}

export async function discoverContact(job: JobPosting): Promise<CompanyContact> {
  const checkedAt = new Date().toISOString();

  if (job.ats && job.ats !== "unknown" && job.applyUrl) {
    return {
      company: job.companyName,
      kind: "ats-apply",
      url: job.applyUrl,
      evidence: `Posting is hosted on ${job.ats}; applying through their pipeline is the intended route.`,
      checkedAt,
    };
  }

  const domain = domainFrom(job);
  if (!domain) {
    return {
      company: job.companyName,
      kind: job.applyUrl ? "careers-page" : "none",
      url: job.applyUrl ?? job.url,
      evidence: "No company-owned domain resolvable from the listing.",
      checkedAt,
    };
  }

  for (const path of CAREERS_PATHS) {
    const url = `https://${domain}${path}`;
    const found = await scanPage(url);
    if (found.length) {
      return {
        company: job.companyName,
        kind: "published-email",
        email: found[0],
        url,
        evidence: `Published on ${url}`,
        checkedAt,
      };
    }
  }

  return {
    company: job.companyName,
    kind: "careers-page",
    url: job.applyUrl ?? `https://${domain}/careers`,
    evidence: "No published role address found; apply via the careers page.",
    checkedAt,
  };
}

/** Resolves contacts for many postings with bounded concurrency. */
export async function discoverContacts(jobs: JobPosting[], concurrency = 4): Promise<CompanyContact[]> {
  const out: CompanyContact[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < jobs.length) out.push(await discoverContact(jobs[i++]));
    })
  );
  return out;
}
