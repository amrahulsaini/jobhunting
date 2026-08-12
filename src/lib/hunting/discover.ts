import { generate, generateJson, MODELS, type TokenUsage } from "@/lib/gemini";
import type { HuntConfig, HuntedCompany } from "./types";
import type { HunterSummary, UserProfile } from "@/lib/db/collections";

/**
 * Finds companies that are actually hiring, using live Google results.
 *
 * Two calls on purpose. The first is grounded in Google Search and returns
 * prose — search grounding and a forced JSON schema cannot be combined, and
 * asking a grounded call for raw JSON tends to produce malformed output. The
 * second call is a cheap, ungrounded pass that turns that prose into structured
 * records. Splitting it keeps both steps reliable.
 */

const DISCOVERY_SYSTEM = `You are Hunter, an agent searching the live web for companies
that are hiring right now.

Rules:
- Search for CURRENT openings. Ignore roles that look filled or long expired.
- Prefer the company's own careers page over an aggregator listing.
- Name real companies with real websites. Never invent a company or a domain.
- If you cannot find enough genuine openings, return fewer. A short honest list
  beats a padded one.
- For each company report: company name, official website domain, the role
  title seen, employment type, location, and where you saw it.
- COUNTRY IS A HARD REQUIREMENT. Only return companies whose role is based in
  the requested countries, and state that country explicitly for each one. A
  company from anywhere else is a wrong answer, even if it is a better fit.
- For a remote role, give the country the listing is tied to, not "Remote".`;

const STRUCTURE_SCHEMA = {
  type: "object",
  properties: {
    companies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          domain: { type: "string", description: "Bare domain, e.g. stripe.com" },
          roleTitle: { type: "string" },
          roleType: { type: "string" },
          location: { type: "string" },
          country: {
            type: "string",
            description: "Country the role is based in, spelled in full, e.g. Germany",
          },
          reason: { type: "string", description: "Why this fits the candidate" },
          foundVia: { type: "string", description: "Where the opening was seen" },
        },
        required: ["name"],
      },
    },
  },
  required: ["companies"],
} as const;

function countryPhrase(config: HuntConfig, ownCountry?: string): string {
  if (config.scope === "global") return "anywhere in the world (remote-friendly preferred)";
  if (config.scope === "own") return ownCountry ? `in ${ownCountry}` : "in the candidate's country";
  return config.countries.length
    ? `in ${config.countries.join(", ")}`
    : "anywhere in the world";
}

/** The countries a hunt is actually restricted to, or null when unrestricted. */
export function allowedCountries(config: HuntConfig, ownCountry?: string): string[] | null {
  if (config.scope === "global") return null;
  if (config.scope === "own") return ownCountry ? [ownCountry] : null;
  return config.countries.length ? config.countries : null;
}

/** Common shorthands, so "USA" and "United States" are not treated as different. */
const ALIASES: Record<string, string> = {
  usa: "united states", us: "united states", "u.s.": "united states",
  "u.s.a.": "united states", america: "united states",
  uk: "united kingdom", "u.k.": "united kingdom", britain: "united kingdom",
  england: "united kingdom", scotland: "united kingdom", wales: "united kingdom",
  uae: "united arab emirates", "south korea": "korea", "republic of korea": "korea",
  holland: "netherlands", bharat: "india",
};

const normalise = (value: string): string => {
  const clean = value.trim().toLowerCase().replace(/[.]/g, "");
  return ALIASES[clean] ?? clean;
};

/**
 * Decides whether a discovered company really sits in one of the wanted
 * countries.
 *
 * The model is told which countries to search, but that is only an instruction —
 * nothing stops it returning a company from somewhere else. So every record is
 * checked against the requested list before it reaches the user, using both the
 * country field and the free-text location.
 *
 * Remote roles are kept when the listing ties them to a wanted country;
 * a bare "Remote" with no country attached is not enough.
 */
export function matchesCountry(
  company: { country?: string; location?: string },
  allowed: string[]
): { ok: boolean; why: string } {
  const wanted = allowed.map(normalise);
  const stated = [company.country, company.location].filter(Boolean).map(String);

  if (!stated.length) {
    return { ok: false, why: "No location was reported for this company." };
  }

  const haystack = normalise(stated.join(" · "));

  for (const [i, target] of wanted.entries()) {
    // Substring both ways: "Bengaluru, India" contains "india", and a stated
    // "India" matches a wanted "India".
    if (haystack.includes(target) || target.includes(haystack)) {
      return { ok: true, why: `Location "${stated.join(", ")}" matches ${allowed[i]}.` };
    }
  }

  return {
    ok: false,
    why: `Location "${stated.join(", ")}" is not in ${allowed.join(", ")}.`,
  };
}

