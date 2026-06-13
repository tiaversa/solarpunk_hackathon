/**
 * Server-side IP geolocation.
 *
 * Strategy per Step 3 of the build spec: derive a `city` suggestion from the
 * caller's IP address via a free service (ipapi.co) and pre-fill `User.city`
 * the first time someone signs in. Users can always edit the value manually
 * via the preferences UI/endpoint. GPS coordinates are reserved for a future
 * enhancement (see User.latitude/longitude).
 *
 * Behaviour:
 *  - We trust the standard reverse-proxy headers first (x-forwarded-for,
 *    x-real-ip) because production runs behind Vercel.
 *  - If the resolved IP is loopback / private (i.e. local dev), we skip the
 *    lookup and let the caller fall back to "" so the UI text input starts
 *    empty rather than showing nonsense.
 *  - Network failures, non-200 responses, or unexpected payload shapes all
 *    return null. Geocoding is best-effort — it must never block the request.
 */

const IPAPI_TIMEOUT_MS = 1500;

function isPrivateOrLoopback(ip: string): boolean {
  if (!ip) return true;
  if (ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("172.")) {
    const second = Number(ip.split(".")[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
  return false;
}

function extractIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "";
  return headers.get("x-real-ip")?.trim() ?? "";
}

export async function suggestCityFromHeaders(
  headers: Headers,
): Promise<string | null> {
  const ip = extractIp(headers);
  if (isPrivateOrLoopback(ip)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IPAPI_TIMEOUT_MS);
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      // We never want stale data here, but we also don't need fresh every
      // request — let the platform decide.
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { city?: unknown; error?: unknown };
    if (data.error) return null;
    return typeof data.city === "string" && data.city.length > 0
      ? data.city
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
