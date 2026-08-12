import { NextResponse } from "next/server";
import { crawlAll } from "@/lib/jobs";
import type { CrawlQuery } from "@/lib/jobs";

// Live network calls to third-party boards — never prerender or cache this.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseQuery(params: URLSearchParams): CrawlQuery {
  return {
    role: params.get("role")?.trim() || "full stack engineer",
    keywords: params.get("keywords")?.split(",").map(s => s.trim()).filter(Boolean),
    location: params.get("location") ?? undefined,
    remoteOnly: params.get("remote") === "true",
    limit: Math.min(Number(params.get("limit") ?? 25) || 25, 100),
  };
}

export async function GET(request: Request) {
  const query = parseQuery(new URL(request.url).searchParams);

  try {
    const result = await crawlAll(query);
    return NextResponse.json({
      ok: true,
      query: result.query,
      tookMs: result.tookMs,
      sources: result.results.map(r => ({
        source: r.source,
        label: r.label,
        status: r.status,
        tookMs: r.tookMs,
      })),
      total: result.jobs.length,
      jobs: result.jobs,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "crawl failed" },
      { status: 500 }
    );
  }
}
