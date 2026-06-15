"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { createClient } from "@/lib/supabase-client";
import { getProgress } from "@/lib/api-client";
import { Backdrop } from "@/components/Backdrop";
import { Logo } from "@/components/Logo";
import { AppHeader } from "@/components/AppHeader";
import { Greeting } from "@/components/Greeting";
import { TopicVine } from "@/components/TopicVine";
import { CityField } from "@/components/CityField";
import type { TopicId } from "@/lib/missionMatrix";
import { type Level } from "@/lib/levels";

type Profile = { id: string; email: string | null; city: string | null };

export default function HomePage() {
  const { user, loading: authLoading } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [progressByTopic, setProgressByTopic] = useState<
    Record<TopicId, { currentLevel: Level; completedLevels: number[] }>
  >({} as Record<TopicId, { currentLevel: Level; completedLevels: number[] }>);

  useEffect(() => {
    if (authLoading || !user) return;

    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("User")
      .select("id, email, city")
      .eq("authId", user.id)
      .single()
      .then(async ({ data: profileData }) => {
        if (cancelled) return;
        if (!profileData) { router.push("/sign-in"); return; }
        setProfile(profileData as Profile);

        const { data: org } = await supabase
          .from("Organization")
          .select("id")
          .eq("createdByUserId", profileData.id)
          .maybeSingle();

        if (cancelled) return;
        if (org) { router.push(`/org/_/?id=${org.id}`); return; }

        getProgress()
          .then((rows) => {
            if (cancelled) return;
            const map: Record<string, { currentLevel: Level; completedLevels: number[] }> = {};
            for (const row of rows) {
              map[row.topic] = {
                currentLevel: row.currentLevel as Level,
                completedLevels: row.completedLevels,
              };
            }
            setProgressByTopic(
              map as Record<TopicId, { currentLevel: Level; completedLevels: number[] }>,
            );
          })
          .catch(() => {});
      });

    return () => { cancelled = true; };
  }, [user, authLoading, router]);

  if (authLoading || (user && !profile)) {
    return (
      <main className="relative mx-auto flex min-h-screen max-w-md items-center justify-center">
        <Backdrop />
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-solar-green border-t-transparent" />
      </main>
    );
  }

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

  const emailName =
    (profile!.email ?? user.email ?? "explorer").split("@")[0] ?? "explorer";

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col gap-7 px-6 py-7">
      <Backdrop />
      <AppHeader username={user.email ?? undefined} />

      <div className="flex flex-col gap-1">
        <Greeting fallbackName={emailName} />
        <p className="text-sm text-solar-sage/70">
          Choose a topic to grow your next quest.
        </p>
      </div>

      <CityField initialCity={profile!.city ?? ""} />

      <TopicVine progressByTopic={progressByTopic} />
    </main>
  );
}