/** Runs one grounded search for a single role. */
async function searchForRole({
  profile,
  briefing,
  config,
  role,
  target,
}: {
  profile: UserProfile;
  briefing?: HunterSummary;
  config: HuntConfig;
  role: string;
  target: number;
}): Promise<{
  companies: HuntedCompany[];
  searchQueries: string[];
  sources: { title: string; uri: string }[];
  usages: TokenUsage[];
}> {
  const where = countryPhrase(config, profile.country);
  const types = config.roleTypes.length ? config.roleTypes.join(", ") : "full-time";

  const keywords = briefing?.searchKeywords?.length
    ? briefing.searchKeywords.join(", ")
    : (profile.skills ?? []).slice(0, 8).join(", ");

  const prompt = `Find ${target} companies hiring for "${role}" ${where}.
Employment types wanted: ${types}.

CANDIDATE CONTEXT (use it to judge fit, do not repeat it back):
${briefing?.headline ? `Profile: ${briefing.headline}` : ""}
Seniority: ${profile.seniority ?? "not specified"} · ${profile.yearsExperience ?? "?"} years
Core skills: ${keywords}
${briefing?.positioning ? `Positioning: ${briefing.positioning}` : ""}

Search the web now and list what you actually find. For each company give:
name, official website domain, role title, employment type, location, where you
saw the opening, and one line on why it suits this candidate.`;

  const search = await generate({
    model: MODELS.briefing,
    parts: [{ text: prompt }],
    system: DISCOVERY_SYSTEM,
    tools: [{ googleSearch: {} }],
    maxOutputTokens: 8192,
  });

  const structured = await generateJson<{ companies: HuntedCompany[] }>({
    model: MODELS.parse,
    parts: [
      {
        text: `Convert this into structured records. Include only companies that are
actually named with a real website. Drop anything vague or without a company name.

${search.text}`,
      },
    ],
    schema: STRUCTURE_SCHEMA as unknown as Record<string, unknown>,
    maxOutputTokens: 8192,
  });

  const companies: HuntedCompany[] = (structured.data.companies ?? [])
    .filter(entry => entry.name)
    .map(entry => {
      const domain = entry.domain
        ?.trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0];

      return {
        ...entry,
        domain,
        website: domain ? `https://${domain}` : undefined,
        matchedRole: role,
        emails: [],
        contactSource: "none" as const,
      };
    });

  return {
    companies,
    searchQueries: search.searchQueries ?? [],
    sources: search.sources ?? [],
    usages: [search.usage, structured.usage],
  };
}

/**
 * Searches every selected role and merges the results.
 *
 * Each role gets its own grounded search rather than one combined query,
 * because a search for "Backend Engineer" surfaces a genuinely different set of
 * companies than "Full Stack Engineer" — combining them into one prompt loses
 * that breadth.
 */
export async function discoverCompanies({
  profile,
  briefing,
  config,
  roles,
  onProgress,
}: {
  profile: UserProfile;
  briefing?: HunterSummary;
  config: HuntConfig;
  roles: string[];
  onProgress?: (role: string, index: number, total: number) => void;
}): Promise<{
  companies: HuntedCompany[];
  /** Companies dropped for sitting outside the requested countries. */
  rejected: { name: string; location?: string; why: string }[];
  searchQueries: string[];
  sources: { title: string; uri: string }[];
  usages: TokenUsage[];
}> {
  // Cap the fan-out: each role is a paid grounded call plus a structuring call.
  const list = roles.filter(Boolean).slice(0, 6);

  // Split the target across roles, with a floor so a single role still returns
  // a useful spread.
  const perRole = Math.max(4, Math.ceil((config.matches * 2 + 3) / list.length));

  const searchQueries: string[] = [];
  const sources: { title: string; uri: string }[] = [];
  const usages: TokenUsage[] = [];
  const seen = new Set<string>();
  const companies: HuntedCompany[] = [];
  const rejected: { name: string; location?: string; why: string }[] = [];

  // Null means the user asked for no country restriction.
  const allowed = allowedCountries(config, profile.country);

  for (const [index, role] of list.entries()) {
    onProgress?.(role, index, list.length);

    try {
      const result = await searchForRole({ profile, briefing, config, role, target: perRole });

      searchQueries.push(...result.searchQueries);
      sources.push(...result.sources);
      usages.push(...result.usages);

      // The same company often surfaces under several role searches.
      for (const company of result.companies) {
        const key =
          company.domain || company.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (seen.has(key)) continue;
        seen.add(key);

        // Enforce the country choice rather than trusting the prompt.
        if (allowed) {
          const verdict = matchesCountry(company, allowed);
          if (!verdict.ok) {
            rejected.push({
              name: company.name,
              location: company.location ?? company.country,
              why: verdict.why,
            });
            continue;
          }
        }

        companies.push(company);
      }
    } catch {
      // One failed role search should not sink the whole hunt.
    }
  }

  return {
    companies,
    rejected,
    searchQueries: [...new Set(searchQueries)],
    sources: sources.filter(
      (s, i, all) => all.findIndex(o => o.uri === s.uri) === i
    ),
    usages,
  };
}
