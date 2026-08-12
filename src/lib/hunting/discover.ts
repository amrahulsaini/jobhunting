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
  title seen, employment type, location, and where you saw it.`;

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
        companies.push(company);
      }
    } catch {
      // One failed role search should not sink the whole hunt.
    }
  }

  return {
    companies,
    searchQueries: [...new Set(searchQueries)],
    sources: sources.filter(
      (s, i, all) => all.findIndex(o => o.uri === s.uri) === i
    ),
    usages,
  };
}
