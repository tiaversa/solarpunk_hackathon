"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { createClient } from "@/lib/supabase-client";
import { AppHeader } from "@/components/AppHeader";
import { Backdrop } from "@/components/Backdrop";
import { ServiceRequestManager } from "@/components/ServiceRequestManager";
import { TOPICS } from "@/lib/missionMatrix";

type Org = {
  id: string;
  name: string;
  description: string | null;
  email: string | null;
  city: string | null;
  createdByUserId: string;
};

type ServiceRequest = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  capacityTotal: number | null;
  capacityRemaining: number | null;
  expiresAt: string | null;
  status: string;
  createdAt: string;
};

export default function OrgPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useSession();
  const [org, setOrg] = useState<Org | null>(null);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);

  const orgId = searchParams?.get("id") ?? "";

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/sign-in"); return; }

    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data: profile } = await supabase
        .from("User")
        .select("id, email")
        .eq("authId", user.id)
        .single();
      if (cancelled) return;
      if (!profile) { router.push("/sign-in"); return; }

      setUserEmail(profile.email ?? user.email);

      const { data: orgData } = await supabase
        .from("Organization")
        .select("id, name, description, email, city, createdByUserId")
        .eq("id", orgId)
        .single();

      if (cancelled) return;
      if (!orgData) { router.push("/"); return; }
      if (orgData.createdByUserId !== profile.id) { router.push("/"); return; }

      setOrg(orgData as Org);

      const { data: serviceRequests } = await supabase
        .from("ServiceRequest")
        .select(
          "id, category, title, description, lat, lng, radiusKm, capacityTotal, capacityRemaining, expiresAt, status, createdAt",
        )
        .eq("organizationId", orgId)
        .order("createdAt", { ascending: false });

      if (cancelled) return;
      setRequests((serviceRequests ?? []) as ServiceRequest[]);
    })();

    return () => { cancelled = true; };
  }, [user, authLoading, orgId, router]);

  if (authLoading || (user && !org)) {
    return (
      <main className="relative mx-auto flex min-h-screen max-w-md items-center justify-center">
        <Backdrop />
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-solar-green border-t-transparent" />
      </main>
    );
  }

  if (!org) return null;

  const openCount = requests.filter((r) => r.status === "open").length;

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-7">
      <Backdrop />
      <AppHeader username={userEmail} />

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
          id: r.id,
          category: r.category,
          title: r.title,
          description: r.description ?? "",
          lat: r.lat ?? 0,
          lng: r.lng ?? 0,
          radiusKm: r.radiusKm ?? 0,
          capacityTotal: r.capacityTotal ?? 0,
          capacityRemaining: r.capacityRemaining ?? 0,
          expiresAt: r.expiresAt ?? null,
          status: r.status,
          createdAt: r.createdAt,
        }))}
      />
    </main>
  );
}
