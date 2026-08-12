import { BOT_UA, isAllowed } from "@/lib/jobs/http";

/**
 * Gathers evidence from the links a candidate supplied.
 *
 * GitHub gets special handling: scraping the profile page returns rendered
 * navigation chrome, whereas the public REST API returns the actual repository
 * list with languages, stars, topics and descriptions. Same for a repo URL —
 * the API plus the README is far denser than the HTML page.
 */

export interface FetchedSource {
  url: string;
  kind: "github-profile" | "github-repo" | "page";
  title?: string;
  content: string;
}

const TIMEOUT = 15_000;

function normalise(url: string): string {
  return url.startsWith("http") ? url : `https://${url}`;
}

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BOT_UA, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function text(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BOT_UA },
      signal: AbortSignal.timeout(TIMEOUT),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function stripHtml(html: string, limit: number): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

interface GhRepo {
  name: string; description?: string; language?: string;
  stargazers_count: number; forks_count: number; topics?: string[];
  html_url: string; homepage?: string; updated_at: string; fork: boolean;
  size: number;
}

interface GhUser { login: string; name?: string; bio?: string; company?: string; blog?: string; location?: string; public_repos: number; followers: number }

/** Reads a GitHub profile: bio, then the most substantial repositories. */
async function fetchGithubProfile(handle: string): Promise<FetchedSource[]> {
  const user = await json<GhUser>(`https://api.github.com/users/${handle}`);
  const repos = await json<GhRepo[]>(
    `https://api.github.com/users/${handle}/repos?sort=pushed&per_page=30`
  );
  if (!user && !repos) return [];

  const out: FetchedSource[] = [];

  if (user) {
    out.push({
      url: `https://github.com/${handle}`,
      kind: "github-profile",
      title: user.name ?? user.login,
      content: [
        `GitHub profile: ${user.login}${user.name ? ` (${user.name})` : ""}`,
        user.bio && `Bio: ${user.bio}`,
        user.company && `Company: ${user.company}`,
        user.location && `Location: ${user.location}`,
        user.blog && `Website: ${user.blog}`,
        `Public repos: ${user.public_repos} · Followers: ${user.followers}`,
      ].filter(Boolean).join("\n"),
    });
  }

  // Own work first, then by traction — a fork with no commits proves nothing.
  const ranked = (repos ?? [])
    .filter(r => !r.fork)
    .sort((a, b) => b.stargazers_count - a.stargazers_count || b.size - a.size)
    .slice(0, 8);

  for (const repo of ranked) {
    const readme = await fetchReadme(handle, repo.name);
    out.push({
      url: repo.html_url,
      kind: "github-repo",
      title: repo.name,
      content: [
        `Repository: ${repo.name}`,
        repo.description && `Description: ${repo.description}`,
        repo.language && `Primary language: ${repo.language}`,
        repo.topics?.length && `Topics: ${repo.topics.join(", ")}`,
        `Stars: ${repo.stargazers_count} · Forks: ${repo.forks_count}`,
        `Last pushed: ${repo.updated_at.slice(0, 10)}`,
        repo.homepage && `Live: ${repo.homepage}`,
        readme && `README:\n${readme}`,
      ].filter(Boolean).join("\n"),
    });
  }

  return out;
}

async function fetchReadme(owner: string, repo: string): Promise<string | null> {
  for (const branch of ["main", "master"]) {
    const raw = await text(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`);
    if (raw) {
      return raw
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")     // images add nothing here
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 3500);
    }
  }
  return null;
}

/** Fetches a page plus a few of its own internal links, for portfolio sites. */
async function fetchSite(url: string, depth: number): Promise<FetchedSource[]> {
  if (!(await isAllowed(url))) return [];
  const html = await text(url);
  if (!html) return [];

  const title = html.match(/<title[^>]*>([^<]{2,120})</i)?.[1]?.trim();
  const body = stripHtml(html, 8000);
  if (body.length < 150) return [];

  const out: FetchedSource[] = [{ url, kind: "page", title, content: body }];
  if (depth <= 0) return out;

  // Follow the pages a portfolio actually keeps its substance on.
  const origin = new URL(url).origin;
  const internal = [...html.matchAll(/href="(\/[a-z0-9/_-]*)"/gi)]
    .map(m => m[1])
    .filter(p => /project|work|about|writing|blog|case|experience/i.test(p));

  for (const path of [...new Set(internal)].slice(0, 3)) {
    const sub = await fetchSite(`${origin}${path}`, 0);
    out.push(...sub);
  }
  return out;
}

export type ProgressFn = (stage: string, progress: number, sourcesFound: number) => void;

/** Resolves every supplied link into evidence, with bounded breadth. */
export async function gatherEvidence(
  links: string[],
  onProgress: ProgressFn = () => {}
): Promise<FetchedSource[]> {
  const unique = [...new Set(links.filter(Boolean).map(normalise))].slice(0, 10);
  const results: FetchedSource[] = [];

  // Crawling occupies the first 60% of the run; generation takes the rest.
  let index = 0;
  for (const link of unique) {
    try {
      const host = new URL(link).hostname.replace(/^www\./, "");

      onProgress(`Reading ${host}`, 8 + Math.round((index / unique.length) * 52), results.length);
      index++;

      if (host === "github.com") {
        const parts = new URL(link).pathname.split("/").filter(Boolean);
        if (parts.length === 1) {
          results.push(...(await fetchGithubProfile(parts[0])));
          continue;
        }
        if (parts.length >= 2) {
          const readme = await fetchReadme(parts[0], parts[1]);
          const repo = await json<GhRepo>(`https://api.github.com/repos/${parts[0]}/${parts[1]}`);
          results.push({
            url: link,
            kind: "github-repo",
            title: parts[1],
            content: [
              `Repository: ${parts[0]}/${parts[1]}`,
              repo?.description && `Description: ${repo.description}`,
              repo?.language && `Primary language: ${repo.language}`,
              repo && `Stars: ${repo.stargazers_count} · Forks: ${repo.forks_count}`,
              readme && `README:\n${readme}`,
            ].filter(Boolean).join("\n") || "(no content)",
          });
          continue;
        }
      }

      // LinkedIn blocks automated reads; attempting it just wastes a request.
      if (host.endsWith("linkedin.com")) continue;

      results.push(...(await fetchSite(link, 1)));
    } catch {
      // A bad link is not worth failing the whole briefing over.
    }
  }

  onProgress("Finished reading your links", 60, results.length);
  return results;
}
