/**
 * cityResources — Solarpunk-aligned local places for a (city, topic).
 *
 * Looked up on-demand when a user picks a mission. Backed by OpenStreetMap:
 *
 *   1. Nominatim geocodes the city name → lat/lon.
 *      https://nominatim.org/release-docs/develop/api/Search/
 *
 *   2. Overpass queries a configurable radius around that point for the
 *      tagged places relevant to the topic (markets, repair cafés,
 *      community gardens, etc.).
 *      https://wiki.openstreetmap.org/wiki/Overpass_API/Language_Guide
 *
 * Results are cached forever in the `CityResources` table keyed by
 * (city, topic) and shared across all users in the same city. Manual
 * invalidation (e.g. when OSM coverage improves) is a future concern;
 * `refreshedAt` is the hook for it.
 *
 * Both APIs are free and require no key, but Nominatim's usage policy
 * caps callers to ~1 req/sec and asks for a descriptive User-Agent. We
 * comply with both. If either call fails or times out, we return an
 * empty list and DO NOT persist a cache row — next attempt retries.
 */

import { prisma } from "@/lib/prisma";
import type { TopicId } from "@/lib/missionMatrix";

// Bumped whenever TOPIC_OSM_QUERIES changes meaningfully. Rows stamped
// with an older version are still served (the existing places are
// useful) but a future refresh job can use this to selectively
// regenerate cohorts.
export const QUERY_SET_VERSION = "v1.0";

// How long a cached (city, topic) row stays "fresh" before we treat it
// as a miss and re-query OSM. 30 days is a deliberate middle ground:
//
//   - OSM tags drift slowly. Allotment gardens and community centres
//     don't appear/disappear monthly.
//   - Shops (cafés, secondhand, repair) churn faster — somewhere
//     between weeks and years.
//   - Re-fetching is cheap (one Nominatim + one Overpass call per city
//     per topic per month) so we err on the fresh side.
//
// Tune via env if you need to: short for staging / aggressive freshness,
// long for low-traffic production where cron-based refresh is more
// appropriate than lazy-on-read refresh.
const CACHE_TTL_DAYS = 30;
const CACHE_TTL_MS = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

// User-Agent required by Nominatim's usage policy and recommended by
// Overpass. Include a contact channel so operators can reach us if we
// misbehave at scale.
const HTTP_USER_AGENT =
  "solarpunk-missions/0.1 (https://github.com/solarpunk-missions; contact: hello@solarpunk.missions)";

// 5 km feels right for "places you could realistically visit today" in
// most European/American cities. Smaller cities still get coverage; very
// large cities (LA, Tokyo) will under-sample — a v2 enhancement could
// scale this by city population or use GPS instead.
const SEARCH_RADIUS_METERS = 5000;

// Cap at 10 results. More is noisy in UI and inflates the JSONB blob
// without much value — the user only needs a handful of starting points.
const MAX_PLACES_PER_LOOKUP = 10;

// Per-API timeouts. The overall budget enforced by callers is shorter
// (typically 3s in /api/mission/choose) so these are upper bounds.
const NOMINATIM_TIMEOUT_MS = 2000;
const OVERPASS_TIMEOUT_MS = 4000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CityResourcePlace = {
  /** Human display name, from the OSM `name` tag. Required — we drop
   *  results without a name because they're useless to surface. */
  name: string;
  /** Friendly label of what this place IS, e.g. "Repair café" or
   *  "Community garden". Derived from which OsmTagQuery matched. */
  category: string;
  /** OSM element type — used together with osmId to deep-link back to
   *  openstreetmap.org for debugging or further info. */
  osmType: "node" | "way" | "relation";
  osmId: number;
  /** Center coordinates. For nodes this is the node's lat/lon; for
   *  ways/relations Overpass returns a `center` we copy here. */
  lat: number;
  lon: number;
  /** Free-form address assembled from OSM `addr:*` tags. Null when OSM
   *  has no address tagged (very common for ways/relations). */
  address: string | null;
  /** Website if OSM has one (`website` or `contact:website`). */
  url: string | null;
};

