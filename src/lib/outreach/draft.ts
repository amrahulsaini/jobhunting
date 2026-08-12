import { generateJson, MODELS } from "@/lib/gemini";
import type { ResumeProfile } from "@/lib/resume/parse";
import type { JobPosting } from "@/lib/jobs";
import type { CompanyContact } from "@/lib/contacts/discover";

export interface OutreachDraft {
  jobId: string;
  company: string;
  role: string;
  to?: string;
  subject: string;
  body: string;
  /** Why this candidate fits — shown to the user, not sent. */
  rationale: string;
  /** Claims worth double-checking before sending. */
  warnings: string[];
  /** Always starts false. Nothing sends without an explicit human approval. */
  approved: boolean;
  /** Token cost of producing this draft, for metering. */
  usage?: import("@/lib/gemini").TokenUsage;
  createdAt: string;
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
- Use ONLY facts present in the candidate profile. Never invent an employer,
  a metric, a degree, a years-of-experience figure or a mutual connection.
- Reference something concrete about this specific company or role. If the
  posting gives you nothing concrete, say less rather than inventing enthusiasm.
- 120 words maximum. No flattery, no "I am writing to express my interest",
  no invented urgency.
- Plain text. First person. One clear ask: a short conversation.
- Sign off with the candidate's real name only.
- List in "warnings" anything a human should verify before sending, and any
  place the profile was too thin to be specific.`;

export async function draftOutreach({
  job,
  profile,
  contact,
}: {
  job: JobPosting;
  profile: ResumeProfile;
  contact?: CompanyContact;
}): Promise<OutreachDraft> {
  const brief = [
    `COMPANY: ${job.companyName}`,
    job.companyTagline && `WHAT THEY DO: ${job.companyTagline}`,
    job.companyStage && `STAGE: ${job.companyStage}`,
    `ROLE: ${job.title}`,
    job.location && `LOCATION: ${job.location}`,
    job.description && `POSTING:\n${job.description.slice(0, 2000)}`,
  ].filter(Boolean).join("\n");

  const candidate = [
    profile.fullName && `NAME: ${profile.fullName}`,
    profile.headline && `HEADLINE: ${profile.headline}`,
    profile.seniority && `SENIORITY: ${profile.seniority}`,
    profile.yearsExperience != null && `YEARS: ${profile.yearsExperience}`,
    profile.skills?.length && `SKILLS: ${profile.skills.join(", ")}`,
    profile.domains?.length && `DOMAINS: ${profile.domains.join(", ")}`,
    profile.highlights?.length && `ACCOMPLISHMENTS:\n- ${profile.highlights.join("\n- ")}`,
    [profile.social?.github, profile.social?.portfolio, profile.social?.linkedin].filter(Boolean).length &&
      `LINKS: ${[profile.social?.github, profile.social?.portfolio, profile.social?.linkedin].filter(Boolean).join(" ")}`,
  ].filter(Boolean).join("\n");

  const { data: result, usage } = await generateJson<Omit<OutreachDraft, "jobId" | "company" | "role" | "approved" | "createdAt" | "to" | "usage">>({
    model: MODELS.draft,
    parts: [{ text: `${brief}\n\n---\n\nCANDIDATE:\n${candidate}\n\nWrite the outreach email.` }],
    schema: SCHEMA as unknown as Record<string, unknown>,
    system: SYSTEM,
  });

  return {
    jobId: job.id,
    company: job.companyName,
    role: job.title,
    to: contact?.kind === "published-email" ? contact.email : undefined,
    subject: result.subject,
    body: result.body,
    rationale: result.rationale,
    warnings: [
      ...result.warnings,
      ...(contact?.kind === "ats-apply"
        ? ["This company accepts applications through its ATS — apply there rather than emailing."]
        : []),
      ...(!contact?.email && contact?.kind !== "ats-apply"
        ? ["No published address found; this draft has no verified recipient yet."]
        : []),
    ],
    approved: false,
    createdAt: new Date().toISOString(),
    usage,
  };
}

/**
 * Batches drafts with bounded concurrency.
 *
 * Note the deliberate absence of a send function. Drafts are generated and
 * returned for review; delivery stays a separate, explicitly approved step, so
 * a bug here can never turn into a few hundred emails nobody read.
 */
export async function draftBatch(
  items: { job: JobPosting; contact?: CompanyContact }[],
  profile: ResumeProfile,
  concurrency = 3
): Promise<OutreachDraft[]> {
  const out: OutreachDraft[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < items.length) {
        const item = items[i++];
        try {
          out.push(await draftOutreach({ job: item.job, profile, contact: item.contact }));
        } catch (error) {
          out.push({
            jobId: item.job.id,
            company: item.job.companyName,
            role: item.job.title,
            subject: "",
            body: "",
            rationale: "",
            warnings: [`Draft failed: ${error instanceof Error ? error.message : "unknown error"}`],
            approved: false,
            createdAt: new Date().toISOString(),
          });
        }
      }
    })
  );
  return out;
}
