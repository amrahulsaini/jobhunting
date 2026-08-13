import { generateJson, MODELS, type TokenUsage } from "@/lib/gemini";
import type { EmailSettings, HunterSummary, UserProfile } from "@/lib/db/collections";
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
  /** Gmail message id, once actually sent. */
  sentMessageId?: string;
  createdAt: Date;
}

export const DEFAULT_SETTINGS: EmailSettings = {
  tone: "cold-intro",
  length: "standard",
  callToAction: "either",
  includeProjects: true,
  includePortfolio: true,
  includeGithub: true,
  attachResume: true,
};

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

const LENGTH_GUIDE: Record<EmailSettings["length"], string> = {
  short: "3 short paragraphs, 90-130 words total.",
  standard: "4 paragraphs, 170-240 words total.",
  detailed: "5 paragraphs, 260-340 words total.",
};

const TONE_GUIDE: Record<EmailSettings["tone"], string> = {
  "cold-intro":
    "A genuine cold introduction from someone who has not met them. Confident and warm, never apologetic for writing.",
  "warm-direct": "Direct and familiar, as if to a peer. Skip preamble entirely.",
  formal: "Professional and measured, suitable for a large or traditional employer.",
  concise: "Extremely economical. Every sentence must earn its place.",
};

const CTA_GUIDE: Record<EmailSettings["callToAction"], string> = {
  chat: "Close by proposing a short call — offer a specific, easy next step.",
  meet: "Close by proposing a meeting, in person or video, to discuss further.",
  either:
    "Close by proposing a short chat or a meeting, whichever suits them, so you can discuss the role properly.",
  none: "Close by inviting a reply, without proposing a call.",
};

/**
 * The structure below is the fix for thin, one-paragraph output.
 *
 * Left to itself the model writes a single dense block. Naming the job of each
 * paragraph is what produces something a person will actually read.
 */
const SYSTEM = `You write outreach emails for a job seeker approaching a company directly.

STRUCTURE — follow it exactly, with a blank line between paragraphs:

1. OPENING: why you are writing to THIS company, referencing the specific role
   and something real about them. Never "I came across your company".
2. WHAT YOU BRING: the candidate's most relevant experience for this role,
   quoting real figures from their accomplishments. This is the strongest
   paragraph — be concrete, not adjectival.
3. EVIDENCE: point at their actual work — named projects, what was built, and
   the links supplied. Only projects and links given to you.
4. FIT: why this candidate and this company specifically, tied to what the
   role needs.
5. CLOSE: the call to action, followed by the sign-off.

Merge paragraphs 3 and 4 if the length target is short.

HARD RULES:
- Use ONLY facts given to you. Never invent an employer, metric, product,
  funding round, mutual connection, or anything about the company not in the
  brief. A wrong detail about the employer is worse than a plain email.
- Write links as bare URLs on their own line where they belong. Do not invent
  a URL — use only those supplied.
- No "I hope this email finds you well", no flattery, no invented urgency,
  no "I am writing to express my interest".
- Plain text only. No markdown, no bold, no bullet characters.
- Address the reader as "you". First person throughout.
- Do NOT write a sign-off name if a signature is supplied — it is appended
  separately.
- In "warnings", list what a human should verify before sending, and say
  plainly where the brief was too thin to be specific.`;

export async function draftForCompany({
  company,
  profile,
  briefing,
  settings = DEFAULT_SETTINGS,
}: {
  company: EnrichResult;
  profile: UserProfile;
  briefing?: HunterSummary;
  settings?: EmailSettings;
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
    company.visited?.find(v => v.ok && v.snapshot)?.snapshot &&
      `FROM THEIR SITE: ${company.visited.find(v => v.ok && v.snapshot)!.snapshot}`,
  ]
    .filter(Boolean)
    .join("\n");

  // Links are opt-in, so the email only ever contains what the user allows.
  const links: string[] = [];
  if (settings.includePortfolio && profile.social?.portfolio) {
    links.push(`Portfolio: ${profile.social.portfolio}`);
  }
  if (settings.includeGithub && profile.social?.github) {
    links.push(`GitHub: ${profile.social.github}`);
  }
  if (settings.includeProjects) {
    for (const p of (profile.projects ?? []).slice(0, 4)) {
      links.push(
        `${p.name}${p.tech?.length ? ` (${p.tech.join(", ")})` : ""}${p.url ? ` — ${p.url}` : ""}${
          p.description ? `: ${p.description}` : ""
        }`
      );
    }
  }

  const candidate = [
    profile.fullName && `NAME: ${profile.fullName}`,
    profile.headline && `HEADLINE: ${profile.headline}`,
    profile.seniority && `SENIORITY: ${profile.seniority}`,
    profile.yearsExperience != null && `YEARS OF EXPERIENCE: ${profile.yearsExperience}`,
    profile.skills?.length && `SKILLS: ${profile.skills.slice(0, 20).join(", ")}`,
    profile.domains?.length && `DOMAINS: ${profile.domains.join(", ")}`,
    profile.highlights?.length && `ACCOMPLISHMENTS:\n- ${profile.highlights.join("\n- ")}`,
    briefing?.positioning && `HOW TO PITCH THEM: ${briefing.positioning}`,
    briefing?.differentiators?.length &&
      `WHAT SETS THEM APART:\n- ${briefing.differentiators.join("\n- ")}`,
    links.length && `LINKS AND PROJECTS TO REFERENCE:\n${links.join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const instructions = [
    `TONE: ${TONE_GUIDE[settings.tone]}`,
    `LENGTH: ${LENGTH_GUIDE[settings.length]}`,
    `CLOSING: ${CTA_GUIDE[settings.callToAction]}`,
    links.length
      ? "Include the supplied links in the evidence paragraph, each on its own line."
      : "No links were supplied — do not invent any.",
    settings.attachResume
      ? "A resume is attached to this email; refer to it naturally in the close."
      : "No resume is attached; do not mention an attachment.",
    settings.signature ? "Do not write a sign-off name — a signature is appended." : "",
    // The user's own words come last so they override the defaults above.
    settings.customInstructions?.trim() &&
      `THE CANDIDATE'S OWN INSTRUCTIONS — these override anything above:\n${settings.customInstructions.trim()}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { data, usage } = await generateJson<{
    subject: string;
    body: string;
    rationale: string;
    warnings: string[];
  }>({
    model: MODELS.draft,
    parts: [
      {
        text: `${employer}\n\n---\n\nCANDIDATE:\n${candidate}\n\n---\n\nINSTRUCTIONS:\n${instructions}\n\nWrite the email.`,
      },
    ],
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

  // The signature is appended verbatim so the model can never reword it.
  const body = settings.signature?.trim()
    ? `${data.body.trimEnd()}\n\n${settings.signature.trim()}`
    : data.body;

  return {
    draft: {
      key: company.domain || company.name,
      company: company.name,
      roleTitle: company.roleTitle,
      to: company.emails[0],
      applyUrl: company.careersUrl,
      subject: data.subject,
      body,
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
  settings: EmailSettings = DEFAULT_SETTINGS,
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
          const result = await draftForCompany({ company, profile, briefing, settings });
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
