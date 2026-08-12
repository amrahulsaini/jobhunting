export type CountryScope = "own" | "specific" | "global";

export type RoleType = "intern" | "full-time" | "part-time" | "contract" | "freelance";

export const ROLE_TYPES: { id: RoleType; label: string }[] = [
  { id: "intern", label: "Internship" },
  { id: "full-time", label: "Full-time" },
  { id: "part-time", label: "Part-time" },
  { id: "contract", label: "Contract" },
  { id: "freelance", label: "Freelance" },
];

export const MATCH_COUNTS = [1, 5, 10, 25] as const;

export interface HuntConfig {
  scope: CountryScope;
  /** ISO codes, used when scope is "specific". */
  countries: string[];
  roleTypes: RoleType[];
  /** How many companies to research end to end. */
  matches: number;
  /**
   * Roles to search for. Each one gets its own grounded search, so more roles
   * means more distinct Google queries and a wider net.
   */
  roles: string[];
}

/** How the contact was obtained — the user should know before they email. */
export type ContactSource = "careers-page" | "contact-page" | "homepage" | "ats" | "none";

export interface HuntedCompany {
  name: string;
  domain?: string;
  website?: string;
  /** Why this company came up, in the agent's own words. */
  reason?: string;
  roleTitle?: string;
  roleType?: string;
  location?: string;
  /** Where the opening was seen. */
  foundVia?: string;
  careersUrl?: string;
  emails: string[];
  contactSource: ContactSource;
  /** Applicant tracking system detected on the careers page, if any. */
  ats?: string;
  /** Which of the searched roles surfaced this company. */
  matchedRole?: string;
  /** Anything that failed while researching this company. */
  notes?: string[];
}

export interface HuntReport {
  config: HuntConfig;
  role: string;
  /** Queries the agent actually ran on Google. */
  searchQueries: string[];
  /** Pages the grounded search cited. */
  sources: { title: string; uri: string }[];
  companies: HuntedCompany[];
  startedAt: Date;
  finishedAt?: Date;
}
