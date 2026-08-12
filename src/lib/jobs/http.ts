/**
 * Polite HTTP layer shared by every source adapter.
 *
 * Three things every adapter gets for free: a per-host rate limit so we never
 * hammer anyone, a robots.txt check that is honoured before the first real
 * request, and an identifiable User-Agent. Crawling other people's sites is a
 * privilege — this is the part that keeps it one.
 */

const CONTACT_URL = process.env.CRAWLER_CONTACT_URL ?? "https://jobhunting.app/bot";

export const BOT_UA = `Mozilla/5.0 (compatible; JobHuntingBot/0.1; +${CONTACT_URL})`;

/** Some hosts reject non-browser agents outright; those are marked per-adapter. */
export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const MIN_INTERVAL_MS = Number(process.env.CRAWLER_MIN_INTERVAL_MS ?? 1000);

const lastHit = new Map<string, number>();

async function throttle(host: string) {
  const prev = lastHit.get(host) ?? 0;
  const wait = prev + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

// --------------------------------------------------------------- robots.txt

type RobotsRules = { disallow: string[]; allow: string[] };
const robotsCache = new Map<string, Promise<RobotsRules>>();

async function loadRobots(origin: string): Promise<RobotsRules> {
  const rules: RobotsRules = { disallow: [], allow: [] };
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": BOT_UA },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return rules;

    // Only the `*` group applies to us; stop once a more specific group starts.
    let inStar = false;
    for (const raw of (await res.text()).split("\n")) {
      const line = raw.split("#")[0].trim();
      if (!line) continue;
      const [rawKey, ...rest] = line.split(":");
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(":").trim();
      if (key === "user-agent") inStar = value === "*";
      else if (inStar && key === "disallow" && value) rules.disallow.push(value);
      else if (inStar && key === "allow" && value) rules.allow.push(value);
    }
  } catch {
    // A missing or unreachable robots.txt is treated as "no rules", per convention.
  }
  return rules;
}

/** Glob match supporting the `*` wildcard and `$` anchor that robots.txt allows. */
function matches(pattern: string, path: string): boolean {
  const rx = new RegExp(
    "^" +
      pattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\\\$$/, "$")
  );
  return rx.test(path);
}

export async function isAllowed(url: string): Promise<boolean> {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) robotsCache.set(u.origin, loadRobots(u.origin));
  const rules = await robotsCache.get(u.origin)!;
  const path = u.pathname + u.search;

  // Longest matching rule wins, and Allow beats Disallow at equal length.
  let verdict = true;
  let best = -1;
  for (const p of rules.disallow) {
    if (matches(p, path) && p.length > best) { best = p.length; verdict = false; }
  }
  for (const p of rules.allow) {
    if (matches(p, path) && p.length >= best) { best = p.length; verdict = true; }
  }
  return verdict;
}

// -------------------------------------------------------------------- fetch

export class BlockedError extends Error {}

export interface FetchOpts {
  headers?: Record<string, string>;
  /** Skip the robots check — only for documented public JSON APIs. */
  skipRobots?: boolean;
  timeoutMs?: number;
}

export async function politeFetch(url: string, opts: FetchOpts = {}): Promise<string> {
  const { headers = { "User-Agent": BOT_UA }, skipRobots = false, timeoutMs = 20_000 } = opts;

  if (!skipRobots && !(await isAllowed(url))) {
    throw new BlockedError(`robots.txt disallows ${url}`);
  }

  const host = new URL(url).host;
  await throttle(host);

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  const body = await res.text();

  if (res.status === 403 || res.status === 429 || res.status === 406) {
    throw new BlockedError(`HTTP ${res.status} from ${host}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${host}`);
  if (/Just a moment|cf-browser-verification|are you a robot|captcha/i.test(body.slice(0, 4000))) {
    throw new BlockedError(`bot challenge from ${host}`);
  }
  return body;
}

export async function politeJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  return JSON.parse(await politeFetch(url, opts)) as T;
}
