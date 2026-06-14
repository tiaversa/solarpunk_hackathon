import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helper";

const PatchBody = z
  .object({
    title: z.string().min(5).max(120).optional(),
    description: z.string().min(10).max(800).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    radiusKm: z.number().min(0.5).max(50).optional(),
    capacityRemaining: z.number().int().min(0).optional(),
    status: z.enum(["open", "filled", "expired"]).optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  });

type Params = { params: Promise<{ orgId: string; requestId: string }> };

async function resolveAndAuthorise(orgId: string, requestId: string, userId: string) {
  const request = await prisma.serviceRequest.findFirst({
    where: { id: requestId, organizationId: orgId },
    select: {
      id: true,
      organization: { select: { createdByUserId: true } },
    },
  });
  if (!request) return { error: "Request not found", status: 404 as const };
  if (request.organization.createdByUserId !== userId)
    return { error: "Forbidden", status: 403 as const };
  return { request };
}

// GET /api/orgs/[orgId]/requests/[requestId]
export async function GET(_req: Request, { params }: Params) {
  const { orgId, requestId } = await params;

  const request = await prisma.serviceRequest.findFirst({
    where: { id: requestId, organizationId: orgId },
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
      updatedAt: true,
      organization: { select: { id: true, name: true } },
    },
  });

  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  return NextResponse.json({ request });
}

// PATCH /api/orgs/[orgId]/requests/[requestId]
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;

  const { orgId, requestId } = await params;
  const check = await resolveAndAuthorise(orgId, requestId, auth.userId);
  if ("error" in check) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const updated = await prisma.serviceRequest.update({
    where: { id: requestId },
    data: {
      ...(d.title !== undefined && { title: d.title }),
      ...(d.description !== undefined && { description: d.description }),
      ...(d.lat !== undefined && { lat: d.lat }),
      ...(d.lng !== undefined && { lng: d.lng }),
      ...(d.radiusKm !== undefined && { radiusKm: d.radiusKm }),
      ...(d.capacityRemaining !== undefined && { capacityRemaining: d.capacityRemaining }),
      ...(d.status !== undefined && { status: d.status }),
      ...(d.expiresAt !== undefined && {
        expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
      }),
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
      updatedAt: true,
    },
  });

  return NextResponse.json({ request: updated });
}

// DELETE /api/orgs/[orgId]/requests/[requestId]
export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;

  const { orgId, requestId } = await params;
  const check = await resolveAndAuthorise(orgId, requestId, auth.userId);
  if ("error" in check) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  await prisma.serviceRequest.delete({ where: { id: requestId } });
  return new Response(null, { status: 204 });
}
