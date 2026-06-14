import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { ServiceRequestManager } from "@/components/ServiceRequestManager";
import { TOPICS } from "@/lib/missionMatrix";

type Params = { params: Promise<{ orgId: string }> };

export default async function OrgDashboardPage({ params }: Params) {
  const { orgId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/sign-in");

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      description: true,
      email: true,
      city: true,
      createdByUserId: true,
      serviceRequests: {
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
      },
    },
  });

  if (!org) notFound();
  if (org.createdByUserId !== session.user.id) {
    // Not the admin — show read-only view in a future iteration.
    redirect("/");
  }

  const openCount = org.serviceRequests.filter((r) => r.status === "open").length;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      {/* Header */}
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-leaf-700">
          <span className="text-2xl" aria-hidden="true">🌱</span>
          <span className="text-lg font-semibold">Solarpunk Missions</span>
        </Link>
        <div className="flex items-center gap-3 text-sm text-leaf-700/80">
          <span>{session.user.email}</span>
          <SignOutButton />
        </div>
      </header>

      {/* Org profile */}
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-leaf-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">🏘️</span>
              <h1 className="text-2xl font-bold text-leaf-700">{org.name}</h1>
            </div>
            {org.description && (
              <p className="text-sm text-leaf-700/70">{org.description}</p>
            )}
            {org.city && (
              <p className="text-xs text-leaf-700/50">{org.city}</p>
            )}
          </div>
          <div className="shrink-0 rounded-xl bg-leaf-50 px-4 py-2 text-center">
            <p className="text-2xl font-bold text-leaf-700">{openCount}</p>
            <p className="text-xs text-leaf-700/60">open request{openCount !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </section>

      {/* Service request manager (add + list) */}
      <ServiceRequestManager
        orgId={org.id}
        topics={TOPICS as typeof TOPICS}
        initialRequests={org.serviceRequests.map((r) => ({
          ...r,
          expiresAt: r.expiresAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