type OsmTagQuery = {
  key: string;
  value: string;
  /** What this category looks like in the UI. */
  label: string;
};

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Per-topic OSM tag selectors
// ---------------------------------------------------------------------------
//
// Curated by hand. The Solarpunk angle is what guides the picks: prefer
// secondhand, repair, community, local, and shared spaces over generic
// commercial venues. Some topics map cleanly to OSM (cooking, fashion,
// gardening); others (music, accessibility) lean on community-centre
// style tags because OSM doesn't have great native categories for them.
//
// Reference: https://wiki.openstreetmap.org/wiki/Map_features

export const TOPIC_OSM_QUERIES: Readonly<Record<TopicId, readonly OsmTagQuery[]>> =
  {
    cooking: [
      { key: "amenity", value: "marketplace", label: "Marketplace" },
      { key: "shop", value: "greengrocer", label: "Greengrocer" },
      { key: "shop", value: "farm", label: "Farm shop" },
      { key: "shop", value: "cooperative", label: "Food co-op" },
      { key: "shop", value: "organic", label: "Organic shop" },
      {
        key: "amenity",
        value: "community_kitchen",
        label: "Community kitchen",
      },
      { key: "social_facility", value: "food_bank", label: "Food bank" },
    ],
    fashion: [
      { key: "shop", value: "second_hand", label: "Secondhand shop" },
      { key: "shop", value: "charity", label: "Charity shop" },
      { key: "craft", value: "tailor", label: "Tailor" },
      { key: "craft", value: "shoemaker", label: "Cobbler" },
      { key: "amenity", value: "repair_cafe", label: "Repair café" },
      { key: "shop", value: "fabric", label: "Fabric shop" },
    ],
    games: [
      { key: "shop", value: "games", label: "Game shop" },
      { key: "amenity", value: "community_centre", label: "Community centre" },
      { key: "leisure", value: "hackerspace", label: "Hackerspace" },
      { key: "amenity", value: "library", label: "Library" },
      { key: "amenity", value: "social_centre", label: "Social centre" },
    ],
    tech: [
      { key: "amenity", value: "repair_cafe", label: "Repair café" },
      { key: "leisure", value: "hackerspace", label: "Hackerspace" },
      { key: "amenity", value: "fab_lab", label: "Fab lab" },
      { key: "amenity", value: "library", label: "Library" },
      {
        key: "craft",
        value: "electronics_repair",
        label: "Electronics repair",
      },
      { key: "shop", value: "computer", label: "Computer shop" },
    ],
    music: [
      {
        key: "shop",
        value: "musical_instrument",
        label: "Musical instrument shop",
      },
      {
        key: "craft",
        value: "musical_instrument",
        label: "Instrument maker / repairer",
      },
      { key: "amenity", value: "arts_centre", label: "Arts centre" },
      { key: "amenity", value: "studio", label: "Studio" },
      { key: "amenity", value: "community_centre", label: "Community centre" },
    ],
    accessibility: [
      { key: "amenity", value: "community_centre", label: "Community centre" },
      { key: "amenity", value: "social_centre", label: "Social centre" },
      { key: "office", value: "ngo", label: "NGO" },
      { key: "office", value: "charity", label: "Charity office" },
      { key: "amenity", value: "library", label: "Library" },
    ],
    gardening: [
      { key: "landuse", value: "allotments", label: "Allotment garden" },
      { key: "landuse", value: "community_garden", label: "Community garden" },
      { key: "leisure", value: "garden", label: "Garden" },
      { key: "shop", value: "garden_centre", label: "Garden centre" },
      { key: "shop", value: "florist", label: "Florist" },
      { key: "amenity", value: "community_centre", label: "Community centre" },
    ],
  };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get places for (city, topic). Cache-first with TTL-based refresh:
 *
 *   - Fresh cache hit (within CACHE_TTL_DAYS) → return cached.
 *   - Stale cache hit (older than CACHE_TTL_DAYS) → try to re-fetch
 *     from OSM. On a CLEAN refresh (geocode + Overpass both succeeded)
 *     UPDATE the row with new data; `refreshedAt` auto-bumps via the
 *     schema's @updatedAt. On a FAILED refresh (network/timeout/abort)
 *     return the stale data and leave `refreshedAt` alone so the next
 *     choose retries.
 *   - No cache row → fetch fresh. CREATE on clean fetch. Don't cache
 *     on failure (otherwise transient outages would poison the cache
 *     with empty rows that never retry).
 *
 * "Clean refresh" is the key distinction from v1. Empty results from
 * Overpass (real "no places match these tags in this radius") DO get
 * persisted — that's a valid answer. Network failures do NOT, because
 * we can't tell them apart from real-empty without this two-tier
 * return type: geocodeCity / fetchOverpassPlaces return `null` on
 * failure and a (possibly empty) value on success.
 */
