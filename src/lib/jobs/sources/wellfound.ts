import { BROWSER_HEADERS, politeFetch } from "../http";
import type { AtsVendor, CrawlQuery, JobPosting, JobSource } from "../types";

/**
 * Wellfound (formerly AngelList Talent).
 *
 * The public AngelList API was retired, so this reads the server-rendered
 * `__NEXT_DATA__` blob on role landing pages. Those `/role/...` paths are
 * explicitly permitted by robots.txt — `/search` and `/_jobs/` are not, and this
 * adapter deliberately never touches them.
 *
 * Listings carry an `atsSource` field (e.g. "AtsIntegration::Ashby::Listing"),
 * which tells us which ATS actually hosts the job — the single most useful hint
 * for resolving a real careers contact later.
 */

interface WfListing {
  __typename: string;
  id?: string;
  title?: string;
  slug?: string;
  description?: string;
  remote?: boolean;
  liveStartAt?: number;
  atsSource?: string;
  compensation?: string;
  locationNames?: unknown;
  jobType?: string;
}

interface WfStartup {
  __typename: string;
  id?: string;
  name?: string;
  slug?: string;
  highConcept?: string;
  logoUrl?: string;
  companySize?: string;
}

function atsFromSource(atsSource?: string): AtsVendor | undefined {
  if (!atsSource) return undefined;
  const s = atsSource.toLowerCase();
  if (s.includes("greenhouse")) return "greenhouse";
  if (s.includes("lever")) return "lever";
  if (s.includes("ashby")) return "ashby";
  if (s.includes("smartrecruiters")) return "smartrecruiters";
  if (s.includes("workable")) return "workable";
  return "unknown";
}

/** Wellfound stores relations as `{__ref: "StartupResult:123"}`. */
function resolveRef(v: unknown): string | undefined {
  if (v && typeof v === "object" && "__ref" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>).__ref);
  }
  return undefined;
}

/**
 * Pulls the normalised Apollo cache out of __NEXT_DATA__.
 *
 * `raw` is returned alongside the indexed startups because listing→company is a
 * reverse lookup: a startup entity holds refs to its listings, not the other way
 * round, so resolving an owner means scanning the original entries.
 */
export function parseNextData(html: string): {
  raw: Record<string, unknown>;
  startups: Map<string, WfStartup>;
} {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const empty = { raw: {}, startups: new Map<string, WfStartup>() };
  if (!m) return empty;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(m[1])?.props?.pageProps?.apolloState?.data ?? {};
  } catch {
    return empty;
  }

  const startups = new Map<string, WfStartup>();
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("StartupResult:")) startups.set(key, value as WfStartup);
  }
  return { raw: data, startups };
}

/** Finds the startup entity that references this listing. */
function ownerOf(
  listingKey: string,
  startups: Map<string, WfStartup>,
  raw: Record<string, unknown>
): WfStartup | undefined {
  for (const [sKey, startup] of startups) {
    const entry = raw[sKey] as Record<string, unknown> | undefined;
    if (!entry) continue;
    for (const v of Object.values(entry)) {
      if (Array.isArray(v) && v.some(x => resolveRef(x) === listingKey)) return startup;
    }
  }
  return undefined;
}

function slugifyRole(role: string): string {
  return role.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const wellfoundSource: JobSource = {
  id: "wellfound",
  label: "Wellfound",
  access: "Public /role/ landing pages (robots-permitted). /search is disallowed and never touched.",

  async search(query: CrawlQuery): Promise<JobPosting[]> {
    const slug = slugifyRole(query.role) || "full-stack-engineer";
    const html = await politeFetch(`https://wellfound.com/role/r/${slug}`, {
      headers: BROWSER_HEADERS,
    });

    const { raw, startups } = parseNextData(html);
    const now = new Date().toISOString();
    const out: JobPosting[] = [];

    for (const [key, value] of Object.entries(raw)) {
      if (!key.startsWith("JobListingSearchResult:")) continue;
      const listing = value as WfListing;
      if (!listing.title) continue;

      const company = ownerOf(key, startups, raw);
      const id = key.split(":")[1];

      out.push({
        id: `wellfound:${id}`,
        source: "wellfound",
        externalId: id,
        title: listing.title,
        companyName: company?.name ?? "Unknown company",
        companySlug: company?.slug,
        companyTagline: company?.highConcept,
        companyLogoUrl: company?.logoUrl,
        companyStage: company?.companySize,
        remote: Boolean(listing.remote),
        employmentType: listing.jobType,
        salary: listing.compensation,
        description: listing.description?.slice(0, 4000),
        url: company?.slug
          ? `https://wellfound.com/company/${company.slug}/jobs`
          : `https://wellfound.com/role/r/${slug}`,
        ats: atsFromSource(listing.atsSource),
        postedAt: listing.liveStartAt
          ? new Date(listing.liveStartAt * 1000).toISOString()
          : undefined,
        fetchedAt: now,
      });

      if (out.length >= (query.limit ?? 50)) break;
    }
    return out;
  },
};
