import { politeJson } from "../http";
import type { AtsVendor, CrawlQuery, JobPosting, JobSource } from "../types";

/**
 * Applicant-tracking-system job boards.
 *
 * This is the strongest source in the set and the least fragile. Greenhouse,
 * Lever, Ashby and SmartRecruiters all publish documented, unauthenticated JSON
 * board APIs that companies opt into by using the product — no scraping, no
 * bot challenges, and the data is exactly what the company published.
 *
 * Most startups (including a large share of YC and Wellfound companies) host
 * their real postings here, so this both widens coverage and gives us the
 * canonical apply URL that aggregator listings often bury.
 *
 * Boards are configured rather than discovered: set ATS_BOARDS to a comma-
 * separated list of `vendor:slug` pairs, e.g. "greenhouse:stripe,ashby:ramp".
 */

const DEFAULT_BOARDS = "greenhouse:stripe,ashby:ramp,lever:leverdemo";

interface Board { vendor: AtsVendor; slug: string }

export function parseBoards(spec = process.env.ATS_BOARDS ?? DEFAULT_BOARDS): Board[] {
  return spec
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const [vendor, slug] = s.split(":");
      return { vendor: vendor as AtsVendor, slug };
    })
    .filter(b => b.slug);
}

const ENDPOINTS: Record<string, (slug: string) => string> = {
  greenhouse: s => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`,
  lever: s => `https://api.lever.co/v0/postings/${s}?mode=json`,
  ashby: s => `https://api.ashbyhq.com/posting-api/job-board/${s}`,
  smartrecruiters: s => `https://api.smartrecruiters.com/v1/companies/${s}/postings`,
};

/* Each vendor returns a different shape; these normalise to JobPosting. */

interface GhJob { id: number; title: string; absolute_url: string; location?: { name?: string }; updated_at?: string; content?: string }
interface LeverJob { id: string; text: string; hostedUrl: string; applyUrl?: string; categories?: { location?: string; commitment?: string }; createdAt?: number; descriptionPlain?: string }
interface AshbyJob { id: string; title: string; jobUrl?: string; applyUrl?: string; location?: string; isRemote?: boolean; employmentType?: string; publishedAt?: string; descriptionPlain?: string }
interface SrJob { id: string; name: string; location?: { city?: string; country?: string }; releasedDate?: string; ref?: string }

function matchesQuery(title: string, blob: string, query: CrawlQuery): boolean {
  const terms = [query.role, ...(query.keywords ?? [])]
    .filter(Boolean)
    .flatMap(t => t.toLowerCase().split(/\s+/))
    .filter(t => t.length > 2);
  if (!terms.length) return true;
  const hay = `${title} ${blob}`.toLowerCase();
  return terms.some(t => hay.includes(t));
}

async function fetchBoard(board: Board, query: CrawlQuery): Promise<JobPosting[]> {
  const build = ENDPOINTS[board.vendor];
  if (!build) return [];

  // Documented public APIs, not crawled pages — robots.txt governs crawlers of
  // the HTML site, not consumers of a published JSON endpoint.
  const data = await politeJson<unknown>(build(board.slug), { skipRobots: true });
  const now = new Date().toISOString();
  const out: JobPosting[] = [];

  const push = (p: JobPosting, haystack: string) => {
    if (matchesQuery(p.title, haystack, query)) out.push(p);
  };

  if (board.vendor === "greenhouse") {
    for (const j of ((data as { jobs?: GhJob[] }).jobs ?? [])) {
      push({
        id: `ats:greenhouse:${board.slug}:${j.id}`,
        source: "ats", externalId: String(j.id), title: j.title,
        companyName: board.slug, location: j.location?.name,
        remote: /remote/i.test(j.location?.name ?? ""),
        url: j.absolute_url, applyUrl: j.absolute_url, ats: "greenhouse",
        postedAt: j.updated_at, fetchedAt: now,
        description: j.content ? j.content.replace(/<[^>]+>/g, " ").slice(0, 4000) : undefined,
      }, j.content ?? "");
    }
  } else if (board.vendor === "lever") {
    for (const j of (data as LeverJob[])) {
      push({
        id: `ats:lever:${board.slug}:${j.id}`,
        source: "ats", externalId: j.id, title: j.text,
        companyName: board.slug, location: j.categories?.location,
        remote: /remote/i.test(j.categories?.location ?? ""),
        employmentType: j.categories?.commitment,
        url: j.hostedUrl, applyUrl: j.applyUrl ?? j.hostedUrl, ats: "lever",
        postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
        description: j.descriptionPlain?.slice(0, 4000), fetchedAt: now,
      }, j.descriptionPlain ?? "");
    }
  } else if (board.vendor === "ashby") {
    for (const j of ((data as { jobs?: AshbyJob[] }).jobs ?? [])) {
      push({
        id: `ats:ashby:${board.slug}:${j.id}`,
        source: "ats", externalId: j.id, title: j.title,
        companyName: board.slug, location: j.location, remote: j.isRemote,
        employmentType: j.employmentType,
        url: j.jobUrl ?? `https://jobs.ashbyhq.com/${board.slug}`,
        applyUrl: j.applyUrl, ats: "ashby",
        postedAt: j.publishedAt, description: j.descriptionPlain?.slice(0, 4000),
        fetchedAt: now,
      }, j.descriptionPlain ?? "");
    }
  } else if (board.vendor === "smartrecruiters") {
    for (const j of ((data as { content?: SrJob[] }).content ?? [])) {
      const loc = [j.location?.city, j.location?.country].filter(Boolean).join(", ");
      push({
        id: `ats:smartrecruiters:${board.slug}:${j.id}`,
        source: "ats", externalId: j.id, title: j.name,
        companyName: board.slug, location: loc, remote: /remote/i.test(loc),
        url: j.ref ?? `https://jobs.smartrecruiters.com/${board.slug}`,
        ats: "smartrecruiters", postedAt: j.releasedDate, fetchedAt: now,
      }, "");
    }
  }

  return out;
}

export const atsSource: JobSource = {
  id: "ats",
  label: "Company ATS boards (Greenhouse · Lever · Ashby · SmartRecruiters)",
  access: "Documented public board APIs. No authentication, no scraping.",

  async search(query: CrawlQuery): Promise<JobPosting[]> {
    const boards = parseBoards();
    const batches = await Promise.allSettled(boards.map(b => fetchBoard(b, query)));

    // One dead board should never fail the whole source.
    const jobs = batches.flatMap(r => (r.status === "fulfilled" ? r.value : []));
    return jobs.slice(0, query.limit ?? 100);
  },
};
