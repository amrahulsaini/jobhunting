import { BROWSER_HEADERS, politeFetch } from "../http";
import type { CrawlQuery, JobPosting, JobSource } from "../types";

/**
 * Y Combinator — workatastartup.com.
 *
 * The site is an Inertia.js app: rather than shipping a JSON API, it embeds the
 * entire page payload in a `data-page` attribute on the root div. Parsing that
 * is far more stable than scraping rendered markup, since it is the same
 * structured data the client-side app renders from.
 *
 * It rejects non-browser User-Agents with a 406, so this adapter sends browser
 * headers. Its robots.txt has a bare `Disallow:` — everything is permitted.
 */

interface YcJob {
  id: number;
  title: string;
  jobType?: string;
  location?: string;
  roleType?: string;
  salary?: string;
  companyName: string;
  companySlug?: string;
  companyBatch?: string;
  companyOneLiner?: string;
  companyLogoUrl?: string;
  applyUrl?: string;
}

function decodeAttr(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function parseInertiaJobs(html: string): YcJob[] {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) return [];
  try {
    const page = JSON.parse(decodeAttr(m[1]));
    return Array.isArray(page?.props?.jobs) ? (page.props.jobs as YcJob[]) : [];
  } catch {
    return [];
  }
}

function relevant(job: YcJob, query: CrawlQuery): boolean {
  const terms = [query.role, ...(query.keywords ?? [])]
    .filter(Boolean)
    .flatMap(t => t.toLowerCase().split(/\s+/))
    .filter(t => t.length > 2);
  if (!terms.length) return true;

  const hay = `${job.title} ${job.roleType ?? ""} ${job.companyOneLiner ?? ""}`.toLowerCase();
  return terms.some(t => hay.includes(t));
}

export const ycSource: JobSource = {
  id: "yc",
  label: "Y Combinator · Work at a Startup",
  access: "Public page payload (Inertia). robots.txt permits all paths.",

  async search(query: CrawlQuery): Promise<JobPosting[]> {
    const html = await politeFetch("https://www.workatastartup.com/companies", {
      headers: BROWSER_HEADERS,
    });

    const now = new Date().toISOString();
    return parseInertiaJobs(html)
      .filter(j => relevant(j, query))
      .slice(0, query.limit ?? 50)
      .map<JobPosting>(j => ({
        id: `yc:${j.id}`,
        source: "yc",
        externalId: String(j.id),
        title: j.title,
        companyName: j.companyName,
        companySlug: j.companySlug,
        companyTagline: j.companyOneLiner,
        companyLogoUrl: j.companyLogoUrl,
        companyStage: j.companyBatch ? `YC ${j.companyBatch}` : undefined,
        location: j.location,
        remote: /remote/i.test(j.location ?? ""),
        employmentType: j.jobType,
        salary: j.salary,
        url: j.companySlug
          ? `https://www.workatastartup.com/companies/${j.companySlug}`
          : "https://www.workatastartup.com/companies",
        applyUrl: j.applyUrl,
        fetchedAt: now,
      }));
  },
};
