import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helper";
import { TOPIC_IDS } from "@/lib/missionMatrix";
import { randomUUID } from "node:crypto";

const CreateBody = z.object({
  category: z.string().refine((v) => (TOPIC_IDS as readonly string[]).includes(v), {
    message: `category must be one of: ${TOPIC_IDS.join(", ")}`,
  }),
  title: z.string().min(5).max(120),
  description: z.string().min(10).max(800),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z.number().min(0.5).max(50).default(5),
  capacityTotal: z.number().int().min(1).max(500).default(1),
  expiresAt: z.string().datetime().optional(),
});

type Params = { params: Promise<{ orgId: string }> };

// GET /api/orgs/[orgId]/requests — list service requests for an org
export async function GET(req: Request, { params }: Params) {
  const { orgId } = await params;
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status") ?? "open";

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true },
  });
  if (!org) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  const requests = await prisma.serviceRequest.findMany({
    where: {
      organizationId: orgId,
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      category: true,
      title: true,
      description: true,
      lat: true,
      lng: true,
      radiusKm: true,
      capacityTotal: true,
      capacityRemaining: true,
      expiresAt: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ requests });
}

// POST /api/orgs/[orgId]/requests — create a service request (org admin only)
export async function POST(req: Request, { params }: Params) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;

  const { orgId } = await params;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { createdByUserId: true },
  });
  if (!org) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }
  if (org.createdByUserId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const {
    category,
    title,
    description,
    lat,
    lng,
    radiusKm,
    capacityTotal,
    expiresAt,
  } = parsed.data;

  const request = await prisma.serviceRequest.create({
    data: {
      id: randomUUID(),
      organizationId: orgId,
      category,
      title,
      description,
      lat,
      lng,
      radiusKm,
      capacityTotal,
      capacityRemaining: capacityTotal,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      status: "open",
    },
    select: {
      id: true,
      category: true,
      title: true,
      description: true,
      lat: true,
      lng: true,
      radiusKm: true,
      capacityTotal: true,
      capacityRemaining: true,
      expiresAt: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ request }, { status: 201 });
}
