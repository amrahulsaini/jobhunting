import { generateJson, MODELS, type GeneratePart, type TokenUsage } from "@/lib/gemini";

export interface ParsedProject {
  name: string;
  description?: string;
  url?: string;
  tech?: string[];
}

export interface ResumeProfile {
  fullName?: string;
  email?: string;
  phone?: string;
  headline?: string;
  location?: string;
  countryCode?: string;
  yearsExperience?: number;
  seniority?: "intern" | "junior" | "mid" | "senior" | "staff" | "principal" | "lead";
  targetRoles: string[];
  skills: string[];
  domains: string[];
  highlights: string[];
  projects: ParsedProject[];
  social: {
    linkedin?: string;
    github?: string;
    portfolio?: string;
    twitter?: string;
  };
}

const SCHEMA = {
  type: "object",
  properties: {
    fullName: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    headline: { type: "string" },
    location: { type: "string" },
    countryCode: { type: "string", description: "ISO 3166-1 alpha-2, e.g. IN, US, GB" },
    yearsExperience: { type: "number" },
    seniority: {
      type: "string",
      enum: ["intern", "junior", "mid", "senior", "staff", "principal", "lead"],
    },
    targetRoles: { type: "array", items: { type: "string" } },
    skills: { type: "array", items: { type: "string" } },
    domains: { type: "array", items: { type: "string" } },
    highlights: { type: "array", items: { type: "string" } },
    projects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          url: { type: "string" },
          tech: { type: "array", items: { type: "string" } },
        },
        required: ["name"],
      },
    },
    social: {
      type: "object",
      properties: {
        linkedin: { type: "string" },
        github: { type: "string" },
        portfolio: { type: "string" },
        twitter: { type: "string" },
      },
    },
  },
  required: ["targetRoles", "skills", "domains", "highlights", "projects", "social"],
} as const;

const SYSTEM = `You extract structured facts from a resume.

Report ONLY what the document actually supports. Never invent an employer, a
credential, a date, a metric, a URL or a contact detail. Omit a field rather
than guessing at it — a missing value is useful, a fabricated one is harmful
because the user will send it to a real employer.

Specifics:
- "highlights": 3-6 concrete accomplishments, each keeping the real figure or
  system named in the resume, phrased so they can be cited in an outreach email.
- "targetRoles": job titles this person should realistically apply for.
- "skills": technical skills only — languages, frameworks, databases, tools,
  platforms. Not soft skills.
- "projects": personal or professional projects named in the resume, with the
  URL only if one is actually printed.
- "social": full URLs. Normalise bare handles into URLs only when the platform
  is unambiguous (e.g. "github.com/foo" -> "https://github.com/foo").
- "countryCode": infer from the address or phone country code if present,
  otherwise omit it.`;

/**
 * Parses a resume into structured data.
 *
 * Gemini reads the PDF/DOCX bytes directly, so there is no separate text
 * extraction step to lose layout — two-column resumes survive this intact.
 */
export async function parseResume(
  file: { data: string; mimeType: string } | { text: string },
  extraContext?: string
): Promise<{ profile: ResumeProfile; usage: TokenUsage }> {
  const parts: GeneratePart[] = "text" in file
    ? [{ text: `Resume:\n\n${file.text}` }]
    : [{ inlineData: { mimeType: file.mimeType, data: file.data } }];

  if (extraContext) {
    parts.push({ text: `Additional context supplied by the candidate:\n${extraContext}` });
  }
  parts.push({ text: "Extract the structured profile." });

  const { data, usage } = await generateJson<ResumeProfile>({
    model: MODELS.parse,
    parts,
    schema: SCHEMA as unknown as Record<string, unknown>,
    system: SYSTEM,
    maxOutputTokens: 8192,
  });

  // The model can omit an array despite the schema; downstream code indexes
  // these directly, so normalise before returning.
  return {
    profile: {
      ...data,
      targetRoles: data.targetRoles ?? [],
      skills: data.skills ?? [],
      domains: data.domains ?? [],
      highlights: data.highlights ?? [],
      projects: data.projects ?? [],
      social: data.social ?? {},
    },
    usage,
  };
}

/** Extracts plain text, kept alongside the file for later drafting context. */
export async function extractResumeText(file: {
  data: string;
  mimeType: string;
}): Promise<{ text: string; usage: TokenUsage }> {
  const { text, usage } = await import("@/lib/gemini").then(m =>
    m.generate({
      model: MODELS.parse,
      parts: [
        { inlineData: { mimeType: file.mimeType, data: file.data } },
        { text: "Transcribe this document as plain text. Preserve headings and bullet structure. Output only the text." },
      ],
      maxOutputTokens: 8192,
    })
  );
  return { text, usage };
}
