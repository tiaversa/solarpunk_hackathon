import { prisma } from "@/lib/prisma";
import type { TopicId } from "@/lib/missionMatrix";

export type NearbyOpportunity = {
  orgName: string;
  title: string;
  description: string;
  distanceKm: number;
};

// Maximum distance to consider a request "nearby".
const MAX_RADIUS_KM = 10;
// Over-fetch with a loose bounding box (0.15° ≈ ~16 km) then filter precisely.
const BBOX_DEG = 0.15;
const MAX_RESULTS = 3;

/**
 * Find open ServiceRequests whose category matches the topic, within
 * MAX_RADIUS_KM of the given coordinates. Returns at most MAX_RESULTS items
 * sorted by distance, closest first.
 */
export async function findNearbyOpportunities(
  topic: TopicId,
  lat: number,
  lng: number,
): Promise<NearbyOpportunity[]> {
  const rows = await prisma.serviceRequest.findMany({
    where: {
      category: topic,
      status: "open",
      capacityRemaining: { gt: 0 },
      lat: { gte: lat - BBOX_DEG, lte: lat + BBOX_DEG },
      lng: { gte: lng - BBOX_DEG, lte: lng + BBOX_DEG },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      title: true,
      description: true,
      lat: true,
      lng: true,
      organization: { select: { name: true } },
    },
    take: MAX_RESULTS * 5,
  });

  return rows
    .map((r) => ({
      orgName: r.organization.name,
      title: r.title,
      description: r.description,
      distanceKm: haversineKm(lat, lng, r.lat, r.lng),
    }))
    .filter((r) => r.distanceKm <= MAX_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_RESULTS);
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
