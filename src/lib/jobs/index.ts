import { BlockedError } from "./http";
import { ycSource } from "./sources/yc";
import { wellfoundSource } from "./sources/wellfound";
import { indeedSource } from "./sources/indeed";
import { atsSource } from "./sources/ats";
import type { CrawlQuery, CrawlResult, JobPosting, JobSource, SourceResult, SourceStatus } from "./types";

export * from "./types";
export const SOURCES: JobSource[] = [ycSource, wellfoundSource, indeedSource, atsSource];

/** Two postings for the same role at the same company are the same job. */
function dedupeKey(job: JobPosting): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${norm(job.companyName)}::${norm(job.title)}`;
}

/**
 * Prefers the listing that can actually be applied to: an ATS posting carries
 * the canonical apply URL, whereas an aggregator copy often dead-ends.
 */
function preferable(a: JobPosting, b: JobPosting): JobPosting {
  const score = (j: JobPosting) =>
    (j.applyUrl ? 2 : 0) + (j.ats && j.ats !== "unknown" ? 2 : 0) + (j.description ? 1 : 0);
  return score(b) > score(a) ? b : a;
}

function rank(jobs: JobPosting[], query: CrawlQuery): JobPosting[] {
  const terms = [query.role, ...(query.keywords ?? [])]
    .filter(Boolean)
    .flatMap(t => t.toLowerCase().split(/\s+/))
    .filter(t => t.length > 2);

  return [...jobs].sort((a, b) => {
    const hit = (j: JobPosting) =>
      terms.filter(t => j.title.toLowerCase().includes(t)).length;
    const byTerms = hit(b) - hit(a);
    if (byTerms) return byTerms;
    const byApply = (b.applyUrl ? 1 : 0) - (a.applyUrl ? 1 : 0);
    if (byApply) return byApply;
    return (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
  });
}

function statusFor(error: unknown): SourceStatus {
  if (error instanceof BlockedError) {
    const detail = error.message;
    // A missing key is a configuration gap, not a refusal — report it as such.
    return /is not set|credential|API key/i.test(detail)
      ? { state: "needs-credentials", detail }
      : { state: "blocked", detail };
  }
  return { state: "error", detail: error instanceof Error ? error.message : String(error) };
}

/**
 * Runs every source in parallel and merges the results.
 *
 * Sources fail independently and loudly: one blocked platform never sinks the
 * crawl, and the per-source status is returned so the UI can say *why* a
 * platform came back empty instead of pretending it had no jobs.
 */
export async function crawlAll(query: CrawlQuery): Promise<CrawlResult> {
  const started = Date.now();

  const results = await Promise.all(
    SOURCES.map(async (source): Promise<SourceResult> => {
      const t0 = Date.now();
      try {
        const jobs = await source.search(query);
        return {
          source: source.id,
          label: source.label,
          status: jobs.length ? { state: "ok", count: jobs.length } : { state: "empty" },
          jobs,
          tookMs: Date.now() - t0,
        };
      } catch (error) {
        return {
          source: source.id,
          label: source.label,
          status: statusFor(error),
          jobs: [],
          tookMs: Date.now() - t0,
        };
      }
    })
  );

  const merged = new Map<string, JobPosting>();
  for (const job of results.flatMap(r => r.jobs)) {
    const key = dedupeKey(job);
    const existing = merged.get(key);
    merged.set(key, existing ? preferable(existing, job) : job);
  }

  return {
    query,
    results,
    jobs: rank([...merged.values()], query),
    tookMs: Date.now() - started,
  };
}
