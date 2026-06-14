import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getServerSupabase } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { Backdrop } from "@/components/Backdrop";
import { CitySideQuestList, type SideQuest } from "@/components/CitySideQuestList";

export const dynamic = "force-dynamic";

type RawRequest = {
  id: string;
  category: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  radiusKm: number;
  capacityTotal: number;
  capacityRemaining: number;
  expiresAt: string | null;
  status: string;
  createdAt: string;
  Organization: {
    name: string;
    city: string | null;
    email: string | null;
    website: string | null;
  } | null;
};

export default async function CitySideQuestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?callbackUrl=/side-quests");

  const { data: profile } = await supabase
    .from("User")
    .select("id, email, city")
    .eq("authId", user.id)
    .single();
  if (!profile) redirect("/sign-in");

  // Service-role read: open help requests from every organisation. The list is
  // filtered/sorted by proximity on the client once GPS is available.
  const admin = getServerSupabase();
  const { data: rows } = await admin
    .from("ServiceRequest")
    .select(
      "id, category, title, description, lat, lng, radiusKm, capacityTotal, capacityRemaining, expiresAt, status, createdAt, Organization(name, city, email, website)",
    )
    .eq("status", "open")
    .gt("capacityRemaining", 0)
    .order("createdAt", { ascending: false })
    .limit(200);

  const now = Date.now();
  const quests: SideQuest[] = ((rows ?? []) as RawRequest[])
    .filter((r) => !r.expiresAt || new Date(r.expiresAt).getTime() > now)
    .map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      description: r.description,
      lat: r.lat,
      lng: r.lng,
      radiusKm: r.radiusKm,
      capacityRemaining: r.capacityRemaining,
      capacityTotal: r.capacityTotal,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      orgName: r.Organization?.name ?? "A community organisation",
      orgCity: r.Organization?.city ?? null,
      orgEmail: r.Organization?.email ?? null,
      orgWebsite: r.Organization?.website ?? null,
    }));

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-7">
      <Backdrop />
      <AppHeader back={{ href: "/", label: "Topics" }} username={profile.email} />

      <section className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-solar-cream">City side quests</h1>
        <p className="text-sm text-solar-sage/70">
          Real requests for help from organisations near you. Lend a hand and
          turn your skills into local impact.
        </p>
      </section>

      <CitySideQuestList quests={quests} userCity={profile.city ?? null} />
    </main>
  );
}
