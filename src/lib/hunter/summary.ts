import { generateJson, MODELS, type TokenUsage } from "@/lib/gemini";
import { gatherEvidence, type FetchedSource, type ProgressFn } from "./crawl";
import type { UserProfile } from "@/lib/db/collections";

/**
 * The Hunter briefing.
 *
 * Before writing anything it reads everything the candidate pointed at —
 * GitHub repositories and their READMEs, portfolio pages and their sub-pages.
 * A resume undersells almost everyone; the code they actually shipped is the
 * stronger evidence. What cannot be reached is reported as unreachable rather
 * than filled in with assumptions.
 */

export interface ProjectAnalysis {
  name: string;
  whatItIs: string;
  technical: string;
  evidence: string;
  signal: string;
}

export interface HunterSummaryResult {
  headline: string;
  summary: string;
  technicalDepth: string;
  projectAnalysis: ProjectAnalysis[];
  strengths: string[];
  differentiators: string[];
  gaps: string[];
  positioning: string;
  suggestedRoles: string[];
  targetCompanies: string[];
  searchKeywords: string[];
  sourcesReviewed: string[];
  sourcesUnreachable: string[];
}

const SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "One line describing this candidate to a hiring manager" },
    summary: { type: "string", description: "12-18 sentences. The full briefing." },
    technicalDepth: { type: "string", description: "4-8 sentences on what they can genuinely build, and to what level" },
    projectAnalysis: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          whatItIs: { type: "string" },
          technical: { type: "string", description: "Architecture, stack and engineering decisions visible in the evidence" },
          evidence: { type: "string", description: "What in the fetched material supports this — stars, README detail, live site" },
          signal: { type: "string", description: "What this proves about them as an engineer" },
        },
        required: ["name", "whatItIs", "technical", "evidence", "signal"],
      },
    },
    strengths: { type: "array", items: { type: "string" } },
    differentiators: { type: "array", items: { type: "string" }, description: "What sets them apart from equally-senior peers" },
    gaps: { type: "array", items: { type: "string" } },
    positioning: { type: "string", description: "4-6 sentences on how to pitch them" },
    suggestedRoles: { type: "array", items: { type: "string" } },
    targetCompanies: { type: "array", items: { type: "string" }, description: "Types of company, with reasoning" },
    searchKeywords: { type: "array", items: { type: "string" }, description: "Terms to search job boards with" },
  },
  required: [
    "headline", "summary", "technicalDepth", "projectAnalysis", "strengths",
    "differentiators", "gaps", "positioning", "suggestedRoles", "targetCompanies", "searchKeywords",
  ],
} as const;

const SYSTEM = `You are Hunter, an agent that briefs itself on a candidate in
depth before searching the job market on their behalf.

You are writing for the agent that acts next, not for the candidate. Be
specific, technical and unsentimental. Length is warranted here — this briefing
is the basis for every search and every email that follows, so thin output is a
failure.

Evidence rules:
- Use ONLY the supplied material: the resume, the profile the candidate
  confirmed, and the fetched page and repository content. Never invent an
  employer, metric, project, technology or credential.
- The fetched material is the strongest evidence you have. Where a repository
  README or portfolio page reveals something the resume omitted, say so
  explicitly and cite it.
- For every project in the evidence, analyse it properly: what it does, how it
  is built, what the code and README reveal about their engineering judgement,
  and what traction it has. Do not summarise a project in one line.
- "gaps" must be honest. A claimed skill with no supporting evidence, a stale
  repository, a thin README, no tests, an unexplained break — name it. The
  candidate is better served by an accurate read than a flattering one. Phrase
  each as an actionable observation.
- "differentiators" should distinguish them from other engineers at the same
  level. If nothing genuinely distinguishes them, say that instead of padding.
- Where evidence is thin or a source could not be fetched, state the limitation
  rather than compensating with generic praise.`;

function buildEvidenceBlock(sources: FetchedSource[]): string {
  if (!sources.length) return "(No external sources could be fetched.)";

  // Repositories carry the most signal, so they lead and get the most room.
  const order = { "github-repo": 0, "github-profile": 1, page: 2 } as const;
  return [...sources]
    .sort((a, b) => order[a.kind] - order[b.kind])
    .map(s => `=== [${s.kind}] ${s.title ?? s.url}\nURL: ${s.url}\n${s.content}`)
    .join("\n\n");
}

