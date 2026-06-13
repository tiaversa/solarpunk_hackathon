import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Resolve the current user id from the NextAuth session, or return a 401
 * NextResponse the route handler can short-circuit on.
 *
 *   const auth = await requireUserId();
 *   if (auth.response) return auth.response;
 *   const userId = auth.userId;
 */
export async function requireUserId(): Promise<
  | { userId: string; response?: never }
  | { userId?: never; response: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      response: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    };
  }
  return { userId: session.user.id };
}
