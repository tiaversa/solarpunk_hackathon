import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { ServiceRequestManager } from "@/components/ServiceRequestManager";
import { TOPICS } from "@/lib/missionMatrix";

type Params = { params: Promise<{ orgId: string }> };

export default async function OrgDashboardPage({ params }: Params) {
  const { orgId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("User")
    .select("id, email")
    .eq("authId", user.id)
    .single();
  if (!profile) redirect("/sign-in");

  const { data: org } = await supabase
    .from("Organization")
    .select("id, name, description, email, city, createdByUserId")
    .eq("id", orgId)
    .single();

  if (!org) notFound();
  if (org.createdByUserId !== profile.id) redirect("/");

  const { data: serviceRequests } = await supabase
    .from("ServiceRequest")
    .select("id, category, title, description, lat, lng, radiusKm, capacityTotal, capacityRemaining, expiresAt, status, createdAt")
    .eq("organizationId", orgId)
    .order("createdAt", { ascending: false });

  const requests = serviceRequests ?? [];
  const openCount = requests.filter((r) => r.status === "open").length;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-leaf-700">
          <span className="text-2xl" aria-hidden="true">🌱</span>
          <span className="text-lg font-semibold">Solarpunk Missions</span>
        </Link>
        <div className="flex items-center gap-3 text-sm text-leaf-700/80">
          <span>{profile.email}</span>
          <SignOutButton />
        </div>
      </header>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-leaf-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">🏘️</span>
              <h1 className="text-2xl font-bold text-leaf-700">{org.name}</h1>
            </div>
            {org.description && <p className="text-sm text-leaf-700/70">{org.description}</p>}
            {org.city && <p className="text-xs text-leaf-700/50">{org.city}</p>}
          </div>
          <div className="shrink-0 rounded-xl bg-leaf-50 px-4 py-2 text-center">
            <p className="text-2xl font-bold text-leaf-700">{openCount}</p>
            <p className="text-xs text-leaf-700/60">open request{openCount !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </section>

      <ServiceRequestManager
        orgId={org.id}
        topics={TOPICS as typeof TOPICS}
        initialRequests={requests.map((r) => ({
          ...r,
          expiresAt: r.expiresAt ?? null,
          createdAt: r.createdAt,
        }))}
      />
    </main>
  );
}
