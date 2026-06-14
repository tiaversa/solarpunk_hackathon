import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helper";
import { randomUUID } from "node:crypto";

const CreateBody = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  website: z.string().url().optional(),
  city: z.string().max(100).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

// GET /api/orgs — list all organisations (public, paginated)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 50);

  const orgs = await prisma.organization.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
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

  const hasNext = orgs.length > limit;
  const items = hasNext ? orgs.slice(0, limit) : orgs;
  const nextCursor = hasNext ? items[items.length - 1]?.id : null;

  return NextResponse.json({ items, nextCursor });
}

// POST /api/orgs — create an organisation (requires auth)
export async function POST(req: Request) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;

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

  const { name, description, email, phone, website, city, lat, lng } =
    parsed.data;

  const existing = await prisma.organization.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An organisation with this email already exists" },
      { status: 409 },
    );
  }

  const org = await prisma.organization.create({
    data: {
      id: randomUUID(),
      name,
      description,
      email,
      phone,
      website,
      city,
      lat,
      lng,
      createdByUserId: auth.userId,
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
      createdAt: true,
    },
  });

  return NextResponse.json({ org }, { status: 201 });
}
