import { BOT_UA, isAllowed } from "@/lib/jobs/http";
import type { ContactSource, HuntedCompany } from "./types";

/**
 * Turns a company name + domain into a verified contact.
 *
 * The hard rule here: **no email is ever produced by the model.** Every address
 * is extracted with a regex from HTML we actually fetched, and is stored with
 * the exact URL it came from, the HTTP status, a timestamp, and a snippet of
 * surrounding text. An address nobody published is worse than no address — it
 * bounces, and repeated bounces get the sender's domain flagged.
 *
 * Guessing patterns like first.last@company.com is deliberately not implemented.
 */

const TIMEOUT = 12_000;

/**
 * Paths worth trying, interleaved by likelihood rather than grouped.
 *
 * Careers and contact pages alternate on purpose: contact pages are where a
 * published address usually lives, so listing every careers variant first meant
 * the attempt budget was exhausted before /contact was ever opened — which is
 * exactly how we missed a real address on fareharbor.com.
 *
 * Localised paths are included because a German or Dutch company publishes
 * under /kontakt or /vacatures, not /contact.
 */
const CAREERS_PATHS = [
  "/careers", "/contact", "/jobs", "/contact-us",
  "/careers/", "/kontakt", "/about/contact", "/join-us",
  "/company/careers", "/karriere", "/vacatures", "/work-with-us",
  "/about/careers", "/contacto", "/about-us/contact", "/impressum",
];

const EMAIL_RX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/**
 * Role addresses only. A personal inbox scraped off an about page is not fair
 * game for cold outreach, and filtering here is what keeps this defensible.
 */
const ROLE_PREFIX =
  /^(careers?|jobs?|hiring|recruit(ing|ment)?|talent|people|hr|work|apply|join|team|hello|hey|contact|info|admin|office|enquir(y|ies)|inquiries|support)@/i;

const JUNK = /\.(png|jpe?g|svg|webp|gif|css|js)$/i;
const PLACEHOLDER = /(example|yourdomain|domain|email|sentry|wixpress|@2x|test)\./i;

export interface EmailEvidence {
  email: string;
  /** The exact page the address was read from. */
  sourceUrl: string;
  httpStatus: number;
  /** Text around the address, so the user can see the context themselves. */
  snippet: string;
  /** True when it came from a mailto: link rather than loose text. */
  fromMailto: boolean;
  capturedAt: string;
}

export interface PageVisit {
  url: string;
  status: number;
  ok: boolean;
  /** First part of the readable text, kept as a snapshot of what we saw. */
  snapshot?: string;
  error?: string;
}

async function fetchPage(url: string): Promise<{ html: string; visit: PageVisit }> {
  if (!(await isAllowed(url))) {
    return { html: "", visit: { url, status: 0, ok: false, error: "blocked by robots.txt" } };
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BOT_UA },
      signal: AbortSignal.timeout(TIMEOUT),
      redirect: "follow",
    });
    const html = res.ok ? await res.text() : "";

    return {
      html,
      visit: {
        url: res.url || url,
        status: res.status,
        ok: res.ok,
        snapshot: html ? readable(html).slice(0, 400) : undefined,
      },
    };
  } catch (error) {
    return {
      html: "",
      visit: {
        url,
        status: 0,
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 80) : "fetch failed",
      },
    };
  }
}

