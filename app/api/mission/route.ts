import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth-helper";
import {
  MissionGenerationError,
  getOrGenerateMission,
} from "@/lib/missions";
import { isTopicId, TOPIC_IDS, type TopicId } from "@/lib/missionMatrix";
import { isLevel, MAX_LEVEL, MIN_LEVEL, type Level } from "@/lib/levels";

const Query = z.object({
  topic: z
    .string()
    .refine(isTopicId, {
      message: `topic must be one of: ${TOPIC_IDS.join(", ")}`,
    }),
  level: z.coerce
    .number()
    .int()
    .refine(isLevel, {
      message: `level must be an integer ${MIN_LEVEL}-${MAX_LEVEL}`,
    }),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export async function GET(req: Request) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  const parsed = Query.safeParse({
    topic: url.searchParams.get("topic") ?? "",
    level: url.searchParams.get("level") ?? "",
    lat: url.searchParams.get("lat") ?? undefined,
    lng: url.searchParams.get("lng") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  try {
    const result = await getOrGenerateMission({
      userId: auth.userId,
      topic: parsed.data.topic as TopicId,
      level: parsed.data.level as Level,
      latitude: parsed.data.lat,
      longitude: parsed.data.lng,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MissionGenerationError) {
      return NextResponse.json(
        { error: err.message, aiGenerationId: err.aiGenerationId },
        { status: 502 },
      );
    }
    throw err;
  }
}
