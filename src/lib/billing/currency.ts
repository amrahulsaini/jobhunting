/**
 * Currency display.
 *
 * Every amount is stored in USD, because that is the currency we are actually
 * billed in — converting on write would bake a stale rate into the ledger
 * permanently. Conversion happens at display time only.
 */

const COUNTRY_CURRENCY: Record<string, string> = {
  IN: "INR", US: "USD", GB: "GBP", CA: "CAD", AU: "AUD", NZ: "NZD",
  SG: "SGD", AE: "AED", SA: "SAR", JP: "JPY", CN: "CNY", KR: "KRW",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", BR: "BRL",
  MX: "MXN", ZA: "ZAR", NG: "NGN", KE: "KES", ID: "IDR", PH: "PHP",
  MY: "MYR", TH: "THB", VN: "VND", TR: "TRY", IL: "ILS", RU: "RUB",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", IE: "EUR",
  PT: "EUR", AT: "EUR", BE: "EUR", FI: "EUR", GR: "EUR",
};

export function currencyForCountry(countryCode?: string): string {
  if (!countryCode) return "USD";
  return COUNTRY_CURRENCY[countryCode.toUpperCase()] ?? "USD";
}

interface RateCache {
  rates: Record<string, number>;
  fetchedAt: number;
}

let cache: RateCache | undefined;
const TTL_MS = 6 * 60 * 60 * 1000; // rates move slowly; six hours is plenty

/**
 * Fetches USD-based rates, cached in memory.
 *
 * If the rate provider is unreachable we return an empty table rather than a
 * guess — the caller then shows USD, which is accurate, instead of a converted
 * figure derived from a made-up rate.
 */
export async function getRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.rates;

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 21_600 },
    });
    const json = await res.json();
    if (json?.result !== "success" || !json.rates) throw new Error("bad rate payload");

    cache = { rates: json.rates as Record<string, number>, fetchedAt: Date.now() };
    return cache.rates;
  } catch {
    return cache?.rates ?? {};
  }
}

export interface Money {
  /** The canonical amount. */
  usd: number;
  /** Converted amount, or the USD amount when no rate was available. */
  amount: number;
  currency: string;
  /** True when we had to fall back to USD because conversion failed. */
  fellBack: boolean;
}

export async function toLocal(usd: number, countryCode?: string): Promise<Money> {
  const currency = currencyForCountry(countryCode);
  if (currency === "USD") return { usd, amount: usd, currency: "USD", fellBack: false };

  const rates = await getRates();
  const rate = rates[currency];
  if (!rate) return { usd, amount: usd, currency: "USD", fellBack: true };

  return { usd, amount: usd * rate, currency, fellBack: false };
}

/**
 * Formats an amount, keeping enough precision that a fraction-of-a-cent charge
 * doesn't display as a flat zero.
 */
export function formatMoney(amount: number, currency: string, locale = "en"): string {
  const tiny = amount > 0 && amount < 0.01;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: tiny ? 4 : 2,
    maximumFractionDigits: tiny ? 4 : 2,
  }).format(amount);
}
