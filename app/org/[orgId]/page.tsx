import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { AppHeader } from "@/components/AppHeader";
import { Backdrop } from "@/components/Backdrop";
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
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-7">
      <Backdrop />
      <AppHeader username={profile.email} />

      <section className="rounded-3xl border border-solar-leafmd bg-solar-panel/70 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">🏘️</span>
              <h1 className="text-2xl font-bold text-solar-cream">{org.name}</h1>
            </div>
            {org.description && (
              <p className="text-sm text-solar-sage/80">{org.description}</p>
            )}
            {org.city && <p className="text-xs text-solar-sage/50">{org.city}</p>}
          </div>
          <div className="shrink-0 rounded-2xl bg-solar-field px-4 py-2 text-center ring-1 ring-solar-leafmd">
            <p className="text-2xl font-bold text-solar-cream">{openCount}</p>
            <p className="text-xs text-solar-sage/60">
              open request{openCount !== 1 ? "s" : ""}
            </p>
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