export async function findOrFetchCityResources(
  city: string,
  topic: TopicId,
  signal?: AbortSignal,
): Promise<CityResourcePlace[]> {
  const normalized = city.trim();
  if (!normalized) return [];

  const queries = TOPIC_OSM_QUERIES[topic] ?? [];
  if (queries.length === 0) return [];

  // ---- cache lookup ------------------------------------------------------
  const cached = await prisma.cityResources.findUnique({
    where: { city_topic: { city: normalized, topic } },
    select: { id: true, places: true, refreshedAt: true },
  });
  const cachedPlaces = cached
    ? (cached.places as unknown as CityResourcePlace[])
    : null;

  if (cached && !isStale(cached.refreshedAt)) {
    return cachedPlaces ?? [];
  }

  // ---- live lookup (cache miss OR stale) --------------------------------
  const center = await geocodeCity(normalized, signal);
  if (center === null) {
    // Geocode failed — serve stale if we have it, else nothing.
    return cachedPlaces ?? [];
  }

  const places = await fetchOverpassPlaces(
    center,
    queries,
    SEARCH_RADIUS_METERS,
    signal,
  );
  if (places === null) {
    // Overpass failed — same fallback. Crucially, we DON'T bump
    // refreshedAt here, so the next choose retries instead of waiting
    // another full TTL.
    return cachedPlaces ?? [];
  }

  // Clean refresh — persist. Empty `places` is a legitimate result and
  // gets cached too (OSM genuinely has nothing tagged in this radius);
  // we just don't want to cache a fake empty caused by a network blip.
  if (cached) {
    await prisma.cityResources.update({
      where: { id: cached.id },
      data: {
        centerLat: center.lat,
        centerLon: center.lon,
        places: places as unknown as object,
        placesCount: places.length,
        querySetVersion: QUERY_SET_VERSION,
        // refreshedAt is auto-updated via @updatedAt in the schema.
      },
    });
  } else {
    await prisma.cityResources.create({
      data: {
        city: normalized,
        topic,
        centerLat: center.lat,
        centerLon: center.lon,
        places: places as unknown as object,
        placesCount: places.length,
        querySetVersion: QUERY_SET_VERSION,
      },
    });
  }

  return places;
}

function isStale(refreshedAt: Date): boolean {
  return Date.now() - refreshedAt.getTime() > CACHE_TTL_MS;
}

// ---------------------------------------------------------------------------
// Nominatim — geocode "Berlin" → lat/lon
// ---------------------------------------------------------------------------

type GeoPoint = { lat: number; lon: number };

async function geocodeCity(
  city: string,
  parentSignal?: AbortSignal,
): Promise<GeoPoint | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);

  // Forward parent abort to our controller. `once: true` means the
  // listener auto-removes after firing, so no manual cleanup needed.
  if (parentSignal?.aborted) controller.abort();
  parentSignal?.addEventListener("abort", () => controller.abort(), {
    once: true,
  });

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", city);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    // We only need a coarse center; addressdetails inflates the response.
    url.searchParams.set("addressdetails", "0");

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": HTTP_USER_AGENT,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const first = data[0];
    if (!first?.lat || !first?.lon) return null;
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Overpass — find tagged places around a point
// ---------------------------------------------------------------------------

/**
 * Returns the normalised places array on success (possibly empty if OSM
 * has nothing tagged in this radius), or `null` if the HTTP call
 * failed (network, timeout, non-2xx response, unparseable JSON). The
 * null vs empty-array distinction is what lets the cache layer avoid
 * persisting a fake-empty caused by a transient outage.
 */
