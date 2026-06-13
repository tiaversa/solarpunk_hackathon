import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helper";

const Body = z
  .object({
    interests: z.array(z.string().min(1).max(40)).max(20).optional(),
    preferredDuration: z
      .union([z.enum(["short", "medium", "long"]), z.null()])
      .optional(),
  })
  .refine(
    (v) => v.interests !== undefined || v.preferredDuration !== undefined,
    { message: "Provide at least one of interests or preferredDuration" },
  );

export async function PATCH(req: Request) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  // Build a tight update — Prisma will not emit `field = undefined`, so
  // unspecified fields stay as-is. The `invalidate_pref_summary_on_user_update`
  // trigger handles cache invalidation for us when either field changes.
  const user = await prisma.user.update({
    where: { id: auth.userId },
    data: {
      ...(parsed.data.interests !== undefined && {
        interests: parsed.data.interests,
      }),
      ...(parsed.data.preferredDuration !== undefined && {
        preferredDuration: parsed.data.preferredDuration,
      }),
    },
    select: {
      id: true,
      email: true,
      city: true,
      interests: true,
      preferredDuration: true,
    },
  });

  return NextResponse.json({ user });
}
