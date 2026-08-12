import type { Binary, Collection, ObjectId } from "mongodb";
import { getDb } from "./mongo";

/**
 * Collection shapes.
 *
 * MongoDB is schemaless, which is a liberty, not a licence — these interfaces are
 * the schema, enforced at the TypeScript boundary so every write goes through a
 * known shape instead of drifting document to document.
 */

export interface ProjectEntry {
  name: string;
  description?: string;
  url?: string;
  tech?: string[];
}

export interface SocialLinks {
  linkedin?: string;
  github?: string;
  portfolio?: string;
  twitter?: string;
  other?: string[];
}

/** Everything the user reviewed and confirmed. Edited values win over parsed ones. */
export interface UserProfile {
  fullName?: string;
  headline?: string;
  email?: string;
  phone?: string;
  country?: string;
  countryCode?: string;
  /** How countryCode was set, so we don't overwrite a manual choice. */
  countrySource?: "ip" | "manual" | "resume";
  seniority?: string;
  yearsExperience?: number;
  targetRoles?: string[];
  skills?: string[];
  domains?: string[];
  highlights?: string[];
  projects?: ProjectEntry[];
  social?: SocialLinks;
  updatedAt?: Date;
}

export interface ResumeFile {
  filename: string;
  mimeType: string;
  size: number;
  /** The original document, so the user can re-download exactly what they sent. */
  data: Binary;
  uploadedAt: Date;
}

export interface UserDoc {
  _id?: ObjectId;
  /** Stored lowercased so lookups are case-insensitive. */
  email: string;
  /** Stored lowercased; what the user can log in with instead of their email. */
  username: string;
  /** scrypt hash, stored as `salt:hash`. Never the raw password. */
  passwordHash: string;
  createdAt: Date;
  lastLoginAt: Date;

  profile?: UserProfile;
  resume?: ResumeFile;
  /** Raw text extracted from the resume, kept for drafting context. */
  resumeText?: string;
  resumeAddedAt?: Date;

  /** Running total in USD of what this user has been charged. */
  hunterUsageUsd?: number;
  hunterSummary?: HunterSummary;
  hunterJob?: HunterJob;
  huntJob?: HuntJob;
}

/** Progress of a hunt run. Same pattern as HunterJob — stored, not in memory. */
export interface HuntJob {
  status: "running" | "done" | "failed";
  stage: string;
  progress: number;
  found: number;
  huntId?: string;
  startedAt: Date;
  finishedAt?: Date;
  error?: string;
}

/**
 * Progress of a briefing run.
 *
 * Held in the database rather than in memory so the job outlives the request
 * that started it: the user can navigate away, reload, or open another tab and
 * still see where it got to.
 */
export interface HunterJob {
  status: "running" | "done" | "failed";
  /** Human-readable description of the current stage. */
  stage: string;
  /** 0-100. */
  progress: number;
  sourcesFound: number;
  startedAt: Date;
  finishedAt?: Date;
  error?: string;
}

export interface HunterSummary {
  headline?: string;
  summary: string;
  technicalDepth?: string;
  projectAnalysis?: {
    name: string; whatItIs: string; technical: string; evidence: string; signal: string;
  }[];
  strengths: string[];
  differentiators?: string[];
  gaps: string[];
  positioning: string;
  suggestedRoles: string[];
  targetCompanies?: string[];
  searchKeywords?: string[];
  sourcesReviewed: string[];
  sourcesUnreachable?: string[];
  generatedAt: Date;
}

/**
 * One row per model call — an append-only ledger.
 *
 * We keep raw and charged separately so margin is auditable, and record the
 * token counts so any disputed line can be recomputed from first principles
 * rather than trusted.
 */
export interface UsageEventDoc {
  _id?: ObjectId;
  userId: ObjectId;
  purpose: "resume-parse" | "hunter-summary" | "outreach-draft" | "other";
  model: string;
  /** Which transport served the call — vertex or gemini. */
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  rawCostUsd: number;
  chargedUsd: number;
  markup: number;
  createdAt: Date;
}

export interface HuntDoc {
  _id?: ObjectId;
  userId: ObjectId;
  /** All roles searched, joined for display. */
  role: string;
  roles?: string[];
  config: unknown;
  /** The queries the agent actually ran on Google. */
  searchQueries: string[];
  /** Pages the grounded search cited. */
  sources: { title: string; uri: string }[];
  /** Researched companies, each carrying the evidence for its contact. */
  companies: unknown[];
  totalDiscovered: number;
  createdAt: Date;
}

export const users = async (): Promise<Collection<UserDoc>> =>
  (await getDb()).collection<UserDoc>("users");

export const hunts = async (): Promise<Collection<HuntDoc>> =>
  (await getDb()).collection<HuntDoc>("hunts");

export const usageEvents = async (): Promise<Collection<UsageEventDoc>> =>
  (await getDb()).collection<UsageEventDoc>("usageEvents");

/**
 * Creates indexes once per process.
 *
 * The unique indexes are the real guard against duplicate accounts — two
 * concurrent signups can both pass an application-level "does this exist?"
 * check, and only the database can actually settle the race.
 */
let ensured: Promise<void> | undefined;

export function ensureIndexes(): Promise<void> {
  ensured ??= (async () => {
    const db = await getDb();
    await db.collection<UserDoc>("users").createIndex({ email: 1 }, { unique: true });
    await db.collection<UserDoc>("users").createIndex({ username: 1 }, { unique: true });
    await db.collection<HuntDoc>("hunts").createIndex({ userId: 1, createdAt: -1 });
    await db.collection<UsageEventDoc>("usageEvents").createIndex({ userId: 1, createdAt: -1 });
  })();
  return ensured;
}