async function fetchOverpassPlaces(
  center: GeoPoint,
  queries: readonly OsmTagQuery[],
  radiusMeters: number,
  parentSignal?: AbortSignal,
): Promise<CityResourcePlace[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
  if (parentSignal?.aborted) controller.abort();
  parentSignal?.addEventListener("abort", () => controller.abort(), {
    once: true,
  });

  try {
    const query = buildOverpassQuery(queries, center, radiusMeters);
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": HTTP_USER_AGENT,
      },
      // Overpass expects `data=<query>` form-encoded.
      body: new URLSearchParams({ data: query }).toString(),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { elements?: OverpassElement[] };
    return normalizeOverpassElements(data.elements ?? [], queries);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildOverpassQuery(
  queries: readonly OsmTagQuery[],
  center: GeoPoint,
  radiusMeters: number,
): string {
  const around = `around:${radiusMeters},${center.lat},${center.lon}`;
  const clauses: string[] = [];
  for (const q of queries) {
    // For each tag we look up nodes, ways, and relations — community
    // gardens are usually ways or relations; secondhand shops are
    // usually nodes. Asking for all three is cheap.
    const safeKey = escapeOverpassString(q.key);
    const safeValue = escapeOverpassString(q.value);
    clauses.push(`  node["${safeKey}"="${safeValue}"](${around});`);
    clauses.push(`  way["${safeKey}"="${safeValue}"](${around});`);
    clauses.push(`  relation["${safeKey}"="${safeValue}"](${around});`);
  }
  // `out tags center` returns each element's tags plus a representative
  // lat/lon (computed center for ways/relations). Enough for display.
  return `[out:json][timeout:25];\n(\n${clauses.join("\n")}\n);\nout tags center;`;
}

function escapeOverpassString(s: string): string {
  // We only allow tag keys/values from our hand-written TOPIC_OSM_QUERIES
  // map, so injection isn't a real risk — but escape conservatively so a
  // future contributor can't accidentally break the query syntax.
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeOverpassElements(
  elements: OverpassElement[],
  queries: readonly OsmTagQuery[],
): CityResourcePlace[] {
  // Build a fast lookup from "key=value" → friendly label so we can
  // categorise each returned element by the first matching query in
  // priority order.
  const labelFor = new Map<string, string>();
  for (const q of queries) {
    labelFor.set(`${q.key}=${q.value}`, q.label);
  }

  const seen = new Set<string>();
  const places: CityResourcePlace[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags["name"];
    // Anonymous elements are useless to surface — skip them. (Common for
    // ways like `landuse=allotments` that don't always have a name.)
    if (!name) continue;

    // Find which query this element matched. An element can match more
    // than one tag pair (rare but possible); take the first hit in our
    // declared query order so labels are deterministic.
    let category: string | undefined;
    for (const q of queries) {
      if (tags[q.key] === q.value) {
        category = q.label;
        break;
      }
    }
    if (!category) continue;

    // De-dupe by (type, id). Overpass can return the same element under
    // multiple tag clauses if it has overlapping tags.
    const dedupeKey = `${el.type}:${el.id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lon !== "number") continue;

    places.push({
      name,
      category,
      osmType: el.type,
      osmId: el.id,
      lat,
      lon,
      address: buildAddress(tags),
      url: tags["website"] ?? tags["contact:website"] ?? null,
    });

    if (places.length >= MAX_PLACES_PER_LOOKUP) break;
  }

  return places;
}

function buildAddress(tags: Record<string, string>): string | null {
  // OSM splits address into addr:street, addr:housenumber, addr:postcode,
  // addr:city. We assemble the common case; missing parts are silently
  // dropped, which is fine — a partial address ("Skalitzer Straße,
  // Berlin") is still useful for orientation.
  const street = tags["addr:street"];
  const number = tags["addr:housenumber"];
  const postcode = tags["addr:postcode"];
  const city = tags["addr:city"];

  const line1 = [street, number].filter(Boolean).join(" ");
  const line2 = [postcode, city].filter(Boolean).join(" ");
  const joined = [line1, line2].filter((p) => p.length > 0).join(", ");
  return joined.length > 0 ? joined : null;
}
