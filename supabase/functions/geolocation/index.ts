import { handleCors, json } from "../_shared/cors.ts";

const IPAPI_TIMEOUT_MS = 1500;

function isPrivateOrLoopback(ip: string): boolean {
  if (!ip) return true;
  if (ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (ip.startsWith("172.")) {
    const second = Number(ip.split(".")[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
  return false;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0]?.trim() ?? "" : req.headers.get("x-real-ip")?.trim() ?? "";

  if (isPrivateOrLoopback(ip)) return json({ city: null });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IPAPI_TIMEOUT_MS);
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return json({ city: null });
    const data = await res.json() as { city?: unknown; error?: unknown };
    if (data.error) return json({ city: null });
    const city = typeof data.city === "string" && data.city.length > 0 ? data.city : null;
    return json({ city });
  } catch {
    return json({ city: null });
  } finally {
    clearTimeout(timer);
  }
});
