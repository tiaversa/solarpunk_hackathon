import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helper";

const PatchBody = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  phone: z.string().max(30).optional(),
  website: z.string().url().optional(),
  city: z.string().max(100).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

type Params = { params: Promise<{ orgId: string }> };

// GET /api/orgs/[orgId]
export async function GET(_req: Request, { params }: Params) {
  const { orgId } = await params;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      description: true,
      email: true,
      phone: true,
      website: true,
      city: true,
      lat: true,
      lng: true,
      createdAt: true,
      _count: { select: { serviceRequests: true } },
    },
  });

  if (!org) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }
  return NextResponse.json({ org });
}

// PATCH /api/orgs/[orgId] — update (only the creator may do this)
export async function PATCH(req: Request, { params }: Params) {
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

  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const updated = await prisma.organization.update({
    where: { id: orgId },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.phone !== undefined && { phone: parsed.data.phone }),
      ...(parsed.data.website !== undefined && { website: parsed.data.website }),
      ...(parsed.data.city !== undefined && { city: parsed.data.city }),
      ...(parsed.data.lat !== undefined && { lat: parsed.data.lat }),
      ...(parsed.data.lng !== undefined && { lng: parsed.data.lng }),
    },
    select: {
      id: true,
      name: true,
      description: true,
      email: true,
      phone: true,
      website: true,
      city: true,
      lat: true,
      lng: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ org: updated });
}
