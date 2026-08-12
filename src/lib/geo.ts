import { headers } from "next/headers";

/**
 * Best-effort country detection for the current request.
 *
 * Order matters: platform-provided headers first (Vercel, Cloudflare and most
 * CDNs resolve geo at the edge and are both free and instant), then an IP
 * lookup as a fallback. The result is only ever a default — the user can always
 * override it, so being wrong is a mild inconvenience rather than a bug.
 */

export interface GeoResult {
  countryCode?: string;
  countryName?: string;
  source: "header" | "ip-lookup" | "none";
}

const NAMES = new Intl.DisplayNames(["en"], { type: "region" });

function nameFor(code?: string): string | undefined {
  if (!code) return undefined;
  try {
    return NAMES.of(code.toUpperCase());
  } catch {
    return undefined;
  }
}

function clientIp(h: Headers): string | undefined {
  // x-forwarded-for is a chain; the original client is the first entry.
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip") || undefined;

  // Localhost and private ranges tell a geo API nothing.
  if (!ip || ip === "::1" || ip === "127.0.0.1") return undefined;
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) return undefined;
  return ip;
}

export async function detectCountry(): Promise<GeoResult> {
  const h = await headers();

  const fromHeader =
    h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? h.get("x-country-code");
  if (fromHeader && fromHeader !== "XX") {
    return {
      countryCode: fromHeader.toUpperCase(),
      countryName: nameFor(fromHeader),
      source: "header",
    };
  }

  const ip = clientIp(h);
  try {
    // With no IP (e.g. on localhost) the API resolves the caller's own address,
    // which in development is exactly what we want.
    const res = await fetch(`https://ipapi.co/${ip ? `${ip}/` : ""}json/`, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "JobHunting/0.1" },
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.country_code) {
        return {
          countryCode: String(json.country_code).toUpperCase(),
          countryName: json.country_name ?? nameFor(json.country_code),
          source: "ip-lookup",
        };
      }
    }
  } catch {
    // Detection is a convenience; failing it just means the user picks manually.
  }

  return { source: "none" };
}

/** Country list for the picker, sorted by display name. */
export const COUNTRIES: { code: string; name: string }[] = [
  "IN","US","GB","CA","AU","NZ","SG","AE","SA","JP","CN","KR","DE","FR","ES","IT",
  "NL","IE","PT","AT","BE","FI","GR","CH","SE","NO","DK","PL","BR","MX","AR","ZA",
  "NG","KE","EG","ID","PH","MY","TH","VN","TR","IL","RU","UA","BD","PK","LK","NP",
]
  .map(code => ({ code, name: nameFor(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name));
