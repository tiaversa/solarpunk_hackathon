import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { Backdrop } from "@/components/Backdrop";
import { Logo } from "@/components/Logo";
import { AppHeader } from "@/components/AppHeader";
import { Greeting } from "@/components/Greeting";
import { TopicVine } from "@/components/TopicVine";
import { CityField } from "@/components/CityField";
import type { TopicId } from "@/lib/missionMatrix";
import { type Level } from "@/lib/levels";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-7 px-7 py-16 text-center">
        <Backdrop />
        <Logo className="h-64 w-64" />
        <h1 className="sr-only">Green Quest</h1>
        <p className="text-sm leading-relaxed text-solar-sage/80">
          Pick a topic, climb six levels — Explore, Make, Improve, Experiment,
          Connect, Teach — one hands-on, community-grounded quest at a time.
        </p>
        <div className="flex w-full flex-col gap-3">
          <Link
            href="/sign-up"
            className="w-full rounded-field bg-solar-green px-5 py-4 text-base font-extrabold uppercase tracking-[0.2em] text-solar-cream transition hover:bg-solar-moss"
          >
            Get started
          </Link>
          <Link
            href="/sign-in"
            className="w-full rounded-field border-2 border-solar-green/60 px-5 py-4 text-base font-bold uppercase tracking-[0.2em] text-solar-sage transition hover:border-solar-green"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  // Look up the User profile (internal id) from auth user
  const { data: profile } = await supabase
    .from("User")
    .select("id, email, city")
    .eq("authId", user.id)
    .single();

  if (!profile) redirect("/sign-in");

  // Org admins go straight to their dashboard
  const { data: org } = await supabase
    .from("Organization")
    .select("id")
    .eq("createdByUserId", profile.id)
    .maybeSingle();
  if (org) redirect(`/org/${org.id}`);

  const { data: progressRows } = await supabase
    .from("Progress")
    .select("topic, currentLevel, completedLevels")
    .eq("userId", profile.id)
    .order("createdAt", { ascending: true });

  const progressByTopic = new Map<
    TopicId,
    { currentLevel: Level; completedLevels: number[] }
  >();
  for (const row of progressRows ?? []) {
    progressByTopic.set(row.topic as TopicId, {
      currentLevel: row.currentLevel as Level,
      completedLevels: row.completedLevels,
    });
  }

  const emailName =
    (profile.email ?? user.email ?? "explorer").split("@")[0] ?? "explorer";

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col gap-7 px-6 py-7">
      <Backdrop />
      <AppHeader username={user.email} />

      <div className="flex flex-col gap-1">
        <Greeting fallbackName={emailName} />
        <p className="text-sm text-solar-sage/70">
          Choose a topic to grow your next quest.
        </p>
      </div>

      <CityField initialCity={profile.city ?? ""} />

      <TopicVine
        progressByTopic={Object.fromEntries(progressByTopic) as Record<
          TopicId,
          { currentLevel: Level; completedLevels: number[] }
        >}
      />
    </main>
  );
}
