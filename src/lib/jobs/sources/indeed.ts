import type { CrawlQuery, JobPosting, JobSource } from "../types";
import { BlockedError } from "../http";

/**
 * Indeed.
 *
 * Indeed cannot be crawled directly: /jobs returns HTTP 403 behind a bot
 * challenge, and their Terms prohibit automated collection. The legitimate route
 * is their partner API, which issues a key after approval.
 *
 * So this adapter is credential-gated on purpose. With INDEED_API_KEY set it
 * queries the official endpoint; without one it reports `needs-credentials`
 * rather than silently returning nothing or attempting to evade the block.
 *
 * Apply at https://developer.indeed.com — then set:
 *   INDEED_API_KEY=...
 *   INDEED_API_URL=...   (optional; defaults to the Job Search GraphQL endpoint)
 */

const ENDPOINT = process.env.INDEED_API_URL ?? "https://apis.indeed.com/graphql";

interface IndeedJob {
  key?: string;
  title?: string;
  company?: { name?: string };
  location?: { formatted?: { short?: string } };
  url?: string;
  datePublished?: string;
  description?: { text?: string };
}

export const indeedSource: JobSource = {
  id: "indeed",
  label: "Indeed",
  access: "Official partner API (key required). Direct crawling is blocked and prohibited by their Terms.",

  async search(query: CrawlQuery): Promise<JobPosting[]> {
    const key = process.env.INDEED_API_KEY;
    if (!key) {
      throw new BlockedError(
        "INDEED_API_KEY is not set. Indeed blocks direct crawling (403 + bot challenge) and their " +
          "Terms prohibit it, so this source stays off until an official partner key is supplied."
      );
    }

    const gql = `
      query Search($q: String!, $loc: String, $limit: Int!) {
        jobSearch(what: $q, where: $loc, limit: $limit) {
          results {
            job {
              key
              title
              company { name }
              location { formatted { short } }
              url
              datePublished
              description { text }
            }
          }
        }
      }`;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query: gql,
        variables: {
          q: [query.role, ...(query.keywords ?? [])].join(" ").trim(),
          loc: query.location ?? null,
          limit: query.limit ?? 25,
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) throw new Error(`Indeed API HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(`Indeed API: ${json.errors[0]?.message ?? "unknown error"}`);

    const results: { job?: IndeedJob }[] = json?.data?.jobSearch?.results ?? [];
    const now = new Date().toISOString();

    return results
      .map(r => r.job)
      .filter((j): j is IndeedJob => Boolean(j?.key && j.title))
      .map<JobPosting>(j => ({
        id: `indeed:${j.key}`,
        source: "indeed",
        externalId: j.key!,
        title: j.title!,
        companyName: j.company?.name ?? "Unknown company",
        location: j.location?.formatted?.short,
        remote: /remote/i.test(j.location?.formatted?.short ?? ""),
        description: j.description?.text?.slice(0, 4000),
        url: j.url ?? "https://www.indeed.com",
        postedAt: j.datePublished,
        fetchedAt: now,
      }));
  },
};
