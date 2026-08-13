import { generateJson, MODELS, type TokenUsage } from "@/lib/gemini";
import type { HunterSummary, UserProfile } from "@/lib/db/collections";
import type { EnrichResult } from "@/lib/hunting/enrich";

/**
 * Drafts one outreach email per company found by a hunt.
 *
 * Everything the model is given is either the user's own confirmed profile or
 * something the crawler actually read off that company's site. It is never
 * asked to recall facts about a company from training data, because a
 * confidently wrong detail about the employer is worse than a generic email.
 */

export interface CompanyDraft {
  /** Domain, or the name when there is no domain — stable per company. */
  key: string;
  company: string;
  roleTitle?: string;
  /** Where this should be sent, when an address was verified. */
  to?: string;
  /** Set when the company applies through an ATS instead of email. */
  applyUrl?: string;
  subject: string;
  body: string;
  /** Why the agent framed it this way — shown to the user, never sent. */
  rationale: string;
  /** Anything a human should check before sending. */
  warnings: string[];
  approved: boolean;
  sentAt?: Date;
  createdAt: Date;
}

const SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
    rationale: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["subject", "body", "rationale", "warnings"],
} as const;

const SYSTEM = `You write short, specific cold outreach emails for a job seeker.

Hard rules:
- Use ONLY facts given to you. Never invent an employer, a metric, a product,
  a mutual connection, or anything about the company that is not in the brief.
  A wrong detail about the employer is worse than a plain email.
- Reference something concrete about this company and role. If the brief gives
  you nothing concrete, say less rather than inventing enthusiasm.
- 130 words maximum. No "I am writing to express my interest", no flattery,
  no invented urgency, no "I came across your company".
- Plain text, first person, one clear ask: a short conversation.
- Open with why this person fits THIS role, not with their life story.
- Sign off with the candidate's real name only.
- In "warnings", list anything a human should verify before sending, and say so
  plainly where the brief was too thin to be specific.`;

export async function draftForCompany({
  company,
  profile,
  briefing,
}: {
  company: EnrichResult;
  profile: UserProfile;
  briefing?: HunterSummary;
}): Promise<{ draft: CompanyDraft; usage: TokenUsage }> {
  // Only what the crawler verified — no recalled knowledge about the employer.
  const employer = [
    `COMPANY: ${company.name}`,
    company.domain && `WEBSITE: ${company.domain}`,
    company.roleTitle && `ROLE: ${company.roleTitle}`,
    company.roleType && `EMPLOYMENT TYPE: ${company.roleType}`,
    company.location && `LOCATION: ${company.location}`,
    company.reason && `WHY IT SUITS THEM: ${company.reason}`,
    company.ats && `APPLICATIONS RUN THROUGH: ${company.ats}`,
    // A snapshot of the careers page, so the email can cite something real.
    company.visited?.find(v => v.ok && v.snapshot)?.snapshot &&
      `FROM THEIR SITE: ${company.visited.find(v => v.ok && v.snapshot)!.snapshot}`,
  ]
    .filter(Boolean)
    .join("\n");

  const candidate = [
    profile.fullName && `NAME: ${profile.fullName}`,
    profile.headline && `HEADLINE: ${profile.headline}`,
    profile.seniority && `SENIORITY: ${profile.seniority}`,
    profile.yearsExperience != null && `YEARS: ${profile.yearsExperience}`,
    profile.skills?.length && `SKILLS: ${profile.skills.slice(0, 18).join(", ")}`,
    profile.highlights?.length && `ACCOMPLISHMENTS:\n- ${profile.highlights.join("\n- ")}`,
    briefing?.positioning && `HOW TO PITCH THEM: ${briefing.positioning}`,
    profile.social?.github && `GITHUB: ${profile.social.github}`,
    profile.social?.portfolio && `PORTFOLIO: ${profile.social.portfolio}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { data, usage } = await generateJson<Omit<CompanyDraft, "key" | "company" | "approved" | "createdAt" | "to" | "applyUrl" | "roleTitle">>({
    model: MODELS.draft,
    parts: [{ text: `${employer}\n\n---\n\nCANDIDATE:\n${candidate}\n\nWrite the email.` }],
    schema: SCHEMA as unknown as Record<string, unknown>,
    system: SYSTEM,
    maxOutputTokens: 4096,
  });

  const warnings = [...(data.warnings ?? [])];
  if (!company.emails.length) {
    warnings.push(
      company.ats
        ? `No email is published — apply through ${company.ats} and use this text in the application.`
        : "No verified address for this company. Use the careers page, or find a contact yourself."
    );
  }

  return {
    draft: {
      key: company.domain || company.name,
      company: company.name,
      roleTitle: company.roleTitle,
      to: company.emails[0],
      applyUrl: company.careersUrl,
      subject: data.subject,
      body: data.body,
      rationale: data.rationale,
      warnings,
      approved: false,
      createdAt: new Date(),
    },
    usage,
  };
}

/** Drafts for many companies with bounded concurrency. */
export async function draftForCompanies(
  companies: EnrichResult[],
  profile: UserProfile,
  briefing: HunterSummary | undefined,
  onProgress: (done: number, total: number, company: string) => void,
  concurrency = 3
): Promise<{ drafts: CompanyDraft[]; usages: TokenUsage[] }> {
  const drafts: CompanyDraft[] = [];
  const usages: TokenUsage[] = [];
  let index = 0;
  let done = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (index < companies.length) {
        const company = companies[index++];
        onProgress(done, companies.length, company.name);

        try {
          const result = await draftForCompany({ company, profile, briefing });
          drafts.push(result.draft);
          usages.push(result.usage);
        } catch (error) {
          // A failed draft is reported in place rather than dropped, so the
          // count always matches what the user selected.
          drafts.push({
            key: company.domain || company.name,
            company: company.name,
            roleTitle: company.roleTitle,
            to: company.emails[0],
            applyUrl: company.careersUrl,
            subject: "",
            body: "",
            rationale: "",
            warnings: [
              `Could not draft this one: ${error instanceof Error ? error.message : "unknown error"}`,
            ],
            approved: false,
            createdAt: new Date(),
          });
        }
        done++;
      }
    })
  );

  return { drafts, usages };
}
