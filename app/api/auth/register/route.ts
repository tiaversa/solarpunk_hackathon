import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  // Present only when registering as an organisation admin.
  org: z
    .object({
      name: z.string().min(2).max(120),
      description: z.string().max(500).optional(),
      city: z.string().max(100).optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RegisterBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists" },
      { status: 409 },
    );
  }

  if (parsed.data.org) {
    const orgEmailTaken = await prisma.organization.findUnique({
      where: { email },
    });
    if (orgEmailTaken) {
      return NextResponse.json(
        { error: "An organisation with that email already exists" },
        { status: 409 },
      );
    }
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const userId = randomUUID();

  if (parsed.data.org) {
    const { name, description, city } = parsed.data.org;
    const [user, org] = await prisma.$transaction([
      prisma.user.create({
        data: { id: userId, email, passwordHash },
        select: { id: true, email: true },
      }),
      prisma.organization.create({
        data: {
          id: randomUUID(),
          name,
          description,
          city,
          email,
          createdByUserId: userId,
        },
        select: { id: true, name: true },
      }),
    ]);
    return NextResponse.json({ user, org }, { status: 201 });
  }

  const user = await prisma.user.create({
    data: { id: userId, email, passwordHash },
    select: { id: true, email: true },
  });
  return NextResponse.json({ user }, { status: 201 });
}
