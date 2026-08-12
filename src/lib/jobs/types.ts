/** Normalised shape every source adapter must return. */
export interface JobPosting {
  /** Stable dedupe key: `${source}:${externalId}`. */
  id: string;
  source: SourceId;
  externalId: string;
  title: string;
  companyName: string;
  companySlug?: string;
  companyTagline?: string;
  companyLogoUrl?: string;
  /** e.g. "S16" for a YC batch, "Series B" elsewhere. */
  companyStage?: string;
  location?: string;
  remote?: boolean;
  employmentType?: string;
  salary?: string;
  description?: string;
  /** Canonical public URL for the posting. */
  url: string;
  /** Where an application is actually submitted, when it differs from `url`. */
  applyUrl?: string;
  /** Which ATS hosts the posting, when detectable — the strongest hint for contact discovery. */
  ats?: AtsVendor;
  postedAt?: string;
  fetchedAt: string;
}

export type SourceId = "yc" | "wellfound" | "indeed" | "ats";

export type AtsVendor =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "workable"
  | "unknown";

export interface CrawlQuery {
  /** Free-text role, e.g. "full stack engineer". */
  role: string;
  keywords?: string[];
  location?: string;
  remoteOnly?: boolean;
  /** Hard ceiling on postings returned per source. */
  limit?: number;
}

export type SourceStatus =
  | { state: "ok"; count: number }
  /** Reachable but returned nothing for this query. */
  | { state: "empty" }
  /** Needs credentials we do not have; see `detail`. */
  | { state: "needs-credentials"; detail: string }
  /** Refused us — captcha, 403, or robots.txt disallow. */
  | { state: "blocked"; detail: string }
  | { state: "error"; detail: string };

export interface SourceResult {
  source: SourceId;
  label: string;
  status: SourceStatus;
  jobs: JobPosting[];
  /** Milliseconds spent on this source. */
  tookMs: number;
}

export interface JobSource {
  id: SourceId;
  label: string;
  /** Human-readable note about how this source is accessed. */
  access: string;
  search(query: CrawlQuery): Promise<JobPosting[]>;
}

export interface CrawlResult {
  query: CrawlQuery;
  results: SourceResult[];
  /** Deduped, ranked union across every source. */
  jobs: JobPosting[];
  tookMs: number;
}