export async function buildHunterSummary(
  profile: UserProfile,
  resumeText?: string,
  onProgress: ProgressFn = () => {}
): Promise<{ result: HunterSummaryResult; usage: TokenUsage }> {
  const links = [
    profile.social?.github,
    profile.social?.portfolio,
    profile.social?.twitter,
    profile.social?.linkedin,
    ...(profile.social?.other ?? []),
    ...(profile.projects ?? []).map(p => p.url),
  ].filter((v): v is string => Boolean(v));

  onProgress("Collecting your links", 5, 0);
  const sources = await gatherEvidence(links, onProgress);
  const reached = new Set(sources.map(s => new URL(s.url).hostname.replace(/^www\./, "")));
  const unreachable = [...new Set(links)].filter(l => {
    try {
      return !reached.has(new URL(l.startsWith("http") ? l : `https://${l}`).hostname.replace(/^www\./, ""));
    } catch {
      return true;
    }
  });

  const confirmed = [
    profile.fullName && `Name: ${profile.fullName}`,
    profile.headline && `Headline: ${profile.headline}`,
    profile.seniority && `Seniority: ${profile.seniority}`,
    profile.yearsExperience != null && `Years of experience: ${profile.yearsExperience}`,
    profile.country && `Country: ${profile.country}`,
    profile.targetRoles?.length && `Target roles: ${profile.targetRoles.join(", ")}`,
    profile.skills?.length && `Skills claimed: ${profile.skills.join(", ")}`,
    profile.domains?.length && `Domains: ${profile.domains.join(", ")}`,
    profile.highlights?.length && `Accomplishments:\n- ${profile.highlights.join("\n- ")}`,
    profile.projects?.length &&
      `Projects the candidate listed:\n${profile.projects
        .map(p => `- ${p.name}${p.tech?.length ? ` (${p.tech.join(", ")})` : ""}: ${p.description ?? ""} ${p.url ?? ""}`)
        .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");

  // Repositories and portfolio project pages each deserve their own analysis;
  // a bare profile page is context, not a project.
  const projectCount = sources.filter(s => s.kind === "github-repo").length;

  onProgress("Writing your briefing", 65, sources.length);
  const { data, usage } = await generateJson<HunterSummaryResult>({
    model: MODELS.briefing,
    parts: [
      {
        text:
          `CANDIDATE-CONFIRMED PROFILE:\n${confirmed}\n\n` +
          (resumeText ? `RESUME TEXT:\n${resumeText.slice(0, 15_000)}\n\n` : "") +
          `FETCHED EVIDENCE (${sources.length} sources):\n${buildEvidenceBlock(sources)}\n\n` +
          (unreachable.length ? `COULD NOT FETCH: ${unreachable.join(", ")}\n\n` : "") +
          `Write the full Hunter briefing.\n\n` +
          // Smaller models summarise several repositories into one entry unless
          // the expected count is stated outright, so name it explicitly.
          (projectCount > 0
            ? `The evidence contains ${projectCount} distinct repositories or projects. ` +
              `Produce a SEPARATE projectAnalysis entry for EACH one — ${projectCount} entries, ` +
              `not a combined summary. Analyse each on its own terms.`
            : `Analyse each project in the evidence individually.`),
      },
    ],
    schema: SCHEMA as unknown as Record<string, unknown>,
    system: SYSTEM,
    // A deep briefing needs room; truncation here would cost the whole call.
    maxOutputTokens: 32_768,
  });

  return {
    result: {
      ...data,
      projectAnalysis: data.projectAnalysis ?? [],
      strengths: data.strengths ?? [],
      differentiators: data.differentiators ?? [],
      gaps: data.gaps ?? [],
      suggestedRoles: data.suggestedRoles ?? [],
      targetCompanies: data.targetCompanies ?? [],
      searchKeywords: data.searchKeywords ?? [],
      sourcesReviewed: sources.map(s => s.url),
      sourcesUnreachable: unreachable,
    },
    usage,
  };
}