function readable(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    // Some sites publish the @ and . as entities to deter naive scrapers.
    .replace(/&#0?64;|&commat;/gi, "@")
    .replace(/&#0?46;/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pulls published role addresses out of one page, with their context. */
function extractEmails(html: string, url: string, status: number): EmailEvidence[] {
  const text = readable(html);
  const now = new Date().toISOString();
  const found = new Map<string, EmailEvidence>();

  const record = (raw: string, fromMailto: boolean) => {
    const email = raw.toLowerCase().replace(/^mailto:/, "").split("?")[0].trim();

    if (!ROLE_PREFIX.test(email)) return;
    if (JUNK.test(email) || PLACEHOLDER.test(email)) return;
    if (found.has(email)) return;

    // Grab the words around it so the user can judge the context themselves.
    const at = text.toLowerCase().indexOf(email);
    const snippet =
      at >= 0 ? text.slice(Math.max(0, at - 110), at + email.length + 110).trim() : "";

    found.set(email, {
      email,
      sourceUrl: url,
      httpStatus: status,
      snippet,
      fromMailto,
      capturedAt: now,
    });
  };

  // mailto: links first — those are unambiguously published contacts.
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) record(m[1], true);
  for (const m of text.matchAll(EMAIL_RX)) record(m[0], false);

  return [...found.values()];
}

function detectAts(html: string): string | undefined {
  const h = html.toLowerCase();
  if (h.includes("greenhouse.io")) return "Greenhouse";
  if (h.includes("lever.co")) return "Lever";
  if (h.includes("ashbyhq.com")) return "Ashby";
  if (h.includes("smartrecruiters.com")) return "SmartRecruiters";
  if (h.includes("workable.com")) return "Workable";
  if (h.includes("recruitee.com")) return "Recruitee";
  if (h.includes("bamboohr.com")) return "BambooHR";
  return undefined;
}

/** Finds a careers link on the homepage rather than only guessing paths. */
function careersLinkFrom(html: string, origin: string): string | undefined {
  for (const m of html.matchAll(/href="([^"]+)"[^>]*>([^<]{0,60})</gi)) {
    const [, href, label] = m;
    if (!/career|jobs|hiring|join|work with us|we're hiring|contact|kontakt|vacature/i.test(`${href} ${label}`)) continue;
    if (/^(mailto:|tel:|#)/i.test(href)) continue;

    try {
      return new URL(href, origin).toString();
    } catch {
      /* malformed href */
    }
  }
  return undefined;
}

export interface EnrichResult extends HuntedCompany {
  evidence: EmailEvidence[];
  visited: PageVisit[];
}

export async function enrichCompany(company: HuntedCompany): Promise<EnrichResult> {
  const visited: PageVisit[] = [];
  const evidence: EmailEvidence[] = [];
  const notes: string[] = [];

  if (!company.domain) {
    return {
      ...company,
      evidence,
      visited,
      notes: ["No website domain was found for this company, so nothing could be verified."],
    };
  }

  const origin = `https://${company.domain}`;
  let careersUrl: string | undefined;
  let ats: string | undefined;

  // 1. Homepage — confirms the site is real and often links straight to careers.
  const home = await fetchPage(origin);
  visited.push(home.visit);

  if (home.visit.ok) {
    ats ??= detectAts(home.html);
    careersUrl = careersLinkFrom(home.html, origin);
    evidence.push(...extractEmails(home.html, home.visit.url, home.visit.status));
  } else {
    notes.push(`Homepage unreachable (${home.visit.error ?? `HTTP ${home.visit.status}`}).`);
  }

  // 2. The careers page it linked to, then the usual paths as a fallback.
  const candidates = [careersUrl, ...CAREERS_PATHS.map(p => `${origin}${p}`)].filter(
    (v): v is string => Boolean(v)
  );

  for (const url of candidates.slice(0, 12)) {
    if (visited.some(v => v.url === url)) continue;

    const page = await fetchPage(url);
    visited.push(page.visit);
    if (!page.visit.ok) continue;

    ats ??= detectAts(page.html);
    careersUrl ??= page.visit.url;
    evidence.push(...extractEmails(page.html, page.visit.url, page.visit.status));

    // A published role address is the goal; stop once one is confirmed.
    if (evidence.length) break;
  }

  // Deduplicate, preferring the mailto: sighting of the same address.
  const byEmail = new Map<string, EmailEvidence>();
  for (const e of evidence) {
    const existing = byEmail.get(e.email);
    if (!existing || (e.fromMailto && !existing.fromMailto)) byEmail.set(e.email, e);
  }
  const finalEvidence = [...byEmail.values()];

  let contactSource: ContactSource = "none";
  if (finalEvidence.length) {
    const from = finalEvidence[0].sourceUrl;
    contactSource = /career|job|join|hiring/i.test(from)
      ? "careers-page"
      : /contact/i.test(from)
        ? "contact-page"
        : "homepage";
  } else if (ats) {
    contactSource = "ats";
    notes.push(`Applications run through ${ats}; apply there rather than emailing.`);
  } else {
    notes.push("No published role address found. We do not guess addresses.");
  }

  return {
    ...company,
    careersUrl,
    ats,
    emails: finalEvidence.map(e => e.email),
    contactSource,
    evidence: finalEvidence,
    visited,
    notes,
  };
}

/** Enriches many companies with bounded concurrency. */
export async function enrichAll(
  companies: HuntedCompany[],
  onEach: (done: number, total: number, company: string) => void,
  concurrency = 3
): Promise<EnrichResult[]> {
  const out: EnrichResult[] = [];
  let index = 0;
  let done = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (index < companies.length) {
        const company = companies[index++];
        onEach(done, companies.length, company.name);
        out.push(await enrichCompany(company));
        done++;
      }
    })
  );

  return out;
}
